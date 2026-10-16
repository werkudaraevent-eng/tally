import { z } from "zod";

/**
 * Outfit (dress code) per bagian Agenda: kolom `rundown_sections.outfit`
 * (migrasi 202610160001). Dipakai bersama server dan browser, jadi modul ini
 * bebas impor server.
 *
 * Polanya dari platform acara: Zola menulis "Attire" di bawah tiap acara, app
 * Royal Caribbean menampilkan "Tonight's Attire" per hari. Di Tally satu bagian
 * Agenda adalah satu hari (atau satu batch), jadi outfit menempel di bagian itu.
 */

export const OUTFIT_MAX = 3;
export const OUTFIT_BATAS = { when: 40, what: 120, note: 200 } as const;
/** Label menu bawaan; sama di kedua bahasa. */
export const OUTFIT_LABEL_BAWAAN = "Outfit";
export const OUTFIT_LABEL_MAX = 16;

export type OutfitEntry = { when?: string; what: string; note?: string; photo_url?: string };

/** Teks opsional: kosong berarti tidak diisi, bukan string kosong yang tersimpan. */
const opsional = (maks: number) =>
  z
    .string()
    .trim()
    .max(maks)
    .nullish()
    .transform((nilai) => nilai || undefined);

/** Foto contoh hanya https: (hasil unggah Supabase Storage). `javascript:` dan http ditolak. */
const fotoHttps = z
  .string()
  .trim()
  .max(600)
  .nullish()
  .transform((nilai) => nilai || undefined)
  .refine((nilai) => nilai === undefined || urlHttps(nilai), "Photo must be an https:// address.");

export const outfitEntrySchema = z.object({
  when: opsional(OUTFIT_BATAS.when),
  what: z.string().trim().min(1, "What to wear is required.").max(OUTFIT_BATAS.what),
  note: opsional(OUTFIT_BATAS.note),
  photo_url: fotoHttps,
});

export const outfitSchema = z.array(outfitEntrySchema).max(OUTFIT_MAX);

function urlHttps(nilai: string): boolean {
  try {
    return new URL(nilai).protocol === "https:" && !/[\s"'<>\\]/.test(nilai);
  } catch {
    return false;
  }
}

/**
 * Isi kolom apa adanya menjadi daftar yang aman dirender. Toleran: nilai yang
 * bukan array, isian tanpa `what`, dan foto yang bukan http(s) dibuang, bukan
 * menggagalkan halaman peserta.
 */
export function bacaOutfit(nilai: unknown): OutfitEntry[] {
  if (!Array.isArray(nilai)) return [];
  const teks = (isi: unknown, maks: number) => (typeof isi === "string" && isi.trim() ? isi.trim().slice(0, maks) : undefined);
  return nilai
    .slice(0, OUTFIT_MAX)
    .flatMap((isi): OutfitEntry[] => {
      if (!isi || typeof isi !== "object") return [];
      const baris = isi as Record<string, unknown>;
      const what = teks(baris.what, OUTFIT_BATAS.what);
      if (!what) return [];
      const foto = teks(baris.photo_url, 600);
      return [
        {
          what,
          ...(teks(baris.when, OUTFIT_BATAS.when) ? { when: teks(baris.when, OUTFIT_BATAS.when) } : {}),
          ...(teks(baris.note, OUTFIT_BATAS.note) ? { note: teks(baris.note, OUTFIT_BATAS.note) } : {}),
          // Ditulis hanya https lewat API; data uji lokal memakai http, jadi http(s) diterima saat membaca.
          ...(foto && /^https?:\/\/[^\s"'<>\\]+$/i.test(foto) ? { photo_url: foto } : {}),
        },
      ];
    });
}

/** Label menu Outfit acara ini (`landing_config.member.outfit_label`). */
export function labelOutfit(label: string | null | undefined): string {
  return label?.trim().slice(0, OUTFIT_LABEL_MAX) || OUTFIT_LABEL_BAWAAN;
}

/** Kolom outfit belum ada: migrasi 202610160001 belum dijalankan. */
export function kolomOutfitBelumAda(error: { code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204";
}

export type HariOutfitBeranda = { indeks: number; jenis: "hariIni" | "besok" | "pertama" | "terakhir" | "nanti" };

/**
 * Hari yang outfitnya tampil di Beranda, seperti agenda Beranda: hari ini
 * selama acara, hari berikutnya di sela acara (besok atau hari pertama sebelum
 * acara), hari terakhir sesudahnya. Dua bagian di tanggal yang sama (Batch 1
 * dan 2): yang pertama berisi outfit. Null bila hari terpilih tanpa outfit.
 */
export function hariOutfitBeranda(hari: Array<{ tanggal: string | null; outfit: OutfitEntry[] }>, hariIni: string, besok: string): HariOutfitBeranda | null {
  if (hari.length === 0) return null;
  const pilih = (indeks: number, jenis: HariOutfitBeranda["jenis"]) => (indeks >= 0 && hari[indeks].outfit.length > 0 ? { indeks, jenis } : null);
  const sama = (tanggal: string) => {
    const berisi = hari.findIndex((h) => h.tanggal === tanggal && h.outfit.length > 0);
    return berisi >= 0 ? berisi : hari.findIndex((h) => h.tanggal === tanggal);
  };
  if (hari.some((h) => h.tanggal === hariIni)) return pilih(sama(hariIni), "hariIni");
  // Tanpa tanggal sama sekali: hari pertama.
  if (!hari.some((h) => h.tanggal)) return pilih(0, "pertama");
  const berikut = hari.findIndex((h) => h.tanggal !== null && h.tanggal > hariIni);
  if (berikut < 0) return pilih(hari.length - 1, "terakhir");
  const tanggal = hari[berikut].tanggal!;
  const indeks = sama(tanggal);
  return pilih(indeks, tanggal === besok ? "besok" : indeks === 0 ? "pertama" : "nanti");
}
