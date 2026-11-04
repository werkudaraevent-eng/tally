import { createHash } from "node:crypto";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { publicEventName, type EventLandingConfig, type EventRow } from "@/lib/domain";
import { linkOrigin } from "@/lib/domain-klien/asal";
import { BATCH_MAX, sendEmailBatchDetailed } from "@/lib/email/client";
import { bahasaUtamaAcara } from "@/lib/email/konfirmasi/bahasa";
import { emailKabarKamar, kabarBerubah, kunciKabar, perluKabar, type StayKabar } from "@/lib/logistik/kabar-kamar";
import { klien, semuaBaris } from "@/lib/logistik/server";
import { stayPerPeserta, tanggalStay, tanggalZona, type TanggalHotel } from "@/lib/logistik/stay";
import { landingPath } from "@/lib/landing-i18n";
import { allowedByList, messagingAllowlist, normalizeAddress } from "@/lib/pesan/alamat";
import { timeZoneOffset } from "@/lib/timezone";

/**
 * Logistics > Assignments > Email room numbers (migrasi 202611040003).
 *
 * GET  berapa peserta punya nomor kamar yang belum dikabarkan, untuk banner.
 * POST kirim email pribadi ke mereka semua sekarang: hotel, nomor kamar, teman
 *      sekamar, jam check-in. Yang berhasil dicatat di room_notices, jadi
 *      tekan kedua tidak mengirim ulang; nomor yang berganti masuk daftar lagi.
 *
 * Tidak ada kiriman otomatis: email hanya keluar saat panitia menekan Send.
 * Daftarnya dihitung ulang di server saat POST, dari data kamar saat itu.
 */

export const maxDuration = 60;

type Orang = { id: string; name: string; email: string | null };
type Inap = { id: number; participant_id: string; hotel_id: number; room_id: number | null; check_in_at: string | null; check_out_at: string | null };
type Hotel = TanggalHotel & { name: string; address: string | null };
type Kamar = { id: number; room_number: string | null };
type Terkirim = { participant_id: string; sent_key: string };

type Calon = { id: string; nama: string; email: string | null; kunci: string; berubah: boolean; stays: StayKabar[] };

/** room_notices belum ada (migrasi belum dijalankan). */
const tabelBelumAda = (galat: { code?: string } | null | undefined) => galat?.code === "42P01" || galat?.code === "PGRST205";

/** Acara sudah lewat (zona acara): banner tidak tampil di acara lama. */
function sudahLewat(event: Pick<EventRow, "event_date" | "end_date" | "time_zone">): boolean {
  const hariIni = tanggalZona(new Date().toISOString(), timeZoneOffset(event.time_zone));
  const akhir = event.end_date ?? event.event_date;
  return akhir !== null && akhir < hariIni;
}

