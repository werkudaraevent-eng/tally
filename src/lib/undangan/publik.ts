import { invitationFrom, sendEmail, eventSender } from "@/lib/email/client";
import { publicEventName, type EventRow } from "@/lib/domain";
import { DEFAULT_CONTENT, fieldValues, renderEmail } from "@/lib/pesan/isi";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { escapeHtml } from "@/lib/email/registration-code";
import { invitationSendingReady, invitationUrl, loadInvitation, type InvitationRow } from "./data";
import { normalizeInviteEmail } from "./email";
import { emailHash, inviteSecretReady, inviteUnsubscribeSignature, parseInviteToken, verifyInviteToken } from "./tanda";

/**
 * Sisi publik tamu undangan: membaca tautan pribadi, batas laju, kirim ulang
 * undangan, dan pemberitahuan "undangan Anda dipakai dengan email lain".
 */

/** IP klien di belakang proxy Vercel: elemen PALING KIRI x-forwarded-for. */
export function requestIp(headers: Headers): string | null {
  const chain = headers.get("x-forwarded-for");
  if (chain) return chain.split(",")[0].trim() || null;
  return headers.get("x-real-ip");
}

type JenisLaju = "kirim_ulang" | "token_salah" | "penanda";

/** Jumlah jejak satu jenis dari IP ini dalam jendela waktu. */
export async function rateCount(
  eventId: string,
  kind: JenisLaju,
  by: { ip?: string | null; emailHash?: string; onlyWithEmail?: boolean },
  sinceMs: number,
) {
  let kueri = getSupabaseServiceClient()
    .from("invitation_rate_events")
    .select("id", { head: true, count: "exact" })
    .eq("event_id", eventId)
    .eq("kind", kind)
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  if (by.ip) kueri = kueri.eq("ip", by.ip);
  if (by.emailHash) kueri = kueri.eq("email_hash", by.emailHash);
  if (by.onlyWithEmail) kueri = kueri.not("email_hash", "is", null);
  const { count } = await kueri;
  return count ?? 0;
}

export async function rateNote(eventId: string, kind: JenisLaju, by: { ip?: string | null; emailHash?: string | null }) {
  await getSupabaseServiceClient()
    .from("invitation_rate_events")
    .insert({ event_id: eventId, kind, ip: by.ip ?? null, email_hash: by.emailHash ?? null } as never);
}

/** Batas token salah per IP per jam. Lebih dari ini, setiap token dianggap tidak sah tanpa dibaca. */
const TOKEN_SALAH_PER_JAM = 30;

export type InviteState =
  | { state: "none" }
  | { state: "invalid" }
  | { state: "used" }
  | { state: "ok"; inv: InvitationRow };

/**
 * Keadaan tautan pribadi dari `?undangan=`. Tanda tangan diperiksa terhadap
 * nonce di database, jadi "Buat tautan baru" langsung mematikan yang lama.
 * Token salah dicatat per IP; IP yang terlalu sering salah tidak lagi
 * dilayani pencarian.
 */
export async function readInvite(event: Pick<EventRow, "id">, token: string | null | undefined, ip: string | null): Promise<InviteState> {
  if (!token) return { state: "none" };
  const bagian = parseInviteToken(token);
  if (!bagian || !inviteSecretReady()) return { state: "invalid" };
  if (ip && (await rateCount(event.id, "token_salah", { ip }, 3_600_000)) >= TOKEN_SALAH_PER_JAM) return { state: "invalid" };
  const inv = await loadInvitation(event.id, bagian.id);
  if (!inv || !verifyInviteToken(token, event.id, inv.link_nonce)) {
    await rateNote(event.id, "token_salah", { ip }).catch(() => undefined);
    return { state: "invalid" };
  }
  if (inv.registered_at || inv.rejected_at) return { state: "used" };
  return { state: "ok", inv };
}

/**
 * Kirim ulang undangan dari halaman "Khusus undangan". Dijalankan di latar
 * belakang SETELAH jawaban yang selalu sama dikirim, supaya isi dan lama
 * jawaban tidak membocorkan siapa yang ada di daftar.
 *
 * Hanya mengirim tautan yang SUDAH ADA ke alamat yang DIUNDANG; tidak pernah
 * ke alamat lain dan tidak pernah membuat tautan baru. Dilewati: berhenti,
 * memantul, sudah mendaftar, dan batas per email (1 per 10 menit, 3 per hari)
 * serta batas harian acara.
 *
 * Setiap permintaan dicatat sekali untuk batas per IP, tetapi hash email hanya
 * ikut dicatat bila benar-benar mengirim. Batas per email dan batas acara
 * menghitung kiriman nyata saja, jadi permintaan asal tidak bisa menghabiskan
 * jatah tamu sungguhan.
 */
const BATAS_HARIAN_ACARA = 300;

