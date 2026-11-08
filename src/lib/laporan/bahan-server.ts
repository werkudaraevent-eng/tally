/**
 * Membaca bahan Event report dari database, sekali per permintaan.
 *
 * Semua tabel besar dibaca bertahap per 1.000 baris (semuaBaris) karena
 * pembacaan PostgREST berhenti di 1.000. Yang dipakai ulang: bahan Dashboard
 * "Check-ins by checkpoint" (muatBahanPantau, jadi "diharapkan" sama persis),
 * jejak portal, laporan Seen pengumuman, dan jawaban Feedback. Tidak ada nama
 * atau kontak peserta yang keluar dari sini.
 */
import type { EventRow } from "@/lib/domain";
import { muatSetelan } from "@/lib/kilas-balik/server";
import { landingDefaultLang } from "@/lib/landing-i18n";
import { landingTokens } from "@/lib/landing-tokens";
import { semuaBaris } from "@/lib/logistik/server";
import { jejakPortal, pakaiPortal } from "@/lib/member/jejak-portal";
import { hitungPantau, rincianPantau } from "@/lib/pantau-checkin";
import { muatBahanPantau } from "@/lib/pantau-checkin-server";
import { laporanDilihat, type PengumumanDilihat } from "@/lib/pengumuman-dilihat-server";
import { jawabanPeserta, kolomSasaran } from "@/lib/sasaran-bagian";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeTimeZone, timeZoneAbbr, timeZoneOffset } from "@/lib/timezone";
import type { BahanLaporan, PengumumanBahan, SesiBahan } from "./bahan";
import type { ConfigLaporan } from "./config";

type Hitungan = { count: number | null; error: unknown };
const jumlah = (h: Hitungan) => (h.error ? 0 : h.count ?? 0);

export async function muatBahanLaporan(event: EventRow, config: ConfigLaporan, sekarang = new Date()): Promise<BahanLaporan | null> {
  const db = getSupabaseServiceClient();
  const zona = normalizeTimeZone((event as { time_zone?: unknown }).time_zone);
  const offset = timeZoneOffset(zona);
  const lc = event.landing_config as Parameters<typeof landingTokens>[0];

  const pantau = await muatBahanPantau(event, sekarang, { orang: true });
  if (!pantau) return null;
  const { bahan, orang } = pantau;

  // Kelompok dan pertanyaan pilihan formulir.
  const pilihanDaftar = kolomSasaran(event.registration_form_config).map((k) => ({ kunci: k.key, label: k.label, opsi: k.options }));
  const kunciKelompok = config.kelompok;
  const kelompokLabel = !kunciKelompok
    ? null
    : kunciKelompok === "company"
      ? (landingDefaultLang(lc) === "en" ? "Organisation" : "Organisasi")
      : pilihanDaftar.find((p) => `extra.${p.kunci}` === kunciKelompok)?.label ?? null;
  const peserta = [...orang].map(([id, o]) => ({
    id,
    kelompok: !kelompokLabel ? null : kunciKelompok === "company" ? (o.company?.trim() || null) : jawabanPeserta(o.extra, kunciKelompok!.slice(6)),
    jawaban: Object.fromEntries(pilihanDaftar.map((p) => [p.kunci, jawabanPeserta(o.extra, p.kunci)])),
  }));
  const aktif = new Set(peserta.map((p) => p.id));

  // Hadir = pernah dipindai di sesi mana pun. Sesi = baris Dashboard bertipe sesi.
  const hadir = new Set(bahan.scans.filter((s) => aktif.has(s.participant_id)).map((s) => s.participant_id));
  // Dihitung sekali per baris: datang dipakai grafik kedatangan, sesiDiikuti
  // hanya menghitung sesi yang punya baris Agenda.
  const sesiDiikuti = new Map<string, number>();
  const semuaSesi: SesiBahan[] = hitungPantau(bahan)
    .filter((r) => r.jenis === "sesi")
    .map((r) => {
      const sudah = rincianPantau(bahan, r.key)?.sudah ?? [];
      if (r.tanggal) for (const x of sudah) sesiDiikuti.set(x.id, (sesiDiikuti.get(x.id) ?? 0) + 1);
      return { nama: r.nama, tanggal: r.tanggal, jam: r.jam, diharapkan: r.diharapkan, sudah: r.sudah, datang: sudah.map((x) => x.at) };
    });
  const sesi = semuaSesi.filter((s) => s.tanggal !== null);

  const [portal, undangan, daftarTotal, daftarSetuju, feedback, pengumuman, undian, voting, logistik] = await Promise.all([
    pakaiPortal(event) ? jejakPortal(event.id).then((p) => new Set([...p.keys()].filter((id) => aktif.has(id)))).catch(() => null) : Promise.resolve(null),
    db.from("event_invitations").select("id", { count: "exact", head: true }).eq("event_id", event.id).is("deleted_at", null).eq("is_test", false),
    db.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", event.id),
    db.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("status", "approved"),
    muatFeedback(event.id, aktif),
    muatPengumuman(event),
    muatUndian(event.id),
    muatVoting(event.id),
    muatLogistik(event.id),
  ]);

  const diundang = jumlah(undangan);
  const mendaftar = jumlah(daftarTotal);
  return {
    acara: {
      nama: event.name,
      tempat: event.venue_name ?? null,
      mulai: event.event_date,
      selesai: event.end_date,
      bahasa: landingDefaultLang(lc),
      offset,
      zona: timeZoneAbbr(zona),
      warna: landingTokens(lc).brand,
      logo: (lc as { nav?: { logo_url?: string | null } } | null)?.nav?.logo_url ?? null,
    },
    sekarang: sekarang.toISOString(),
    diundang: diundang > 0 ? diundang : null,
    mendaftar: mendaftar > 0 ? mendaftar : null,
    disetujui: mendaftar > 0 ? jumlah(daftarSetuju) : null,
    peserta,
    kelompokLabel,
    pilihanDaftar,
    portal,
    hadir,
    sesiDiikuti,
    sesi,
    semuaSesi,
    feedback,
    pengumuman,
    undian,
    voting,
    logistik,
  };
}

