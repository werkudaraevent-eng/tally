import type { KelompokBaris } from "./agenda-kelompok";
import { kolomSasaran } from "./sasaran-bagian";
import { labelAgendaPublik, syaratTanpaPeserta, type SyaratBaris } from "./sasaran-baris";
import { KOLOM_HOTEL, samaJawaban } from "./sasaran-blok";
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
export type BarisPublik = {
  tersembunyi: Set<number>;
  label: Map<number, string>;
  /** Jawaban baris berlabel per kelompok, untuk pilihan "Semua · Batch 1 · …" (agenda-kelompok.ts). */
  kelompok: Map<number, KelompokBaris[]>;
  /** Jawaban yang dipakai per kelompok, urut seperti pilihan pertanyaannya. Tanpa nama pertanyaan. */
  pilihan: string[][];
};

export async function barisPublikBersyarat(eventId: string, syarat: ReadonlyMap<number, SyaratBaris>): Promise<BarisPublik> {
  const tersembunyi = new Set<number>();
  const label = new Map<number, string>();
  const kelompok = new Map<number, KelompokBaris[]>();
  if (syarat.size === 0) return { tersembunyi, label, kelompok, pilihan: [] };
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
  // Jawaban terpakai per kolom berlabel; nomor kelompok mengikuti urutan pertanyaan di formulir.
  const terpakai = new Map<string, Set<string>>();
  const jawabanBaris = new Map<number, Array<{ key: string; nilai: string[] }>>();
  for (const [id, isi] of syarat) {
    if (syaratTanpaPeserta(isi, kolom, hotel)) {
      tersembunyi.add(id);
      continue;
    }
    const teks = labelAgendaPublik(isi, kolom);
    if (teks) label.set(id, teks);
    // Kelompok dari setiap syarat berlabel, juga bila syarat lain (Hotel, kolom
    // tanpa label) membuat baris tanpa label: baris "Batch 2 + Hotel GRAMM"
    // tetap hilang saat tamu memilih Batch 1 (QA #283 L3).
    const per = isi.flatMap((s) => {
      const k = kolom.find((kol) => kol.key === s.field);
      if (!k?.label_agenda) return [];
      const nilai = k.options.filter((o) => s.values.some((v) => samaJawaban(o, v)));
      if (nilai.length === 0) return [];
      const set = terpakai.get(s.field) ?? new Set<string>();
      for (const n of nilai) set.add(n);
      terpakai.set(s.field, set);
      return [{ key: s.field, nilai }];
    });
    if (per.length > 0) jawabanBaris.set(id, per);
  }
  const urutan = kolom.filter((k) => terpakai.has(k.key));
  const pilihan = urutan.map((k) => k.options.filter((o) => terpakai.get(k.key)!.has(o)));
  for (const [id, per] of jawabanBaris) {
    kelompok.set(id, per.map((p) => ({ grup: urutan.findIndex((k) => k.key === p.key), nilai: p.nilai })));
  }
  return { tersembunyi, label, kelompok, pilihan };
}
