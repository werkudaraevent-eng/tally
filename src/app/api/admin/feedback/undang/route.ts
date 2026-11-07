import { createHash } from "node:crypto";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { publicEventName, type EventLandingConfig } from "@/lib/domain";
import { linkOrigin } from "@/lib/domain-klien/asal";
import { BATCH_MAX, sendEmailBatchDetailed } from "@/lib/email/client";
import { bahasaUtamaAcara } from "@/lib/email/konfirmasi/bahasa";
import { alamatKilasBalik } from "@/lib/kilas-balik/alamat";
import { muatSetelan } from "@/lib/kilas-balik/server";
import { bolehIkut, statusBuka, type Penonton } from "@/lib/kilas-balik/setelan";
import { ISI_MAX, JUDUL_MAX, UNDANGAN_AWAL, emailUndangan, teksAwal } from "@/lib/kilas-balik/undangan";
import { warnaKilas } from "@/lib/kilas-balik/warna";
import { klien, semuaBaris } from "@/lib/logistik/server";
import { memberConfig } from "@/lib/member/account";
import { allowedByList, messagingAllowlist, normalizeAddress } from "@/lib/pesan/alamat";
import { PILIH_MAX } from "@/lib/sasaran-pengumuman";

/**
 * Admin > Feedback > Invite or remind.
 *
 * GET  berapa peserta belum menjawab, berapa tanpa email, kiriman terakhir,
 *      dan teks bawaan (undangan bila belum pernah, pengingat bila sudah).
 * POST kirim ke semua yang belum menjawab sekarang: selalu lonceng di area
 *      peserta (pengumuman untuk peserta terpilih, dengan tautan ke Kilas
 *      balik), dan bila dipilih juga email pribadi. Yang sudah menjawab tidak
 *      pernah ikut, jadi menekan lagi besok = pengingat untuk sisanya.
 *
 * Tidak ada kiriman otomatis. Daftar dihitung ulang di server saat POST.
 * Riwayat kiriman dicatat di audit_logs ("feedback_invite"), tanpa SQL baru.
 */

export const maxDuration = 60;

const AKSI = "feedback_invite";

type Orang = { id: string; name: string; email: string | null; participant_type: string | null };
type Calon = { id: string; nama: string; email: string | null };

