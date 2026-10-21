import { z } from "zod";
import { labelPembeda, tanpaLabelBagian } from "./member/hari-agenda.ts";
import type { PilihanPeserta } from "./sasaran-bagian.ts";

/**
 * Outfit (dress code) per bagian Agenda: kolom `rundown_sections.outfit`
 * (migrasi 202610160001). Dipakai bersama server dan browser, jadi modul ini
 * bebas impor server.
 *
 * Polanya dari platform acara: Zola menulis "Attire" di bawah tiap acara, app
 * Royal Caribbean menampilkan "Tonight's Attire" per hari. Di Tally satu bagian
 * Agenda adalah satu hari (atau satu batch), jadi outfit menempel di bagian itu.
 *
 * Tiap isian untuk sesuatu (Agenda > Dress code): seharian, satu baris agenda
 * tab itu (`item_id`), atau sebagian hari bernama (`when`). Jenisnya diturunkan,
 * tidak disimpan, jadi isian lama tanpa `item_id` sudah cocok dengan aturannya.
 */

export const OUTFIT_MAX = 3;
export const OUTFIT_BATAS = { when: 40, what: 120, note: 200 } as const;
/** Label halaman bawaan; sama di kedua bahasa. */
export const OUTFIT_LABEL_BAWAAN = "Outfit";
export const OUTFIT_LABEL_MAX = 16;

/**
 * `item_id`: baris `rundown_items` di bagian yang sama. Untuk baris, `when`
 * ditulis server ("17.30 Gala Dinner") dan dibaca peserta apa adanya, jadi
 * portal tidak perlu tahu tautannya.
 */
export type OutfitEntry = { item_id?: number; when?: string; what: string; note?: string; photo_url?: string };

/** `baris`: satu baris agenda. `waktu`: sebagian hari bernama ("Malam hari"). */
export type JenisOutfit = "seharian" | "baris" | "waktu";

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
  // Tanpa ini zod membuang kuncinya, dan tautan ke baris hilang saat disimpan.
  item_id: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((nilai) => nilai ?? undefined),
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
      const idBaris = baris.item_id;
      return [
        {
          what,
          ...(typeof idBaris === "number" && Number.isInteger(idBaris) && idBaris > 0 ? { item_id: idBaris } : {}),
          ...(teks(baris.when, OUTFIT_BATAS.when) ? { when: teks(baris.when, OUTFIT_BATAS.when) } : {}),
          ...(teks(baris.note, OUTFIT_BATAS.note) ? { note: teks(baris.note, OUTFIT_BATAS.note) } : {}),
          // Ditulis hanya https lewat API; data uji lokal memakai http, jadi http(s) diterima saat membaca.
          ...(foto && /^https?:\/\/[^\s"'<>\\]+$/i.test(foto) ? { photo_url: foto } : {}),
        },
      ];
    });
}

/** Label halaman Outfit acara ini (`landing_config.member.outfit_label`). */
export function labelOutfit(label: string | null | undefined): string {
  return label?.trim().slice(0, OUTFIT_LABEL_MAX) || OUTFIT_LABEL_BAWAAN;
}

/** `item_id` = baris agenda; tanpa itu `when` = sebagian hari; selain itu seharian. */
export function jenisOutfit(isian: Pick<OutfitEntry, "item_id" | "when">): JenisOutfit {
  if (isian.item_id) return "baris";
  return isian.when?.trim() ? "waktu" : "seharian";
}

/** Urutan tersimpan, kecuali isian seharian yang selalu di depan. */
export function urutOutfit<T extends Pick<OutfitEntry, "item_id" | "when">>(daftar: readonly T[]): T[] {
  const seharian = (isian: T) => jenisOutfit(isian) === "seharian";
  return [...daftar.filter(seharian), ...daftar.filter((isian) => !seharian(isian))];
}

export type MasalahOutfit = { jenis: "terlaluBanyak" } | { jenis: "seharianGanda" } | { jenis: "barisGanda"; item_id: number };

/**
 * Aturan daftar satu tab, sama di editor dan server: paling banyak tiga isian,
 * satu seharian, dan satu baris agenda tidak ditautkan dua kali. Null bila sah.
 */
export function cekDaftarOutfit(daftar: readonly Pick<OutfitEntry, "item_id" | "when">[]): MasalahOutfit | null {
  if (daftar.length > OUTFIT_MAX) return { jenis: "terlaluBanyak" };
  if (daftar.filter((isian) => jenisOutfit(isian) === "seharian").length > 1) return { jenis: "seharianGanda" };
  const dilihat = new Set<number>();
  for (const isian of daftar) {
    if (!isian.item_id) continue;
    if (dilihat.has(isian.item_id)) return { jenis: "barisGanda", item_id: isian.item_id };
    dilihat.add(isian.item_id);
  }
  return null;
}

/** Paling panjang `maks` huruf termasuk "…", tanpa memutus pasangan surrogate. */
function potong(teks: string, maks: number): string {
  if (teks.length <= maks) return teks;
  let hasil = "";
  for (const huruf of teks) {
    if (hasil.length + huruf.length > maks - 1) break;
    hasil += huruf;
  }
  return `${hasil.trimEnd()}…`;
}

