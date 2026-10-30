import { loadDaftarCheckpoint } from "@/lib/checkpoint/server";
import { bagianTampil } from "@/lib/logistik/bagian-tampil";
import { semuaBaris } from "@/lib/logistik/server";
import { memberConfig } from "@/lib/member/account";
import { jejakPortal, pakaiPortal } from "@/lib/member/jejak-portal";
import type { EventRow } from "@/lib/domain";
import { hitungPantau, ringkasAcara, type AgendaPantau, type RingkasAcara, type BahanPantau, type BarisPantau, type CatatanPantau, type SesiPantau } from "@/lib/pantau-checkin";
import { jawabanPeserta, kolomSasaran } from "@/lib/sasaran-bagian";
import { bacaSyaratBaris } from "@/lib/sasaran-baris";
import { muatStayPeserta, type StayPeserta } from "@/lib/sasaran-baris-server";
import { KOLOM_HOTEL } from "@/lib/sasaran-blok";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeTimeZone, timeZoneOffset } from "@/lib/timezone";

/**
 * Bahan kartu "Check-ins by checkpoint" di Dashboard, lalu hitungPantau.
 *
 * Tanpa SQL baru: semua tabel dibaca bertahap per 1.000 baris (semuaBaris),
 * karena pembacaan PostgREST berhenti di 1.000 dan pindaian hari-H acara besar
 * lewat dari itu dalam satu jam. Who sees it dinilai di sini dengan aturan
 * portal, jadi "diharapkan" sama dengan yang melihat baris Agenda itu.
 *
 * Untuk acara ribuan peserta ini cukup (beberapa halaman per 30 detik). Untuk
 * SaaS berskala besar hitungannya pindah ke fungsi database.
 */
export async function muatPantauCheckin(event: EventRow, sekarang = new Date()): Promise<BarisPantau[] | null> {
  const dimuat = await muatBahanPantau(event, sekarang);
  return dimuat ? hitungPantau(dimuat.bahan) : null;
}

/**
 * Baris check-in plus ringkasan atas Dashboard (kedatangan hari ini, titik
 * berikutnya, kelompok Who sees it). Jejak portal hanya dibaca bila acara
 * memakai area peserta; gagal membacanya tidak menggagalkan baris check-in.
 */
export async function muatRingkasCheckin(event: EventRow, sekarang = new Date()): Promise<{ rows: BarisPantau[]; ringkas: RingkasAcara } | null> {
  const dimuat = await muatBahanPantau(event, sekarang);
  if (!dimuat) return null;
  let masuk: Set<string> | null = null;
  if (pakaiPortal(event)) {
    masuk = await jejakPortal(event.id).then((peta) => new Set(peta.keys())).catch(() => null);
  }
  return { rows: hitungPantau(dimuat.bahan), ringkas: ringkasAcara(dimuat.bahan, masuk) };
}

/** Peserta aktif dengan nama dan unit, hanya untuk halaman Kehadiran panitia. */
export type OrangPantau = { name: string; company: string | null; extra: Record<string, unknown> | null };

/**
 * Bahan hitungPantau. `orang`: ikut membaca nama dan unit peserta aktif
 * (halaman Kehadiran panitia di portal); Dashboard tidak memerlukannya.
 */