/** Yang belum menjawab. Mode uji: hanya Tipe dengan Committee access. */
async function hitung(eventId: string, audience: Penonton, committee: unknown): Promise<Calon[] | null> {
  const db = klien();
  const [peserta, jawab, akun] = await Promise.all([
    semuaBaris<Orang>(() => db.from("participants").select("id,name,email,participant_type").eq("event_id", eventId).is("source_removed_at", null).order("id")),
    semuaBaris<{ participant_id: string }>(() => db.from("feedback_responses" as never).select("participant_id").eq("event_id", eventId).order("participant_id")),
    semuaBaris<{ participant_id: string; email: string | null }>(() =>
      db.from("participant_accounts").select("participant_id,email").eq("event_id", eventId).not("participant_id", "is", null).order("id")),
  ]);
  if (!peserta || !jawab || !akun) return null;
  const sudah = new Set(jawab.map((j) => j.participant_id));
  const emailAkun = new Map<string, string>();
  for (const a of akun) if (a.email && !emailAkun.has(a.participant_id)) emailAkun.set(a.participant_id, a.email);
  return peserta
    .filter((p) => !sudah.has(p.id) && bolehIkut(audience, committee, p.participant_type))
    .map((p) => ({ id: p.id, nama: p.name, email: normalizeAddress(p.email) ?? normalizeAddress(emailAkun.get(p.id)) }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

async function riwayat(eventId: string) {
  const { data } = await klien()
    .from("audit_logs")
    .select("created_at,payload")
    .eq("event_id", eventId)
    .eq("action", AKSI)
    .order("created_at", { ascending: false })
    .limit(5);
  return ((data ?? []) as { created_at: string; payload: Record<string, unknown> | null }[]).map((r) => ({
    waktu: r.created_at,
    lonceng: Number(r.payload?.lonceng ?? 0),
    terkirim: Number(r.payload?.terkirim ?? 0),
    email: r.payload?.saluran === "portal_email",
  }));
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const muat = await muatSetelan(event.id).catch(() => null);
  if (!muat?.siap) return Response.json({ siap: false });
  const [calon, lalu] = await Promise.all([hitung(event.id, muat.setelan.audience, memberConfig(event)?.committee), riwayat(event.id)]);
  if (!calon) return apiError("INTERNAL_ERROR", 500);
  const bahasa = bahasaUtamaAcara(event.landing_config as EventLandingConfig | null);
  return Response.json({
    siap: true,
    status: statusBuka(muat.setelan, new Date()),
    audience: muat.setelan.audience,
    belum: calon.length,
    tanpa_email: calon.filter((c) => !c.email).length,
    riwayat: lalu,
    teks: teksAwal(bahasa, lalu.length > 0),
    tautan_label: UNDANGAN_AWAL[bahasa].link,
    mode_uji: messagingAllowlist().mode !== "off",
  });
}

const kirimSchema = z.object({
  saluran: z.enum(["portal", "portal_email"]),
  title: z.string().trim().min(1).max(JUDUL_MAX),
  body: z.string().trim().min(1).max(ISI_MAX),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = kirimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { saluran, title, body } = parsed.data;
  const denganEmail = saluran === "portal_email";
  const event = auth.scope.event;
  const daftarUji = messagingAllowlist();
  if (denganEmail && daftarUji.mode === "blocked") return apiError("MESSAGING_BLOCKED", 403);

  const muat = await muatSetelan(event.id).catch(() => null);
  if (!muat?.siap) return apiError("VALIDATION_ERROR", 409, { message: "Feedback isn't set up on this server yet." });
  if (statusBuka(muat.setelan, new Date()) !== "open") {
    return apiError("VALIDATION_ERROR", 422, { message: "Feedback isn't open for participants. Turn it on and check the open and close times first." });
  }
  if (!memberConfig(event)) return apiError("VALIDATION_ERROR", 422, { message: "The participant area is off, so participants can't open the link." });
  // Tekan dua kali (atau dua admin bersamaan): kiriman kurang dari 2 menit lalu ditolak,
  // supaya lonceng tidak muncul dua kali. Email sudah dijaga kunci idempotensi Resend.
  const terakhir = (await riwayat(event.id))[0];
  if (terakhir && Date.now() - Date.parse(terakhir.waktu) < 120_000) {
    return apiError("VALIDATION_ERROR", 409, { message: "This was just sent. Wait two minutes before sending a reminder." });
  }
  const calon = await hitung(event.id, muat.setelan.audience, memberConfig(event)?.committee);
  if (!calon) return apiError("INTERNAL_ERROR", 500);
  if (calon.length === 0) return Response.json({ lonceng: 0, terkirim: 0, gagal: 0, tanpa_email: 0, galat: null });

  const landing = event.landing_config as EventLandingConfig | null;
  const bahasa = bahasaUtamaAcara(landing);
  const origin = await linkOrigin(request, event.id);
  const url = `${origin}${alamatKilasBalik(event.slug)}`;
  const eventName = publicEventName(event);
  const db = klien();

  // 1. Lonceng di area peserta: pengumuman untuk peserta terpilih, 500 per pengumuman.
  const idPengumuman: string[] = [];
  for (let i = 0; i < calon.length; i += PILIH_MAX) {
    const { data, error } = await db.from("event_announcements").insert({
      event_id: event.id,
      title,
      body,
      link_url: url,
      link_label: UNDANGAN_AWAL[bahasa].link,
      audience: "pilih",
      audience_ids: calon.slice(i, i + PILIH_MAX).map((c) => c.id),
      created_by: auth.user.id,
    } as never).select("id").single();
    if (error || !data) return apiError(idPengumuman.length ? "INTERNAL_ERROR" : "ANNOUNCEMENT_AUDIENCE_NOT_READY", idPengumuman.length ? 500 : 409);
    idPengumuman.push((data as { id: string }).id);
  }

  // 2. Email pribadi (bila dipilih). Di luar produksi hanya alamat di daftar uji.
  const keEmail = denganEmail ? calon.filter((c): c is Calon & { email: string } => c.email !== null && allowedByList(c.email, daftarUji)) : [];
  // Tombol email bertulisan putih: pakai latar bila gelap, tinta bila merek terang.
  const tema = warnaKilas(landing, muat.setelan.theme);
  const warna = tema.latarTeks === "#ffffff" ? tema.latar : tema.tinta;
  let terkirim = 0;
  let gagal = 0;
  let galat: string | null = null;
  // Kunci per hari: tekan dua kali bersamaan tidak mengirim dua kali, pengingat besok tetap terkirim.
  const hari = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < keEmail.length; i += BATCH_MAX) {
    const potong = keEmail.slice(i, i + BATCH_MAX);
    const isi = potong.map((c) => ({ to: c.email, ...emailUndangan({ bahasa, eventName, nama: c.nama, title, body, url, warna }) }));
    const kunci = createHash("sha256").update(`kilas-undang:${event.id}:${hari}:${potong.map((c) => `${c.id}=${c.email}`).join(",")}`).digest("hex");
    const jawab = await sendEmailBatchDetailed(isi, kunci, event.id);
    if (jawab.kind === "not_configured") {
      gagal += potong.length;
      galat = "Email isn't set up on this server.";
      continue;
    }
    if (jawab.kind === "failed") {
      gagal += potong.length;
      galat = jawab.error;
      continue;
    }
    potong.forEach((_, idx) => {
      const item = jawab.items[idx];
      if (item?.ok) terkirim += 1;
      else {
        gagal += 1;
        if (item && !item.ok) galat = item.error;
      }
    });
  }
  if (denganEmail && idPengumuman.length) {
    await db.from("event_announcements").update({ email_summary: { terkirim, gagal, galat, waktu: new Date().toISOString() } } as never).in("id", idPengumuman);
  }

  const ringkasan = { lonceng: calon.length, terkirim, gagal, tanpa_email: denganEmail ? calon.length - keEmail.length : 0, galat };
  await db.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: AKSI,
    payload: { saluran, title, pengumuman: idPengumuman, ...ringkasan },
  } as never);
  return Response.json(ringkasan);
}
