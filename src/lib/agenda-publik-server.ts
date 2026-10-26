import { kolomSasaran } from "./sasaran-bagian";
import { labelAgendaPublik, syaratTanpaPeserta, type SyaratBaris } from "./sasaran-baris";
import { getSupabaseServiceClient } from "./supabase/service";

/**
 * Baris Agenda bersyarat di halaman sebelum masuk (halaman acara dan /rundown).
 * Who sees it tidak menyaring di sana, jadi baris per kelompok diberi label
 * jawabannya (labelAgendaPublik), dan baris yang syaratnya tidak cocok dengan
 * siapa pun (rusak, kolom atau jawaban sudah dihapus) tetap tersembunyi seperti
 * sesudah masuk. Formulir dibaca hanya bila ada baris bersyarat; gagal baca =
 * tanpa kolom, jadi tanpa label dan baris bersyarat kolom tersembunyi.
 */
export async function barisPublikBersyarat(eventId: string, syarat: ReadonlyMap<number, SyaratBaris>): Promise<{ tersembunyi: Set<number>; label: Map<number, string> }> {
  const tersembunyi = new Set<number>();
  const label = new Map<number, string>();
  if (syarat.size === 0) return { tersembunyi, label };
  const { data: acara, error } = await getSupabaseServiceClient().from("events").select("registration_form_config").eq("id", eventId).maybeSingle();
  const kolom = error ? [] : kolomSasaran((acara as { registration_form_config?: unknown } | null)?.registration_form_config);
  for (const [id, isi] of syarat) {
    if (syaratTanpaPeserta(isi, kolom)) tersembunyi.add(id);
    else {
      const teks = labelAgendaPublik(isi, kolom);
      if (teks) label.set(id, teks);
    }
  }
  return { tersembunyi, label };
}