async function muatFeedback(eventId: string, aktif: Set<string>): Promise<BahanLaporan["feedback"]> {
  const setelan = await muatSetelan(eventId).catch(() => null);
  if (!setelan?.siap || !setelan.ada || setelan.setelan.questions.length === 0) return null;
  const db = getSupabaseServiceClient();
  const jawaban = await semuaBaris<{ participant_id: string; answers: Record<string, unknown> }>(() =>
    db.from("feedback_responses" as never).select("participant_id,answers").eq("event_id", eventId).order("participant_id"));
  if (!jawaban) return null;
  return { pertanyaan: setelan.setelan.questions, jawaban: jawaban.filter((j) => aktif.has(j.participant_id)) };
}

async function muatPengumuman(event: EventRow): Promise<PengumumanBahan[] | null> {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("event_announcements")
    .select("id,title,published_at,audience,audience_rules,audience_ids,audience_any")
    .eq("event_id", event.id)
    .order("published_at")
    .limit(200);
  if (error || !data?.length) return null;
  const items = data as unknown as Array<PengumumanDilihat & { title: string }>;
  const laporan = await laporanDilihat(event, items, false).catch(() => null);
  if (!laporan) return null;
  return items.flatMap((item) => {
    const r = laporan.get(item.id);
    return r ? [{ judul: item.title, terbit: item.published_at, total: r.ringkas.total, dilihat: r.ringkas.dilihat, emailTerkirim: r.email?.terkirim ?? 0, emailKlik: r.email?.diklik ?? 0 }] : [];
  });
}

async function muatUndian(eventId: string): Promise<BahanLaporan["undian"]> {
  const db = getSupabaseServiceClient();
  const pemenang = await semuaBaris<{ participant_id: string | null; status: string }>(() =>
    db.from("undian_winners").select("id,participant_id,status").eq("event_id", eventId).eq("is_backup", false).eq("rehearsal", false).neq("status", "rejected").order("id"));
  if (!pemenang?.length) return null;
  return { slot: pemenang.length, pemenang: pemenang.map((w) => ({ participant_id: w.participant_id, dikonfirmasi: w.status === "confirmed" })) };
}

async function muatVoting(eventId: string): Promise<BahanLaporan["voting"]> {
  const db = getSupabaseServiceClient();
  const { count } = await db.from("vote_polls").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (!count) return null;
  const surat = await semuaBaris<{ voter_key: string }>(() => db.from("vote_ballots").select("id,voter_key").eq("event_id", eventId).order("id"));
  if (!surat) return null;
  return { pertanyaan: count, pemilih: new Set(surat.map((s) => s.voter_key)).size };
}

async function muatLogistik(eventId: string): Promise<BahanLaporan["logistik"]> {
  const db = getSupabaseServiceClient();
  const hitung = (tabel: string) => db.from(tabel).select("id", { count: "exact", head: true }).eq("event_id", eventId);
  const [hotel, kamar, kendaraan, trip, tas, ambil] = await Promise.all([
    hitung("lodging_hotels"),
    hitung("lodging_rooms"),
    hitung("transport_vehicles"),
    hitung("transport_trips"),
    semuaBaris<{ bag_count: number | null; handed_over_at: string | null }>(() => db.from("luggage_drops").select("id,bag_count,handed_over_at").eq("event_id", eventId).order("id")),
    db.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("luggage_pickup", true),
  ]);
  const titip: Array<{ bag_count: number | null; handed_over_at: string | null }> = tas ?? [];
  const totalTas = titip.reduce((a, t) => a + (t.bag_count ?? 0), 0);
  const kembali = titip.filter((t) => t.handed_over_at).reduce((a, t) => a + (t.bag_count ?? 0), 0);
  return { hotel: jumlah(hotel), kamar: jumlah(kamar), kendaraan: jumlah(kendaraan), trip: jumlah(trip), tas: totalTas, tasKembali: jumlah(ambil) > 0 ? kembali : null };
}
