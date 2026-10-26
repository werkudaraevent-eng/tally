import { kolomSasaran } from "./sasaran-bagian";
import { labelAgendaPublik, syaratTanpaPeserta, type SyaratBaris } from "./sasaran-baris";
import { KOLOM_HOTEL } from "./sasaran-blok";
import { getSupabaseServiceClient } from "./supabase/service";

/**
 * Baris Agenda bersyarat di halaman sebelum masuk (halaman acara dan /rundown).
 * Who sees it tidak menyaring di sana, jadi baris per kelompok diberi label
 * jawabannya (labelAgendaPublik), dan baris yang syaratnya tidak cocok dengan
 * siapa pun (rusak, kolom atau jawaban sudah dihapus) tetap tersembunyi seperti
 * sesudah masuk. Formulir (dan hotel, bila ada syarat Hotel) dibaca hanya bila
 * ada baris bersyarat; gagal baca = tanpa kolom atau hotel, jadi tanpa label dan
 * baris bersyarat itu tersembunyi.
 */
export async function barisPublikBersyarat(eventId: string, syarat: ReadonlyMap<number, SyaratBaris>): Promise<{ tersembunyi: Set<number>; label: Map<number, string> }> {
  const tersembunyi = new Set<number>();
  const label = new Map<number, string>();
  if (syarat.size === 0) return { tersembunyi, label };
  const db = getSupabaseServiceClient();
  const pakaiHotel = [...syarat.values()].some((isi) => isi.some((s) => s.field === KOLOM_HOTEL));
  const [form, daftarHotel] = await Promise.all([
    db.from("events").select("registration_form_config").eq("id", eventId).maybeSingle(),
    pakaiHotel ? db.from("lodging_hotels" as never).select("id").eq("event_id", eventId) : null,
  ]);
  const kolom = form.error ? [] : kolomSasaran((form.data as { registration_form_config?: unknown } | null)?.registration_form_config);
  // Hotel yang sudah dihapus dari Logistics tidak cocok dengan siapa pun.
  // Gagal baca = tidak ada hotel: baris Hotel tersembunyi (gagal tertutup).
  const hotel = daftarHotel
    ? new Set(daftarHotel.error ? [] : ((daftarHotel.data ?? []) as Array<{ id: number | string }>).map((h) => String(h.id)))
    : null;
  for (const [id, isi] of syarat) {
    if (syaratTanpaPeserta(isi, kolom, hotel)) tersembunyi.add(id);
    else {
      const teks = labelAgendaPublik(isi, kolom);
      if (teks) label.set(id, teks);
    }
  }
  return { tersembunyi, label };
}
