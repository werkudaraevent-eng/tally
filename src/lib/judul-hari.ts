/**
 * Apakah judul bagian sudah menyebut tanggal harinya ("Jumat, 06 November 2026"
 * untuk 2026-11-06)? Bila ya, baris tanggal di bawah judul tidak ditulis lagi,
 * supaya tamu tidak membaca tanggal yang sama dua kali.
 *
 * Cocok bila judul memuat angka tanggal (boleh berawalan nol) dan nama bulannya
 * dalam bahasa Indonesia atau Inggris, panjang atau tiga huruf ("Nov").
 */
const BULAN: string[][] = [
  ["januari", "january", "jan"],
  ["februari", "february", "feb"],
  ["maret", "march", "mar"],
  ["april", "apr"],
  ["mei", "may"],
  ["juni", "june", "jun"],
  ["juli", "july", "jul"],
  ["agustus", "august", "agu", "aug"],
  ["september", "sept", "sep"],
  ["oktober", "october", "okt", "oct"],
  ["november", "nov"],
  ["desember", "december", "des", "dec"],
];

export function judulMemuatTanggal(judul: string | null | undefined, tanggal: string | null | undefined): boolean {
  if (!judul || !tanggal) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal);
  if (!m) return false;
  const hari = Number(m[3]);
  const bulan = BULAN[Number(m[2]) - 1];
  if (!bulan) return false;
  const teks = judul.toLowerCase();
  const adaHari = new RegExp(`(^|[^0-9])0?${hari}([^0-9]|$)`).test(teks);
  const adaBulan = bulan.some((nama) => new RegExp(`(^|[^a-z])${nama}([^a-z]|$)`).test(teks));
  return adaHari && adaBulan;
}
