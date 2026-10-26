/**
 * Siapa yang melihat sebuah baris Agenda (Agenda > Edit item > Who sees it).
 *
 * Kosong berarti semua, jadi baris yang sudah ada berubah 0 px. Terisi: satu
 * sampai tiga syarat, dan peserta melihat baris itu hanya bila SEMUA syarat
 * cocok. Satu syarat sama dengan Who sees it blok Rute (sasaran-blok.ts): satu
 * kolom pilihan peserta atau Hotel dari Logistics, dengan satu atau beberapa
 * jawaban (salah satu cukup). Pola dari filter audiens Mailchimp dan HubSpot:
 * hanya DAN antarsyarat dan ATAU di dalam syarat, tanpa campuran bersarang.
 *
 * Beda dengan Who it's for di bagian (sasaran-bagian.ts) yang hanya
 * mengurutkan: baris bersyarat benar-benar disembunyikan, dan tidak pernah
 * tampil di halaman publik, layar /rundown, maupun badge.
 *
 * Murni, tanpa impor runtime selain sasaran-blok, supaya bisa diuji langsung
 * oleh Node (sasaran-baris.check.ts).
 */
import type { KolomSasaran } from "./sasaran-bagian.ts";
import { bacaSasaranBlok, blokUntukPeserta, KOLOM_HOTEL, samaJawaban, type DataSasaranPeserta, type SasaranBlok } from "./sasaran-blok.ts";

export type SyaratBaris = SasaranBlok[];

/** Syarat per baris, paling banyak sekian. Sama dengan CHECK di migrasi 202610210001. */
export const SYARAT_MAX = 3;

/** Syarat rusak: tidak cocok dengan siapa pun. */
const RUSAK: SasaranBlok = { field: "", values: [] };

/**
 * Bentuk tersimpan menjadi syarat, atau null (semua) bila kosong. Bentuk yang
 * ada tapi rusak menjadi syarat yang tidak cocok dengan siapa pun: gagal
 * tertutup, bukan tampil ke semua.
 */
export function bacaSyaratBaris(nilai: unknown): SyaratBaris | null {
  if (nilai === null || nilai === undefined) return null;
  if (!Array.isArray(nilai) || nilai.length === 0 || nilai.length > SYARAT_MAX) return [RUSAK];
  return nilai.map((isi) => bacaSasaranBlok(isi) ?? RUSAK);
}

/**
 * Peserta ini melihat barisnya? Tanpa syarat: ya. Dengan syarat: hanya bila
 * semua cocok. `tanggal`: hari baris itu, supaya Hotel cocok dengan stay yang
 * berlaku hari itu (pindah hotel).
 */
export function barisUntukPeserta(syarat: SyaratBaris | null, data: DataSasaranPeserta | null, tanggal: string | null = null): boolean {
  if (!syarat) return true;
  return syarat.every((isi) => blokUntukPeserta(isi, data, tanggal));
}

/**
 * Label kelompok baris bersyarat di halaman acara sebelum masuk, mis.
 * "Batch 1" atau "Batch 1 / Batch 2". Di sana Who sees it tidak menyaring, jadi
 * dua baris berjudul sama untuk dua batch perlu penanda (label track di agenda
 * publik Sched dan Whova).
 *
 * Hanya jawaban, tidak pernah kunci atau nama kolom, dan hanya dari kolom yang
 * panitia izinkan (Registration > Edit form > "Show answers in the public
 * agenda", `agenda_label`). Kolom khusus staf bisa berisi jawaban yang tidak
 * untuk umum, jadi tanpa izin itu, dan untuk Hotel dari Logistics, barisnya
 * tampil tanpa label. Satu syarat tanpa izin membuat seluruh label kosong:
 * label sebagian akan terbaca seolah itu syarat lengkapnya.
 */
export function labelAgendaPublik(syarat: SyaratBaris | null, kolom: ReadonlyArray<Pick<KolomSasaran, "key" | "options" | "label_agenda">>): string | null {
  if (!syarat || syarat.length === 0) return null;
  const bagian: string[] = [];
  for (const isi of syarat) {
    const pilihan = kolom.find((k) => k.key === isi.field);
    if (!pilihan || !pilihan.label_agenda) return null;
    // Teks pilihan apa adanya di formulir; jawaban yang sudah dihapus dari pilihan tidak ditulis.
    const jawaban = isi.values.map((nilai) => pilihan.options.find((opsi) => samaJawaban(opsi, nilai))).filter((opsi): opsi is string => Boolean(opsi));
    if (jawaban.length === 0) return null;
    bagian.push(jawaban.join(" / "));
  }
  return bagian.join(" · ");
}

/**
 * Syarat yang tidak bisa cocok dengan siapa pun: bentuknya rusak (kolom kosong,
 * tanpa jawaban), kolomnya sudah dihapus, atau tidak satu pun jawabannya masih
 * ada di pilihan kolom. Sesudah masuk baris itu tidak tampil ke siapa pun, jadi
 * halaman acara sebelum masuk juga menyembunyikannya. Hotel: tidak satu pun
 * hotel terpilih masih ada di Logistics (`hotel`, id sebagai teks). Tanpa
 * `hotel` (tidak dibaca) syarat Hotel tidak diperiksa.
 */
export function syaratTanpaPeserta(
  syarat: SyaratBaris | null,
  kolom: ReadonlyArray<Pick<KolomSasaran, "key" | "options">>,
  hotel: ReadonlySet<string> | null = null,
): boolean {
  if (!syarat) return false;
  return syarat.some((isi) => {
    if (!isi.field || isi.values.length === 0) return true;
    if (isi.field === KOLOM_HOTEL) return hotel !== null && !isi.values.some((id) => hotel.has(id));
    const pilihan = kolom.find((k) => k.key === isi.field);
    return !pilihan || !isi.values.some((nilai) => pilihan.options.some((opsi) => samaJawaban(opsi, nilai)));
  });
}
