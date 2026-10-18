import type { LandingBlockType } from "../domain.ts";

/**
 * Kartu Darurat dan bantuan (E-03, Participant area > Emergency and help).
 *
 * Kartunya membaca judul, teks, dan tautan https setiap butir blok. Hanya blok
 * Columns yang punya ketiganya tanpa mewajibkan foto (sampai 8 kolom), jadi
 * hanya Columns yang bisa dipilih. Satu kolom = satu baris kartu. Image cards
 * meminta foto lebih dulu dan Point cards tidak punya tautan; jenis lain
 * (Countdown, Gallery, Logos, ...) tidak punya baris sama sekali.
 */
export const JENIS_BLOK_DARURAT: readonly LandingBlockType[] = ["multicolumn"];

export function jenisBlokDarurat(type: LandingBlockType): boolean {
  return JENIS_BLOK_DARURAT.includes(type);
}
