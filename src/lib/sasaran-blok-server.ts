import type { LandingBlock } from "./domain";
import { kolomSasaran } from "./sasaran-bagian";
import { loadExtraPeserta } from "./sasaran-bagian-server";
import { bacaSasaranBlok, blokUntukPeserta, KOLOM_HOTEL, type DataSasaranPeserta } from "./sasaran-blok";
import { getSupabaseServiceClient } from "./supabase/service";
import { tanggalStay } from "./logistik/stay";
import { normalizeTimeZone, timeZoneOffset } from "./timezone";

/**
 * Blok halaman peserta yang boleh dilihat peserta ini (Who sees it, lihat
 * src/lib/sasaran-blok.ts). Blok tanpa sasaran selalu lolos, jadi acara yang
 * tidak memakainya tidak membaca apa pun dan berubah 0 px.
 *
 * Hotel peserta hanya dibaca bila panitia menampilkan kamar ke peserta
 * (`tampilKamar`, Participant area > show_logistics): penempatan yang belum
 * siap tidak boleh terbaca lewat rute yang muncul atau hilang. Tanpa peserta
 * (pratinjau tanpa pilihan), blok bersasaran disembunyikan.
 */
type AcaraSasaran = { id: string; registration_form_config: unknown; time_zone?: unknown };

export async function saringBlokPeserta(
  blocks: LandingBlock[],
  acara: AcaraSasaran,
  participantId: string | null,
  tampilKamar: boolean,
): Promise<LandingBlock[]> {
  const sasaran = new Map(blocks.map((block) => [block, bacaSasaranBlok(block.audience)] as const));
  const terpakai = [...sasaran.values()].filter((isi) => isi !== null);
  if (terpakai.length === 0) return blocks;
  const data = participantId ? await muatDataSasaran(acara, participantId, terpakai, tampilKamar) : null;
  return blocks.filter((block) => blokUntukPeserta(sasaran.get(block) ?? null, data));
}

/**
 * Jawaban peserta di kolom-kolom yang dipakai sasaran, dan hotelnya bila ada
 * sasaran Hotel dan kamar ditampilkan ke peserta. Dipakai juga Who sees it
 * baris Agenda (loadAgendaPreview).
 */
export async function muatDataSasaran(
  acara: AcaraSasaran,
  participantId: string,
  sasaran: { field: string }[],
  tampilKamar: boolean,
): Promise<DataSasaranPeserta> {
  const kunci = new Set(sasaran.map((isi) => isi.field).filter((field) => field !== KOLOM_HOTEL));
  const pakaiHotel = tampilKamar && sasaran.some((isi) => isi.field === KOLOM_HOTEL);
  const [extra, stays] = await Promise.all([
    kunci.size > 0 ? loadExtraPeserta(acara.id, participantId) : {},
    pakaiHotel ? muatStayPeserta(acara.id, participantId) : [],
  ]);
  // Hanya kunci yang dipakai sasaran, bukan seluruh `extra`.
  const jawaban = Object.fromEntries(Object.entries(extra).filter(([key]) => kunci.has(key)));
  return { jawaban, stays, offset: timeZoneOffset(normalizeTimeZone(acara.time_zone)), kolom: kolomSasaran(acara.registration_form_config) };
}

/**
 * Stay hotel peserta (lodging_assignments) dengan tanggal efektifnya: milik
 * stay, lalu hotelnya. Kosong bila belum ditempatkan atau gagal; tidak
 * melempar. Tamu yang nomor kamarnya menyusul sudah punya hotel, jadi Rute
 * dan Agenda per hotel sudah berlaku untuknya.
 */
export async function muatStayPeserta(eventId: string, participantId: string): Promise<DataSasaranPeserta["stays"]> {
  try {
    const db = getSupabaseServiceClient();
    const tempat = await db.from("lodging_assignments" as never).select("hotel_id,check_in_at,check_out_at").eq("event_id", eventId).eq("participant_id", participantId);
    const baris = (tempat.data ?? []) as Array<{ hotel_id: number; check_in_at: string | null; check_out_at: string | null }>;
    if (tempat.error || baris.length === 0) return [];
    const hotel = await db.from("lodging_hotels" as never).select("id,check_in_at,check_out_at").eq("event_id", eventId).in("id", baris.map((b) => b.hotel_id));
    const hotelById = new Map(((hotel.data ?? []) as Array<{ id: number; check_in_at: string | null; check_out_at: string | null }>).map((h) => [Number(h.id), h]));
    return baris.map((b) => {
      const t = tanggalStay({ hotel_id: Number(b.hotel_id), check_in_at: b.check_in_at, check_out_at: b.check_out_at }, hotelById.get(Number(b.hotel_id)));
      return { hotel_id: Number(b.hotel_id), masuk: t.masuk, keluar: t.keluar };
    });
  } catch {
    return [];
  }
}
