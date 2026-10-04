import { timingSafeEqual } from "node:crypto";
import { escapeHtml } from "@/lib/email/registration-code";
import { unsubscribeSignature } from "@/lib/pesan/tautan";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { emailHash, inviteSecretReady, verifyInviteUnsubscribe } from "@/lib/undangan/tanda";

/**
 * Berhenti menerima email Pesan peserta untuk satu acara.
 *
 * GET menampilkan halaman dengan satu tombol; POST yang mencatatnya. Membuka
 * tautan saja tidak cukup, karena pemindai tautan email kantor membuka setiap
 * URL lebih dulu. POST juga yang dipanggil klien email lewat header
 * `List-Unsubscribe-Post` (berhenti satu klik, RFC 8058).
 *
 * Tautan ditandatangani (acara + peserta) dan tidak perlu masuk. Yang berhenti
 * hanya kiriman Pesan peserta acara ini; email kode peserta dan tautan masuk
 * yang diminta sendiri tetap terkirim.
 */

type Hasil = { ok: true; name: string; eventName: string } | { ok: false };

/**
 * Tamu undangan (`u` = id undangan) ditandatangani terpisah dengan
 * INVITE_LINK_SECRET: `berhenti-undangan:<event>:<invitation>`. Berhenti dicatat
 * di undangannya dan di penekanan per acara, supaya bertahan walau tamu
 * dihapus lalu diimpor ulang, dan ikut ke pesertanya bila ia mendaftar.
 */
async function periksaTamu(url: URL): Promise<Hasil & { eventId?: string; invitationId?: string; email?: string | null }> {
  const eventId = url.searchParams.get("e") ?? "";
  const invitationId = url.searchParams.get("u") ?? "";
  const tanda = url.searchParams.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId) || !/^[0-9a-f-]{36}$/i.test(invitationId) || !tanda || !inviteSecretReady()) return { ok: false };
  if (!verifyInviteUnsubscribe(eventId, invitationId, tanda)) return { ok: false };
  const client = getSupabaseServiceClient();
  const [{ data: u }, { data: e }] = await Promise.all([
    client.from("event_invitations").select("name,email_norm").eq("id", invitationId).eq("event_id", eventId).maybeSingle(),
    client.from("events").select("name").eq("id", eventId).maybeSingle(),
  ]);
  if (!e) return { ok: false };
  // Undangan yang sudah dibersihkan tetap bisa berhenti: halaman tanpa nama.
  const tamu = u as { name: string; email_norm: string | null } | null;
  return { ok: true, name: tamu?.name ?? "", eventName: (e as { name: string }).name, eventId, invitationId, email: tamu?.email_norm ?? null };
}

async function periksa(url: URL): Promise<Hasil & { eventId?: string; participantId?: string }> {
  const eventId = url.searchParams.get("e") ?? "";
  const participantId = url.searchParams.get("p") ?? "";
  const tanda = url.searchParams.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId) || !/^[0-9a-f-]{36}$/i.test(participantId) || !tanda) return { ok: false };
  const harapan = unsubscribeSignature(eventId, participantId);
  if (tanda.length !== harapan.length || !timingSafeEqual(Buffer.from(tanda), Buffer.from(harapan))) return { ok: false };
  const client = getSupabaseServiceClient();
  const [{ data: p }, { data: e }] = await Promise.all([
    client.from("participants").select("name").eq("id", participantId).eq("event_id", eventId).maybeSingle(),
    client.from("events").select("name").eq("id", eventId).maybeSingle(),
  ]);
  if (!p || !e) return { ok: false };
  return { ok: true, name: (p as { name: string }).name, eventName: (e as { name: string }).name, eventId, participantId };
}

function halaman(judul: string, isi: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(judul)}</title></head>
<body style="margin:0;padding:24px;background:#F5F4F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17211D;">
<main style="max-width:480px;margin:48px auto;background:#fff;border:1px solid #D9DDD7;border-radius:12px;padding:32px;">
<h1 style="margin:0;font-size:22px;line-height:1.3;">${escapeHtml(judul)}</h1>${isi}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

const TIDAK_SAH = () => halaman("Tautan tidak berlaku", `<p style="font-size:15px;line-height:1.6;">Tautan ini tidak lengkap atau sudah tidak berlaku. Hubungi panitia acara bila Anda ingin berhenti menerima email.</p>`, 400);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hasil = url.searchParams.has("u") ? await periksaTamu(url) : await periksa(url);
  if (!hasil.ok) return TIDAK_SAH();
  return halaman(
    "Berhenti menerima email?",
    `<p style="font-size:15px;line-height:1.6;">${hasil.name ? `${escapeHtml(hasil.name)}, a` : "A"}nda tidak akan lagi menerima undangan dan kabar lewat email dari panitia <b>${escapeHtml(hasil.eventName)}</b>. Acara lain tidak terpengaruh.</p>
<form method="post" action="${escapeHtml(url.pathname + url.search)}" style="margin-top:24px;"><button type="submit" style="min-height:48px;padding:0 24px;border:0;border-radius:8px;background:#2649D0;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">Berhenti menerima email</button></form>`,
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("u")) {
    const tamu = await periksaTamu(url);
    if (!tamu.ok || !tamu.invitationId) return TIDAK_SAH();
    const client = getSupabaseServiceClient();
    await client
      .from("event_invitations")
      .update({ opted_out_at: new Date().toISOString() } as never)
      .eq("id", tamu.invitationId)
      .eq("event_id", tamu.eventId!)
      .is("opted_out_at", null);
    if (tamu.email) {
      await client
        .from("event_email_suppressions")
        .upsert({ event_id: tamu.eventId, email_hash: emailHash(tamu.email), reason: "berhenti" } as never, { onConflict: "event_id,email_hash" });
    }
    return halaman("Anda sudah berhenti", `<p style="font-size:15px;line-height:1.6;">Panitia ${escapeHtml(tamu.eventName)} tidak akan mengirim undangan lewat email lagi kepada Anda. Bila ini keliru, hubungi panitia.</p>`);
  }
  const hasil = await periksa(url);
  if (!hasil.ok || !hasil.participantId) return TIDAK_SAH();
  await getSupabaseServiceClient()
    .from("participants")
    .update({ email_opt_out_at: new Date().toISOString() } as never)
    .eq("id", hasil.participantId)
    .eq("event_id", hasil.eventId!)
    .is("email_opt_out_at", null);
  return halaman("Anda sudah berhenti", `<p style="font-size:15px;line-height:1.6;">Panitia ${escapeHtml(hasil.eventName)} tidak akan mengirim undangan dan kabar lewat email lagi kepada Anda. Bila ini keliru, hubungi panitia.</p>`);
}
