import type { LandingBlock } from "./domain";
import { kolomSasaran } from "./sasaran-bagian";
import { loadExtraPeserta } from "./sasaran-bagian-server";
import { bacaSasaranBlok, blokUntukPeserta, KOLOM_HOTEL, type DataSasaranPeserta } from "./sasaran-blok";
import { getSupabaseServiceClient } from "./supabase/service";

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
export async function saringBlokPeserta(
  blocks: LandingBlock[],
  acara: { id: string; registration_form_config: unknown },
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
  acara: { id: string; registration_form_config: unknown },
  participantId: string,
  sasaran: { field: string }[],
  tampilKamar: boolean,
): Promise<DataSasaranPeserta> {
  const kunci = new Set(sasaran.map((isi) => isi.field).filter((field) => field !== KOLOM_HOTEL));
  const pakaiHotel = tampilKamar && sasaran.some((isi) => isi.field === KOLOM_HOTEL);
  const [extra, hotelId] = await Promise.all([
    kunci.size > 0 ? loadExtraPeserta(acara.id, participantId) : {},
    pakaiHotel ? muatHotelPeserta(acara.id, participantId) : null,
  ]);
  // Hanya kunci yang dipakai sasaran, bukan seluruh `extra`.
  const jawaban = Object.fromEntries(Object.entries(extra).filter(([key]) => kunci.has(key)));
  return { jawaban, hotelId, kolom: kolomSasaran(acara.registration_form_config) };
}

/**
 * Id hotel peserta (lodging_assignments.hotel_id), atau null. Tidak melempar.
 * Tamu yang nomor kamarnya menyusul sudah punya hotel, jadi Rute dan Agenda
 * per hotel sudah berlaku untuknya.
 */
async function muatHotelPeserta(eventId: string, participantId: string): Promise<number | null> {
  try {
    const db = getSupabaseServiceClient();
    const tempat = await db.from("lodging_assignments" as never).select("hotel_id").eq("event_id", eventId).eq("participant_id", participantId).maybeSingle();
    const hotelId = (tempat.data as { hotel_id?: number } | null)?.hotel_id;
    return tempat.error || !hotelId ? null : Number(hotelId);
  } catch {
    return null;
  }
}
