import { createHash } from "node:crypto";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { publicEventName, type EventLandingConfig, type EventRow } from "@/lib/domain";
import { linkOrigin } from "@/lib/domain-klien/asal";
import { BATCH_MAX, sendEmailBatchDetailed } from "@/lib/email/client";
import { bahasaUtamaAcara } from "@/lib/email/konfirmasi/bahasa";
import { berbagiMalam, emailKabarKamar, kabarBerubah, kunciKabar, perluKabar, type StayKabar } from "@/lib/logistik/kabar-kamar";
import { bagianTampil } from "@/lib/logistik/bagian-tampil";
import { klien, semuaBaris } from "@/lib/logistik/server";
import { stayPerPeserta, tanggalZona, type TanggalHotel } from "@/lib/logistik/stay";
import { landingPath } from "@/lib/landing-i18n";
import { allowedByList, messagingAllowlist, normalizeAddress } from "@/lib/pesan/alamat";
import { PILIH_MAX } from "@/lib/sasaran-pengumuman";
import { timeZoneOffset } from "@/lib/timezone";

/**
 * Logistics > Assignments > Email room numbers (migrasi 202611040003).
 *
 * GET  berapa peserta punya nomor kamar yang belum dikabarkan, untuk banner.
 * POST kabari mereka semua sekarang: selalu lonceng di area peserta (satu
 *      pengumuman untuk peserta terpilih), dan bila dipilih juga email pribadi
 *      berisi hotel, nomor kamar, teman sekamar, jam check-in. Yang berhasil dicatat di room_notices, jadi
 *      tekan kedua tidak mengirim ulang; nomor yang berganti masuk daftar lagi.
 *
 * Tidak ada kiriman otomatis: email hanya keluar saat panitia menekan Send.
 * Daftarnya dihitung ulang di server saat POST, dari data kamar saat itu.
 */

export const maxDuration = 60;

type Orang = { id: string; name: string; email: string | null };
type Inap = { id: number; participant_id: string; hotel_id: number; room_id: number | null; check_in_at: string | null; check_out_at: string | null };
type Hotel = TanggalHotel & { name: string; address: string | null };
type Kamar = { id: number; room_number: string | null; check_in_at?: string | null; check_out_at?: string | null };
type Terkirim = { participant_id: string; sent_key: string };

type Calon = { id: string; nama: string; email: string | null; kunci: string; berubah: boolean; stays: StayKabar[] };

/** room_notices belum ada (migrasi belum dijalankan). */
const tabelBelumAda = (galat: { code?: string } | null | undefined) => galat?.code === "42P01" || galat?.code === "PGRST205";

/** Setelan area peserta yang dipakai kabar: kamar tampil ke peserta, teman sekamar tampil. */
function setelan(event: Pick<EventRow, "landing_config">) {
  const member = (event.landing_config as EventLandingConfig | null)?.member;
  return { kamarTampil: bagianTampil(member, "rooms"), tampilTeman: member?.show_roommates !== false };
}

/** Acara sudah lewat (zona acara): banner tidak tampil di acara lama. */
function sudahLewat(event: Pick<EventRow, "event_date" | "end_date" | "time_zone">): boolean {
  const hariIni = tanggalZona(new Date().toISOString(), timeZoneOffset(event.time_zone));
  const akhir = event.end_date ?? event.event_date;
  return akhir !== null && akhir < hariIni;
}