export async function resendInvitation(event: EventRow, rawEmail: string, origin: string, ip: string | null) {
  let terkirimKe: string | null = null;
  try {
    const inv = await undanganUntukKirimUlang(event, rawEmail);
    if (!inv) return;
    terkirimKe = inv.hash;
    await rateNote(event.id, "kirim_ulang", { ip, emailHash: inv.hash });
    await kirimUlang(event, inv, origin);
  } finally {
    if (!terkirimKe) await rateNote(event.id, "kirim_ulang", { ip }).catch(() => undefined);
  }
}

async function undanganUntukKirimUlang(event: EventRow, rawEmail: string) {
  const norm = normalizeInviteEmail(rawEmail);
  if (!norm.ok || !norm.email || !inviteSecretReady()) return null;
  const hash = emailHash(norm.email);
  const [per10, perHari, acara] = await Promise.all([
    rateCount(event.id, "kirim_ulang", { emailHash: hash }, 10 * 60_000),
    rateCount(event.id, "kirim_ulang", { emailHash: hash }, 86_400_000),
    rateCount(event.id, "kirim_ulang", { onlyWithEmail: true }, 86_400_000),
  ]);
  if (per10 >= 1 || perHari >= 3 || acara >= BATAS_HARIAN_ACARA) return null;
  if (!invitationSendingReady().ok) return null;

  const client = getSupabaseServiceClient();
  const [{ data }, { data: tekan }] = await Promise.all([
    client
      .from("event_invitations")
      .select("id,event_id,name,email,company,link_nonce,registered_at,rejected_at,opted_out_at,email_invalid_at")
      .eq("event_id", event.id)
      .eq("email_norm", norm.email)
      .is("deleted_at", null)
      .maybeSingle(),
    client.from("event_email_suppressions").select("reason").eq("event_id", event.id).eq("email_hash", hash).maybeSingle(),
  ]);
  const inv = data as (Pick<InvitationRow, "id" | "event_id" | "name" | "email" | "company" | "link_nonce" | "registered_at" | "rejected_at" | "opted_out_at" | "email_invalid_at">) | null;
  if (!inv || !inv.email || inv.registered_at || inv.rejected_at || inv.opted_out_at || inv.email_invalid_at || tekan) return null;
  return { ...inv, email: inv.email, hash };
}

async function kirimUlang(event: EventRow, inv: Pick<InvitationRow, "id" | "event_id" | "name" | "company" | "link_nonce"> & { email: string }, origin: string) {
  const nama = publicEventName(event);
  const berhenti = `${origin}/api/pesan/berhenti?e=${event.id}&u=${inv.id}&s=${inviteUnsubscribeSignature(event.id, inv.id)}`;
  const awal = DEFAULT_CONTENT.invitation;
  const isi = renderEmail({
    kind: "invitation",
    subject: awal.subject,
    body: awal.body,
    eventName: nama,
    values: fieldValues(event, { name: inv.name, company: inv.company }),
    actionUrl: invitationUrl(origin, event.slug, inv),
    unsubscribeUrl: berhenti,
  });
  await sendEmail({
    eventId: event.id,
    to: inv.email,
    ...isi,
    from: invitationFrom(),
    headers: { "List-Unsubscribe": `<${berhenti}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
}

/**
 * Pemilik undangan diberi tahu bila tautannya dipakai mendaftar dengan email
 * lain (tautan yang diteruskan). Pendaftaran itu sendiri masuk Menunggu.
 */
export async function notifyInviteUsedElsewhere(event: EventRow, invitationId: string) {
  if (!invitationSendingReady().ok) return;
  const { data } = await getSupabaseServiceClient()
    .from("event_invitations")
    .select("name,email,opted_out_at,email_invalid_at")
    .eq("id", invitationId)
    .eq("event_id", event.id)
    .maybeSingle();
  const inv = data as { name: string; email: string | null; opted_out_at: string | null; email_invalid_at: string | null } | null;
  if (!inv?.email || inv.opted_out_at || inv.email_invalid_at) return;
  const nama = publicEventName(event);
  const kontak = (await eventSender(event.id).catch(() => null))?.replyTo ?? null;
  const kalimat = [
    `Halo ${inv.name},`,
    `Tautan undangan Anda ke ${nama} baru saja dipakai untuk mendaftar dengan alamat email lain. Pendaftaran itu menunggu persetujuan panitia.`,
    kontak
      ? `Bila itu bukan Anda atau orang yang Anda tunjuk, balas email ini atau hubungi panitia di ${kontak}.`
      : "Bila itu bukan Anda atau orang yang Anda tunjuk, balas email ini supaya panitia bisa memeriksanya.",
  ];
  const html = `<!doctype html><html lang="id"><body style="margin:0;padding:24px;background:#F5F4F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17211D;">
<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D9DDD7;padding:32px;">
<p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#2649D0;font-weight:600;">${escapeHtml(nama)}</p>
${kalimat.map((k) => `<p style="margin:16px 0 0;font-size:15px;line-height:1.6;">${escapeHtml(k)}</p>`).join("")}
</div></body></html>`;
  await sendEmail({
    eventId: event.id,
    to: inv.email,
    subject: `Undangan Anda ke ${nama} dipakai dengan email lain`,
    html,
    text: [nama, "", ...kalimat].join("\n\n"),
    from: invitationFrom(),
  });
}
