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
import { bacaSasaranBlok, blokUntukPeserta, type DataSasaranPeserta, type SasaranBlok } from "./sasaran-blok.ts";

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

/** Peserta ini melihat barisnya? Tanpa syarat: ya. Dengan syarat: hanya bila semua cocok. */
export function barisUntukPeserta(syarat: SyaratBaris | null, data: DataSasaranPeserta | null): boolean {
  if (!syarat) return true;
  return syarat.every((isi) => blokUntukPeserta(isi, data));
}
