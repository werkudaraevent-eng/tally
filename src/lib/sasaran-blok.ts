/**
 * Untuk siapa sebuah blok di halaman peserta (Event page > blok > On the
 * participant page > Who sees it). Saat ini dipakai blok Rute.
 *
 * Kosong berarti semua peserta yang masuk, jadi blok yang sudah ada berubah
 * 0 px. Terisi: satu kolom dan satu atau beberapa jawaban, dengan pemilih yang
 * sama dengan Agenda > Who it's for. Kolomnya pertanyaan pilihan peserta
 * (dropdown atau radio, termasuk kolom khusus staf), atau Hotel dari Logistics
 * (`KOLOM_HOTEL`, jawabannya id hotel). Tidak ada daftar kelompok di kode.
 *
 * Beda dengan Agenda yang hanya mengurutkan: di sini blok benar-benar
 * disembunyikan dari peserta yang jawabannya tidak cocok atau kosong.
 *
 * Murni, tanpa impor runtime selain sasaran-bagian, supaya bisa diuji langsung
 * oleh Node (sasaran-blok.check.ts).
 */
import { jawabanPeserta, SASARAN_NILAI_MAX, SASARAN_NILAI_PANJANG, type KolomSasaran } from "./sasaran-bagian.ts";

export type SasaranBlok = { field: string; values: string[] };

/** Kunci kolom Hotel. Tidak bisa bentrok dengan kunci pertanyaan, yang hanya a-z, 0-9 dan _. */
export const KOLOM_HOTEL = "@hotel";

/** Baris Agenda yang menautkan satu blok, paling banyak sekian. */
export const TAUTAN_AGENDA_MAX = 8;

const sama = (a: string, b: string) => a.trim().toLocaleLowerCase("id") === b.trim().toLocaleLowerCase("id");

/**
 * Bentuk tersimpan menjadi sasaran, atau null (semua peserta) bila tidak ada
 * sasaran sama sekali. Sasaran yang ada tapi rusak (kolom tidak sah, id hotel
 * bukan angka, jawaban kosong) menjadi sasaran tanpa jawaban: tidak cocok
 * dengan siapa pun, jadi gagal tertutup, bukan tampil ke semua.
 */
export function bacaSasaranBlok(nilai: unknown): SasaranBlok | null {
  if (!nilai || typeof nilai !== "object" || Array.isArray(nilai)) return null;
  const baris = nilai as Record<string, unknown>;
  const field = typeof baris.field === "string" ? baris.field.trim() : "";
  const hotel = field === KOLOM_HOTEL;
  if (!hotel && !/^[a-z0-9_]{1,64}$/.test(field)) return { field: "", values: [] };
  const values: string[] = [];
  for (const isi of Array.isArray(baris.values) ? baris.values : []) {
    const teks = typeof isi === "number" ? String(isi) : typeof isi === "string" ? isi.trim().slice(0, SASARAN_NILAI_PANJANG) : "";
    if (!teks || (hotel && !/^[1-9]\d{0,17}$/.test(teks))) continue;
    if (!values.some((ada) => sama(ada, teks))) values.push(teks);
  }
  return { field, values: values.slice(0, SASARAN_NILAI_MAX) };
}

/** Id baris Agenda yang sah, tanpa duplikat. */
export function bacaTautanAgenda(nilai: unknown): number[] {
  if (!Array.isArray(nilai)) return [];
  return [...new Set(nilai.filter((isi): isi is number => Number.isSafeInteger(isi) && isi > 0))].slice(0, TAUTAN_AGENDA_MAX);
}

export type DataSasaranPeserta = {
  /** Jawaban peserta di kolom pertanyaan (participants.extra). */
  jawaban: Record<string, unknown>;
  /** Hotel peserta dari Logistics; null bila belum ditempatkan atau kamar tidak ditampilkan ke peserta. */
  hotelId: number | null;
  /** Kolom pertanyaan yang boleh dipakai acara ini, dengan pilihannya (lihat kolomSasaran). */
  kolom: ReadonlyArray<Pick<KolomSasaran, "key" | "options">>;
};

/**
 * Peserta ini melihat bloknya? Tanpa sasaran: ya. Dengan sasaran: hanya bila
 * jawabannya cocok dengan jawaban terpilih yang masih ada di pilihan kolomnya.
 * Jawaban kosong, kolom atau pilihan yang sudah dihapus dari formulir, atau
 * hotel yang tidak diketahui berarti tidak (sama dengan "Nowhere for now" di CMS).
 */
export function blokUntukPeserta(sasaran: SasaranBlok | null, data: DataSasaranPeserta | null): boolean {
  if (!sasaran) return true;
  if (!data) return false;
  if (sasaran.field === KOLOM_HOTEL) return data.hotelId !== null && sasaran.values.includes(String(data.hotelId));
  const kolom = data.kolom.find((isi) => isi.key === sasaran.field);
  if (!kolom) return false;
  const jawaban = jawabanPeserta(data.jawaban, sasaran.field);
  return jawaban !== null && sasaran.values.some((nilai) => sama(nilai, jawaban) && kolom.options.some((opsi) => sama(opsi, nilai)));
}