async function hitung(eventId: string, tampilTeman: boolean): Promise<{ siap: false } | { siap: true; calon: Calon[]; terkirim: number } | null> {
  const db = klien();
  const uji = await db.from("room_notices" as never).select("participant_id").eq("event_id", eventId).limit(1);
  if (tabelBelumAda(uji.error as { code?: string } | null)) return { siap: false };
  if (uji.error) return null;

  const [peserta, inap, hotel, kamar, terkirim, akun] = await Promise.all([
    semuaBaris<Orang>(() => db.from("participants").select("id,name,email").eq("event_id", eventId).is("source_removed_at", null).order("id")),
    semuaBaris<Inap>(() => db.from("lodging_assignments").select("id,participant_id,hotel_id,room_id,check_in_at,check_out_at").eq("event_id", eventId).order("id")),
    semuaBaris<Hotel>(() => db.from("lodging_hotels").select("id,name,address,check_in_at,check_out_at").eq("event_id", eventId).order("id")),
    semuaBaris<Kamar>(() => db.from("lodging_rooms").select("*").eq("event_id", eventId).order("id")),
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

  // Tanggal efektif sama dengan member_logistics: stay, lalu kamar, lalu hotel.
  const kamarById = new Map(kamar.map((k) => [k.id, k]));
  const tanggal = (b: Inap) => {
    const k = b.room_id === null ? undefined : kamarById.get(b.room_id);
    const h = hotelById.get(b.hotel_id);
    return {
      masuk: b.check_in_at ?? k?.check_in_at ?? h?.check_in_at ?? null,
      keluar: b.check_out_at ?? k?.check_out_at ?? h?.check_out_at ?? null,
    };
  };

  // Penghuni per kamar (hanya peserta aktif), untuk "Teman sekamar".
  const inapAktif = inap.filter((b) => aktif.has(b.participant_id));
  const penghuni = new Map<number, Inap[]>();
  for (const b of inapAktif) {
    if (b.room_id === null) continue;
    penghuni.set(b.room_id, [...(penghuni.get(b.room_id) ?? []), b]);
  }

  const calon: Calon[] = [];
  for (const [pid, daftar] of stayPerPeserta(inapAktif, hotelById)) {
    const orang = aktif.get(pid);
    if (!orang) continue;
    const stays: StayKabar[] = daftar.map((b) => {
      const h = hotelById.get(b.hotel_id);
      const t = tanggal(b);
      // Sama dengan portal: hanya bila panitia menampilkan teman sekamar, dan
      // hanya yang berbagi malam dengan stay ini.
      const teman = !tampilTeman || b.room_id === null ? [] : [...new Set((penghuni.get(b.room_id) ?? [])
        .filter((lain) => lain.participant_id !== pid && berbagiMalam(t, tanggal(lain)))
        .map((lain) => aktif.get(lain.participant_id)?.name ?? "")
        .filter(Boolean))]
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
  const atur = setelan(event);
  const hasil = await hitung(event.id, atur.tampilTeman);
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
    kamar_tampil: atur.kamarTampil,
  });
}

const kirimSchema = z.object({ saluran: z.enum(["portal", "portal_email"]) });

/** Isi lonceng: satu pengumuman umum untuk peserta terpilih; nomor kamarnya sendiri dibaca di Perjalanan. */
const LONCENG = {
  id: { title: "Nomor kamar kamu sudah tersedia", body: "Buka Perjalanan › Hotel untuk melihat nomor kamar dan teman sekamarmu.", link: "Buka Perjalanan" },
  en: { title: "Your room number is ready", body: "Open My trip › Hotel to see your room number and roommates.", link: "Open My trip" },
} as const;

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = kirimSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const denganEmail = parsed.data.saluran === "portal_email";
  const event = auth.scope.event;
  const daftarUji = messagingAllowlist();
  if (denganEmail && daftarUji.mode === "blocked") return apiError("MESSAGING_BLOCKED", 403);

  if (sudahLewat(event)) return apiError("VALIDATION_ERROR", 422, { message: "This event is over." });
  const atur = setelan(event);
  if (!atur.kamarTampil) {
    return apiError("VALIDATION_ERROR", 422, { message: "Rooms are hidden from participants. Show them in Participant area › Logistics first." });
  }
  const hasil = await hitung(event.id, atur.tampilTeman);
  if (!hasil) return apiError("INTERNAL_ERROR", 500);
  if (!hasil.siap) return apiError("ROOM_NOTICES_NOT_READY", 409);
  if (hasil.calon.length === 0) return Response.json({ lonceng: 0, terkirim: 0, gagal: 0, tanpa_email: 0, galat: null });

  const landing = event.landing_config as EventLandingConfig | null;
  const bahasa = bahasaUtamaAcara(landing);
  const origin = await linkOrigin(request, event.id);
  const portalUrl = `${origin}${landingPath(event.slug, bahasa, bahasa)}/peserta?tab=perjalanan`;
  const eventName = publicEventName(event);
  const db = klien();
  const sekarang = () => new Date().toISOString();

  // 1. Lonceng di area peserta (Announcements, Send to: Specific participants).
  // Satu pengumuman per 500 orang. Gagal di sini = tidak ada yang dikirim.
  const teks = LONCENG[bahasa];
  const idPengumuman: string[] = [];
  for (let i = 0; i < hasil.calon.length; i += PILIH_MAX) {
    const { data, error } = await db.from("event_announcements").insert({
      event_id: event.id,
      title: teks.title,
      body: teks.body,
      link_url: portalUrl,
      link_label: teks.link,
      audience: "pilih",
      audience_ids: hasil.calon.slice(i, i + PILIH_MAX).map((c) => c.id),
      created_by: auth.user.id,
    } as never).select("id").single();
    if (error || !data) return apiError(idPengumuman.length ? "INTERNAL_ERROR" : "ANNOUNCEMENT_AUDIENCE_NOT_READY", idPengumuman.length ? 500 : 409);
    idPengumuman.push((data as { id: string }).id);
  }

  // 2. Email pribadi (bila dipilih). Di luar produksi hanya alamat di daftar uji.
  const keEmail = denganEmail ? hasil.calon.filter((c): c is Calon & { email: string } => c.email !== null && allowedByList(c.email, daftarUji)) : [];
  const dariEmail = new Set(keEmail.map((c) => c.id));
  const gagalEmail = new Set<string>();
  let terkirim = 0;
  let galat: string | null = null;
  for (let i = 0; i < keEmail.length; i += BATCH_MAX) {
    const potong = keEmail.slice(i, i + BATCH_MAX);
    const isi = potong.map((c) => ({
      to: c.email,
      ...emailKabarKamar({ bahasa, eventName, nama: c.nama, stays: c.stays, berubah: c.berubah, portalUrl, zona: event.time_zone }),
    }));
    // Tekan dua kali bersamaan untuk daftar yang sama: Resend tidak mengirim dua kali dalam 24 jam.
    const kunci = createHash("sha256").update(`kabar-kamar:${event.id}:${potong.map((c) => `${c.id}=${c.kunci}=${c.email}`).join(",")}`).digest("hex");
    const jawab = await sendEmailBatchDetailed(isi, kunci, event.id);
    if (jawab.kind === "not_configured") {
      potong.forEach((c) => gagalEmail.add(c.id));
      galat = "Email isn't set up on this server.";
      continue;
    }
    if (jawab.kind === "failed") {
      potong.forEach((c) => gagalEmail.add(c.id));
      galat = jawab.error;
      continue;
    }
    potong.forEach((c, idx) => {
      const item = jawab.items[idx];
      if (item?.ok) terkirim += 1;
      else {
        gagalEmail.add(c.id);
        if (item && !item.ok) galat = item.error;
      }
    });
  }

  // 3. Catat. Email yang gagal tidak dicatat: orangnya tetap di daftar dan bisa dikirim lagi.
  const tercatat = hasil.calon.filter((c) => !gagalEmail.has(c.id));
  if (tercatat.length) {
    const { error } = await db.from("room_notices" as never).upsert(
      tercatat.map((c) => ({
        event_id: event.id,
        participant_id: c.id,
        sent_key: c.kunci,
        sent_to: dariEmail.has(c.id) ? c.email! : "portal",
        sent_at: sekarang(),
        sent_by: auth.user.id,
      })) as never,
      { onConflict: "event_id,participant_id" },
    );
    if (error) galat = "Sent, but couldn't record it. Pressing Send again may notify these people twice.";
  }
  if (denganEmail && idPengumuman.length) {
    await db.from("event_announcements").update({ email_summary: { terkirim, gagal: gagalEmail.size, galat, waktu: sekarang() } } as never).in("id", idPengumuman);
  }

  const ringkasan = {
    lonceng: hasil.calon.length,
    terkirim,
    gagal: gagalEmail.size,
    tanpa_email: denganEmail ? hasil.calon.length - keEmail.length : 0,
    galat,
  };
  await db.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "room_notice_send",
    payload: { saluran: parsed.data.saluran, pengumuman: idPengumuman, ...ringkasan },
  } as never);
  return Response.json(ringkasan);
}