export async function muatBahanPantau(
  event: EventRow,
  sekarang = new Date(),
  opsi: { orang?: boolean } = {},
): Promise<{ bahan: BahanPantau; orang: Map<string, OrangPantau>; checkpoints: { id: number; agenda_item_ids: number[] }[] } | null> {
  const db = getSupabaseServiceClient();
  const [sesiHasil, checkpoints] = await Promise.all([
    db.from("attendance_sessions").select("id,name,is_active,sort_order").eq("event_id", event.id).order("sort_order").order("id"),
    loadDaftarCheckpoint(event.id),
  ]);
  if (sesiHasil.error) return null;
  const sesi = (sesiHasil.data ?? []) as SesiPantau[];
  const daftar = checkpoints ?? [];
  if (sesi.length === 0 && daftar.length === 0) {
    return { bahan: { sesi: [], checkpoints: [], agenda: new Map(), peserta: [], scans: [], pickups: [], barang: new Map(), sekarang }, orang: new Map(), checkpoints: [] };
  }

  const agendaIds = [...new Set(daftar.flatMap((cp) => cp.agenda_item_ids))];
  const barangIds = [...new Set(daftar.map((cp) => cp.item_id).filter((id): id is number => id !== null))];

  const [peserta, scans, pickups, barangHasil, agendaHasil] = await Promise.all([
    semuaBaris<{ id: string; extra: Record<string, unknown> | null; name?: string; company?: string | null }>(() =>
      db.from("participants").select(opsi.orang ? "id,extra,name,company" : "id,extra").eq("event_id", event.id).is("source_removed_at", null).order("id")),
    sesi.length
      ? semuaBaris<{ id: number; session_id: number; participant_id: string; scanned_at: string }>(() =>
          db.from("attendance_scans").select("id,session_id,participant_id,scanned_at").eq("event_id", event.id).order("id"))
      : Promise.resolve([]),
    barangIds.length
      ? semuaBaris<{ id: number; item_id: number; participant_id: string; picked_up_at: string }>(() =>
          db.from("item_pickups").select("id,item_id,participant_id,picked_up_at").eq("event_id", event.id).in("item_id", barangIds).order("id"))
      : Promise.resolve([]),
    barangIds.length ? db.from("pickup_items").select("id,name").eq("event_id", event.id).in("id", barangIds) : Promise.resolve({ data: [], error: null }),
    agendaIds.length
      ? db.from("rundown_items").select("id,audience,start_time,rundown_sections!inner(event_id,event_date)").in("id", agendaIds).eq("rundown_sections.event_id", event.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (!peserta || !scans || !pickups || barangHasil.error || agendaHasil.error) return null;

  const agenda = new Map<number, AgendaPantau>();
  for (const baris of (agendaHasil.data ?? []) as unknown as Array<{ id: number; audience: unknown; start_time: string | null; rundown_sections: { event_date: string | null } | Array<{ event_date: string | null }> }>) {
    const bagian = Array.isArray(baris.rundown_sections) ? baris.rundown_sections[0] : baris.rundown_sections;
    agenda.set(Number(baris.id), { id: Number(baris.id), tanggal: bagian?.event_date ?? null, jam: baris.start_time, syarat: bacaSyaratBaris(baris.audience) });
  }

  // Jawaban yang dipakai syarat saja, dan stay hotel hanya bila ada syarat
  // Hotel dan kamar ditampilkan ke peserta, sama dengan portal.
  const syarat = [...agenda.values()].flatMap((isi) => isi.syarat ?? []);
  const kunci = [...new Set(syarat.map((isi) => isi.field).filter((field) => field !== KOLOM_HOTEL))];
  let stays: StayPeserta = new Map();
  if (bagianTampil(memberConfig(event), "rooms") && syarat.some((isi) => isi.field === KOLOM_HOTEL)) {
    const dimuat = await muatStayPeserta(event.id);
    if (!dimuat) return null;
    stays = dimuat;
  }
  const offset = timeZoneOffset(normalizeTimeZone((event as { time_zone?: unknown }).time_zone));
  const kolom = kolomSasaran(event.registration_form_config);

  const bahan: BahanPantau = {
    sesi,
    checkpoints: daftar,
    agenda,
    peserta: peserta.map((orang) => ({
      id: orang.id,
      data: { jawaban: Object.fromEntries(kunci.map((key) => [key, jawabanPeserta(orang.extra, key)])), stays: stays.get(orang.id) ?? [], offset, kolom },
    })),
    scans: scans.map((isi): CatatanPantau => ({ kunci: Number(isi.session_id), participant_id: isi.participant_id, at: isi.scanned_at })),
    pickups: pickups.map((isi): CatatanPantau => ({ kunci: Number(isi.item_id), participant_id: isi.participant_id, at: isi.picked_up_at })),
    barang: new Map(((barangHasil.data ?? []) as Array<{ id: number; name: string }>).map((isi) => [Number(isi.id), isi.name])),
    sekarang,
    offset,
  };
  const orang = new Map<string, OrangPantau>(
    opsi.orang ? peserta.map((isi) => [isi.id, { name: isi.name ?? "", company: isi.company ?? null, extra: isi.extra }]) : [],
  );
  return { bahan, orang, checkpoints: daftar.map((cp) => ({ id: cp.id, agenda_item_ids: cp.agenda_item_ids })) };
}
