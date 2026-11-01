import type { LandingSpeaker } from "./domain";

/**
 * Profil pembicara di halaman acara: aturan dan teks bawaan, tanpa tampilan.
 * Sengaja bukan modul "use client": tata letak server (Editorial, Trip) juga
 * memanggil `punyaProfil`, dan fungsi dari modul klien tidak bisa dipanggil di
 * server (500 di build produksi).
 */

/** Teks bawaan dialog profil, dalam bahasa halaman. */
export type TeksProfil = { profil: string; tutup: string; tautan: string };
export const TEKS_PROFIL_ID: TeksProfil = { profil: "Lihat profil", tutup: "Tutup", tautan: "Profil lengkap" };

/** Kartu bisa dibuka bila ada profil atau tautan; tanpa keduanya kartu tetap seperti dulu (0 px). */
export function punyaProfil(speaker: LandingSpeaker): boolean {
  return Boolean(speaker.bio?.trim() || speaker.link?.trim());
}
