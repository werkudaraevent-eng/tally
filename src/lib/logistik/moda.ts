import type { ModaTiket } from "./types.ts";

/**
 * Kata untuk tiket perjalanan di Area peserta, per moda (kereta, pesawat,
 * kapal). Murni, diuji di `moda.check.ts`.
 *
 * Peserta yang semua tiketnya kereta melihat kata lama yang sama persis
 * ("Tiket kereta", "Kereta"): fungsi di sini mengembalikan `bawaan` untuk
 * mereka, jadi acara kereta saja tidak berubah sedikit pun.
 */

type Bahasa = "id" | "en";

/** Kata benda moda: "Kereta Gambir → Yogyakarta", "Pesawat pulang". */
export const KATA_MODA: Record<Bahasa, Record<ModaTiket, string>> = {
  id: { train: "Kereta", flight: "Pesawat", ship: "Kapal" },
  en: { train: "Train", flight: "Flight", ship: "Ship" },
};

const JUDUL: Record<Bahasa, Record<Exclude<ModaTiket, "train"> | "campur", string>> = {
  id: { flight: "Tiket pesawat", ship: "Tiket kapal", campur: "Tiket perjalanan" },
  en: { flight: "Flight tickets", ship: "Ship tickets", campur: "Travel tickets" },
};

const LOMPAT: Record<Bahasa, Record<Exclude<ModaTiket, "train"> | "campur", string>> = {
  id: { flight: "Pesawat", ship: "Kapal", campur: "Tiket" },
  en: { flight: "Flights", ship: "Ship", campur: "Tickets" },
};

/** Moda semua tiket: satu moda, "campur", atau null bila tidak ada tiket. Tiket tanpa mode dibaca kereta. */
export function modaTiket(tiket: ReadonlyArray<{ mode?: ModaTiket | null }>): ModaTiket | "campur" | null {
  const moda = new Set(tiket.map((t) => t.mode ?? "train"));
  if (moda.size === 0) return null;
  return moda.size === 1 ? [...moda][0] : "campur";
}

/** Judul kartu tiket. Semua kereta = `bawaan` (teks lama). */
export function judulTiket(lang: Bahasa, tiket: ReadonlyArray<{ mode?: ModaTiket | null }>, bawaan: string): string {
  const moda = modaTiket(tiket);
  return !moda || moda === "train" ? bawaan : JUDUL[lang][moda];
}

/** Label lompat-ke-bagian. Semua kereta = `bawaan` (teks lama). */
export function lompatTiket(lang: Bahasa, tiket: ReadonlyArray<{ mode?: ModaTiket | null }>, bawaan: string): string {
  const moda = modaTiket(tiket);
  return !moda || moda === "train" ? bawaan : LOMPAT[lang][moda];
}