async function hitung(eventId: string): Promise<{ siap: false } | { siap: true; calon: Calon[]; terkirim: number } | null> {
  const db = klien();
  const uji = await db.from("room_notices" as never).select("participant_id").eq("event_id", eventId).limit(1);
  if (tabelBelumAda(uji.error as { code?: string } | null)) return { siap: false };
  if (uji.error) return null;

  const [peserta, inap, hotel, kamar, terkirim, akun] = await Promise.all([
    semuaBaris<Orang>(() => db.from("participants").select("id,name,email").eq("event_id", eventId).is("source_removed_at", null).order("id")),
    semuaBaris<Inap>(() => db.from("lodging_assignments").select("id,participant_id,hotel_id,room_id,check_in_at,check_out_at").eq("event_id", eventId).order("id")),
    semuaBaris<Hotel>(() => db.from("lodging_hotels").select("id,name,address,check_in_at,check_out_at").eq("event_id", eventId).order("id")),
    semuaBaris<Kamar>(() => db.from("lodging_rooms").select("id,room_number").eq("event_id", eventId).order("id")),
    semuaBaris<Terkirim>(() => db.from("room_notices" as never).select("participant_id,sent_key").eq("event_id", eventId).order("participant_id")),
    semuaBaris<{ participant_id: string; email: string | null }>(() =>
      db.from("participant_accounts").select("participant_id,email").eq("event_id", eventId).not("participant_id", "is", null).order("id")),
  ]);
  if (!peserta || !inap || !hotel || !kamar || !terkirim || !akun) return null;

  const aktif = new Map(peserta.map((p) => [p.id, p]));
  const hotelById = new Map(hotel.map((h) => [h.id, h]));
  const nomor = new Map(kamar.map((k) => [k.id, k.room_number]));
  const kirimLalu = new Map(terkirim.map((t) => [t.participant_id, t.sent_key]));
  const emailAkun = new Map<string, string>();
  for (const a of akun) if (a.email && !emailAkun.has(a.participant_id)) emailAkun.set(a.participant_id, a.email);

  // Penghuni per kamar (hanya peserta aktif), untuk "Teman sekamar".
  const inapAktif = inap.filter((b) => aktif.has(b.participant_id));
  const penghuni = new Map<number, Set<string>>();
  for (const b of inapAktif) {
    if (b.room_id === null) continue;
    penghuni.set(b.room_id, (penghuni.get(b.room_id) ?? new Set()).add(b.participant_id));
  }

  const calon: Calon[] = [];
  for (const [pid, daftar] of stayPerPeserta(inapAktif, hotelById)) {
    const orang = aktif.get(pid);
    if (!orang) continue;
    const stays: StayKabar[] = daftar.map((b) => {
      const h = hotelById.get(b.hotel_id);
      const t = tanggalStay(b, h);
      const teman = b.room_id === null ? [] : [...(penghuni.get(b.room_id) ?? [])]
        .filter((id) => id !== pid)
        .map((id) => aktif.get(id)?.name ?? "")
        .filter(Boolean)
        .sort((a, c) => a.localeCompare(c));
      return {
        hotel_id: b.hotel_id,
        hotel: h?.name ?? "",
        alamat: h?.address?.trim() || null,
        room: b.room_id === null ? null : nomor.get(b.room_id)?.trim() || null,
        masuk: t.masuk,
        keluar: t.keluar,
        teman,
      };
    });
    const kunci = kunciKabar(stays);
    const lalu = kirimLalu.get(pid);
    if (!perluKabar(kunci, lalu)) continue;
    const email = normalizeAddress(orang.email) ?? normalizeAddress(emailAkun.get(pid));
    calon.push({ id: pid, nama: orang.name, email, kunci: kunci!, berubah: kabarBerubah(kunci!, lalu), stays });
  }
  calon.sort((a, b) => a.nama.localeCompare(b.nama));
  return { siap: true, calon, terkirim: kirimLalu.size };
}

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  if (sudahLewat(event)) return Response.json({ siap: false });
  const hasil = await hitung(event.id);
  if (!hasil) return apiError("INTERNAL_ERROR", 500);
  if (!hasil.siap) return Response.json({ siap: false });
  const tanpaEmail = hasil.calon.filter((c) => !c.email);
  return Response.json({
    siap: true,
    perlu: hasil.calon.length,
    berubah: hasil.calon.filter((c) => c.berubah).length,
    tanpa_email: tanpaEmail.length,
    nama_tanpa_email: tanpaEmail.slice(0, 5).map((c) => c.nama),
    nama: hasil.calon.slice(0, 3).map((c) => c.nama),
    terkirim: hasil.terkirim,
    mode_uji: messagingAllowlist().mode !== "off",
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const daftarUji = messagingAllowlist();
  if (daftarUji.mode === "blocked") return apiError("MESSAGING_BLOCKED", 403);

  const hasil = await hitung(event.id);
  if (!hasil) return apiError("INTERNAL_ERROR", 500);
  if (!hasil.siap) return apiError("ROOM_NOTICES_NOT_READY", 409);

  const landing = event.landing_config as EventLandingConfig | null;
  const bahasa = bahasaUtamaAcara(landing);
  const origin = await linkOrigin(request, event.id);
  const portalUrl = `${origin}${landingPath(event.slug, bahasa, bahasa)}/peserta?tab=perjalanan`;
  const eventName = publicEventName(event);

  // Di luar produksi hanya alamat di daftar uji yang dikirimi, sama dengan Kiriman.
  const kirim = hasil.calon.filter((c): c is Calon & { email: string } => c.email !== null && allowedByList(c.email, daftarUji));
  const dilewati = hasil.calon.length - kirim.length;

  let terkirim = 0;
  let gagal = 0;
  let galat: string | null = null;
  const db = klien();
  for (let i = 0; i < kirim.length; i += BATCH_MAX) {
    const potong = kirim.slice(i, i + BATCH_MAX);
    const isi = potong.map((c) => ({
      to: c.email,
      ...emailKabarKamar({ bahasa, eventName, nama: c.nama, stays: c.stays, berubah: c.berubah, portalUrl, zona: event.time_zone }),
    }));
    // Tekan dua kali bersamaan untuk daftar yang sama: Resend tidak mengirim dua kali dalam 24 jam.
    const kunci = createHash("sha256").update(`kabar-kamar:${event.id}:${potong.map((c) => `${c.id}=${c.kunci}=${c.email}`).join(",")}`).digest("hex");
    const jawab = await sendEmailBatchDetailed(isi, kunci, event.id);
    if (jawab.kind === "not_configured") return apiError("EMAIL_NOT_CONFIGURED", 503);
    if (jawab.kind === "failed") {
      gagal += potong.length;
      galat = jawab.error;
      continue;
    }
    const berhasil = potong.filter((_, idx) => jawab.items[idx]?.ok);
    for (const item of jawab.items) if (!item.ok) galat = item.error;
    gagal += potong.length - berhasil.length;
    terkirim += berhasil.length;
    if (berhasil.length) {
      const { error } = await db.from("room_notices" as never).upsert(
        berhasil.map((c) => ({ event_id: event.id, participant_id: c.id, sent_key: c.kunci, sent_to: c.email, sent_at: new Date().toISOString(), sent_by: auth.user.id })) as never,
        { onConflict: "event_id,participant_id" },
      );
      if (error) galat = "Sent, but couldn't record it. Pressing Send again may email these people twice.";
    }
  }

  await db.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "room_notice_email",
    payload: { terkirim, gagal, dilewati, galat },
  } as never);

  if (terkirim === 0 && gagal > 0) return apiError("EMAIL_SEND_FAILED", 502, { terkirim, gagal, dilewati, galat });
  return Response.json({ terkirim, gagal, dilewati, galat });
}