/**
 * `when` yang ditulis server untuk isian baris, mis. "17.30 Gala Dinner": jam
 * bertitik seperti jam peserta, judul tanpa label batch di ujungnya (`label`,
 * dari labelTabOutfit), paling panjang 40 huruf termasuk "…" karena bacaOutfit
 * memotong `when` di 40.
 */
export function teksWaktuOutfit(startTime: string, title: string, label: string | null = null): string {
  const jam = /^(\d{1,2}):(\d{2})/.exec(startTime.trim());
  const judul = tanpaLabelBagian(title.trim(), label);
  return potong([jam ? `${jam[1].padStart(2, "0")}.${jam[2]}` : "", judul].filter(Boolean).join(" "), OUTFIT_BATAS.when);
}

type TabOutfit = { id: number; name: string | null; title?: string | null; event_date: string | null };

/**
 * Label pembeda tab ini di antara tab bertanggal sama ("Batch 1"), dibentuk
 * dari nama tab seperti segmen Batch di portal. Null bila tanggalnya satu tab.
 */
export function labelTabOutfit(tabs: readonly TabOutfit[], id: number): string | null {
  const tab = tabs.find((isi) => isi.id === id);
  if (!tab?.event_date) return null;
  const sama = tabs.filter((isi) => isi.event_date === tab.event_date);
  return labelPembeda(sama.map((isi) => isi.name?.trim() || isi.title?.trim() || null))[sama.indexOf(tab)] ?? null;
}

/** Kolom outfit belum ada: migrasi 202610160001 belum dijalankan. */
export function kolomOutfitBelumAda(error: { code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204";
}

export type HariOutfitBeranda = { indeks: number; jenis: "hariIni" | "besok" | "pertama" | "terakhir" | "nanti" };

type HariOutfit = { tanggal: string | null; outfit: OutfitEntry[] };
type PilihanBagian = Pick<PilihanPeserta, "milik" | "bukanMilik">;

/**
 * Bagian yang outfitnya dipakai untuk satu tanggal (indeks di `hari`, -1 bila
 * tidak ada). Bagian kelompok lain (Agenda > Who it's for) tidak dipakai. Dari
 * bagian yang boleh: milik peserta yang berisi outfit, lalu yang berisi (bagian
 * untuk semua), lalu milik peserta, lalu yang pertama. Tanpa jawaban batch:
 * yang pertama berisi outfit.
 *
 * `buka`: untuk navigasi halaman Outfit saja. Tanggal yang semua bagiannya
 * untuk kelompok lain tetap dibuka, seperti tab Jadwal; Beranda tidak pernah
 * menampilkan outfit kelompok lain.
 */
export function bagianOutfitTanggal(hari: readonly HariOutfit[], tanggal: string, pilihan?: PilihanBagian | null, buka = false): number {
  const diTanggal = hari.flatMap((h, indeks) => (h.tanggal === tanggal ? [indeks] : []));
  const boleh = pilihan ? diTanggal.filter((indeks) => !pilihan.bukanMilik.has(indeks)) : diTanggal;
  const kandidat = boleh.length > 0 ? boleh : buka ? diTanggal : [];
  const berisi = (indeks: number) => hari[indeks].outfit.length > 0;
  const milik = pilihan ? kandidat.filter((indeks) => pilihan.milik.has(indeks)) : [];
  return milik.find(berisi) ?? kandidat.find(berisi) ?? milik[0] ?? kandidat[0] ?? -1;
}

/**
 * Hari yang outfitnya tampil di Beranda, seperti agenda Beranda: hari ini
 * selama acara, hari berikutnya di sela acara (besok atau hari pertama sebelum
 * acara), hari terakhir sesudahnya. Hanya tanggal yang punya bagian untuk
 * peserta ini (bagianOutfitTanggal); tanggal yang semua bagiannya untuk
 * kelompok lain dilewati, seperti agenda Beranda. Null bila bagian terpilih
 * tanpa outfit.
 */
export function hariOutfitBeranda(hari: readonly HariOutfit[], hariIni: string, besok: string, pilihan?: PilihanBagian | null): HariOutfitBeranda | null {
  if (hari.length === 0) return null;
  const pilih = (indeks: number, jenis: HariOutfitBeranda["jenis"]) => (indeks >= 0 && hari[indeks].outfit.length > 0 ? { indeks, jenis } : null);
  // Tanpa tanggal sama sekali: hari pertama.
  if (!hari.some((h) => h.tanggal)) return pilih(0, "pertama");
  const sama = (tanggal: string) => bagianOutfitTanggal(hari, tanggal, pilihan);
  const tanggalKu = [...new Set(hari.flatMap((h) => (h.tanggal ? [h.tanggal] : [])))].filter((tanggal) => sama(tanggal) >= 0);
  if (tanggalKu.length === 0) return null;
  if (tanggalKu.includes(hariIni)) return pilih(sama(hariIni), "hariIni");
  const berikut = tanggalKu.find((tanggal) => tanggal > hariIni);
  if (!berikut) return pilih(sama(tanggalKu[tanggalKu.length - 1]), "terakhir");
  return pilih(sama(berikut), berikut === besok ? "besok" : berikut === tanggalKu[0] ? "pertama" : "nanti");
}
