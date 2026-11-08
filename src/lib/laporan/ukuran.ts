/**
 * Ukuran slide HTML (pratinjau, tab klien, cetak PDF), supaya teks panjang
 * mengecil atau dipotong dengan cara yang sama di semua tampilan dan tidak
 * pernah menimpa kaki slide. Semua dalam px kanvas 1280×720.
 */
import type { BlokAngka, BlokTabel } from "./jenis.ts";

/** Lebar isi slide (1280 − 2×64) dan kolom kiri tata "dua". */
export const LEBAR_PENUH = 1152;
export const LEBAR_KIRI = Math.round(((LEBAR_PENUH - 56) * 1.4) / 2.4);
export const LEBAR_KANAN = LEBAR_PENUH - 56 - LEBAR_KIRI;
export const LEBAR_BATANG = 196;
/** Usulan: tiap sel paling banyak 3 baris. */
export const BARIS_SEL = 3;

/** Judul 1 baris di 40 px; makin panjang makin kecil, supaya 140 huruf tetap muat 3 baris. */
export function ukuranJudul(teks: string): number {
  if (teks.length > 100) return 30;
  if (teks.length > 60) return 34;
  return 40;
}

export function ukuranCatatan(teks: string): number {
  return teks.length > 120 ? 16 : 18;
}

/** Angka besar: 64 px bila muat satu baris di lebar kolomnya, lebih kecil bila tidak (≥ 32). */
export function ukuranAngka(b: BlokAngka, lebarBlok: number): number {
  const n = Math.max(b.isi.length, 1);
  const ruang = lebarBlok / n - 36;
  const huruf = Math.max(...b.isi.map((x) => x.nilai.length), 1);
  // Inter semibold tabular: lebar rata-rata satu karakter sekitar 0,6 em.
  return Math.max(32, Math.min(64, Math.floor(ruang / (huruf * 0.6))));
}

/** Daftar panjang: `atas` teratas dan `bawah` terbawah, sisanya di tengah. */
export function ujung<T>(daftar: T[], atas: number, bawah: number): { atas: T[]; tengah: T[]; bawah: T[] } {
  if (daftar.length <= atas + bawah + 1) return { atas: daftar, tengah: [], bawah: [] };
  return { atas: daftar.slice(0, atas), tengah: daftar.slice(atas, daftar.length - bawah), bawah: daftar.slice(daftar.length - bawah) };
}

/** Potong ke `n` karakter dengan elipsis. */
export function potong(teks: string, n: number): string {
  return teks.length > n ? `${teks.slice(0, Math.max(n - 1, 1)).trimEnd()}…` : teks;
}

/** Karakter yang muat di satu baris sel selebar `px` pada huruf `font` px. */
export const muatSatuBaris = (px: number, font: number) => Math.max(4, Math.floor((px - 20) / (font * 0.55)));

/**
 * Lebar tiap kolom tabel (px), termasuk kolom batang bila ada. Kolom angka
 * selebar isinya; kolom teks berbagi sisanya. Tata letak tetap, jadi nama
 * panjang tidak menggeser batang atau menumbuhkan baris.
 */
export function lebarKolom(b: BlokTabel, lebarBlok: number): number[] {
  const setelah = b.batangSetelah ?? -1;
  const adaBatang = setelah >= 0 && b.baris.some((r) => typeof r.batang === "number");
  const batang = adaBatang ? (lebarBlok < 800 ? 110 : LEBAR_BATANG) : 0;
  // Kepala 16 px (sekitar 9,5 px per huruf), isi 19 px tabular (sekitar 13 px dengan tanda %), ditambah padding 20 dan sedikit sisa.
  const angka = b.kolom.map((k, i) => {
    if (!k.kanan) return 0;
    const isi = Math.max(...b.baris.map((r) => (r.sel[i] ?? "").length), 1);
    return Math.min(160, Math.max(56, Math.ceil(Math.max(k.label.length * 9.5, isi * 13)) + 28));
  });
  const teks = b.kolom.filter((k) => !k.kanan).length;
  const sisa = Math.max(lebarBlok - batang - angka.reduce((a, x) => a + x, 0), 120 * teks);
  const lebar = b.kolom.map((k, i) => (k.kanan ? angka[i] : sisa / Math.max(teks, 1)));
  return lebar.flatMap((x, i) => (adaBatang && i === setelah ? [x, batang] : [x]));
}
