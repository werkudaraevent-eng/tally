/** Sisi terpanjang foto bagasi setelah dikecilkan di ponsel (lihat app/scan/kecilkan-foto.ts). */
export const SISI_MAKS = 1280;

/** Ukuran baru dengan rasio sama; sisi terpanjang paling banyak `maks`. Tidak pernah membesarkan. */
export function ukuranBaru(lebar: number, tinggi: number, maks = SISI_MAKS): { lebar: number; tinggi: number } {
  const skala = Math.min(1, maks / Math.max(lebar, tinggi, 1));
  return { lebar: Math.max(1, Math.round(lebar * skala)), tinggi: Math.max(1, Math.round(tinggi * skala)) };
}
