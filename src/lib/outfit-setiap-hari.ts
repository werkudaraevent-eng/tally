import { z } from "zod";
import type { LandingMemberConfig } from "./domain.ts";
import { OUTFIT_BATAS, bacaOutfit, hariOutfitBeranda, type HariOutfitBeranda, type OutfitEntry } from "./outfit.ts";
import type { PilihanPeserta } from "./sasaran-bagian.ts";
import { gabungMeta } from "./typography.ts";

/**
 * Dresscode Setiap hari (keputusan Mas 21 Okt): satu baris untuk seluruh
 * acara, diisi di Participant area dan disimpan di
 * `landing_config.member.outfit_every_day`, jadi tanpa SQL dan tanpa tab
 * Agenda. Portal Horizon menaruhnya di depan baris tiap hari; tab yang punya
 * baris Seharian sendiri memakai barisnya sendiri. Bebas impor server seperti
 * outfit.ts, dan diuji langsung oleh Node (outfit-setiap-hari.check.ts).
 */

export type OutfitSetiapHari = NonNullable<LandingMemberConfig["outfit_every_day"]>;

type HariOutfit = { tanggal: string | null; outfit: OutfitEntry[] };

/** Foto contoh hanya https, aturan yang sama dengan foto baris Agenda (outfit.ts tidak mengekspornya). */
function urlHttps(nilai: string): boolean {
  try {
    return new URL(nilai).protocol === "https:" && !/[\s"'<>\\]/.test(nilai);
  } catch {
    return false;
  }
}

/**
 * Skema tulis (Participant area). Tidak dikirim = tidak diubah, seperti
 * `outfit_label`; null atau `what` kosong = tidak ada (null). Batas sama
 * dengan baris Agenda.
 */
export const outfitSetiapHariSchema = z
  .object({
    what: z.string().trim().max(OUTFIT_BATAS.what).nullish(),
    note: z.string().trim().max(OUTFIT_BATAS.note).nullish(),
    photo_url: z.string().trim().max(600).nullish().refine((nilai) => !nilai || urlHttps(nilai), "Photo must be an https:// address."),
  })
  .nullish()
  .transform((isi): OutfitSetiapHari | null | undefined => {
    if (isi === undefined) return undefined;
    if (!isi?.what) return null;
    return { what: isi.what, ...(isi.note ? { note: isi.note } : {}), ...(isi.photo_url ? { photo_url: isi.photo_url } : {}) };
  });

/**
 * Isi tersimpan apa adanya menjadi baris yang aman dirender, atau null bila
 * tidak ada. Portal membaca `member` tanpa skema, jadi aturannya sama dengan
 * bacaOutfit: bentuk lain dan `what` kosong dibuang, bukan menggagalkan halaman.
 */
export function bacaOutfitSetiapHari(nilai: unknown): OutfitSetiapHari | null {
  const [baris] = bacaOutfit([nilai]);
  if (!baris) return null;
  return { what: baris.what, ...(baris.note ? { note: baris.note } : {}), ...(baris.photo_url ? { photo_url: baris.photo_url } : {}) };
}

/** Baris Seharian milik tab: bukan agenda item dan tanpa nama bagian hari. */
function seharian(baris: OutfitEntry): boolean {
  return !baris.when?.trim() && (baris as { item_id?: unknown }).item_id == null;
}

/**
 * Baris satu tab seperti yang dilihat peserta: Setiap hari lebih dulu, sebagai
 * `{ when: label, what, note, photo_url }`, lalu baris tab dalam urutannya.
 * Tanpa Setiap hari, atau bila tab punya baris Seharian sendiri (baris itu
 * menggantikannya di tab ini), baris tab apa adanya.
 */
export function denganSetiapHari(entries: readonly OutfitEntry[], everyDay: OutfitSetiapHari | null | undefined, labelSetiapHari: string): OutfitEntry[] {
  if (!everyDay?.what?.trim() || entries.some(seharian)) return [...entries];
  return [
    { when: labelSetiapHari, what: everyDay.what, ...(everyDay.note ? { note: everyDay.note } : {}), ...(everyDay.photo_url ? { photo_url: everyDay.photo_url } : {}) },
    ...entries,
  ];
}

/** Baris "Berikutnya" di halaman Dresscode: tiap baris hari itu, "kapan · apa" seperti strip Susunan acara. */
export function teksBarisOutfit(entries: readonly OutfitEntry[]): string[] {
  return entries.map((baris) => gabungMeta([baris.when, baris.what]));
}

/**
 * hariOutfitBeranda dengan Setiap hari. Bagian tiap tanggal tetap dipilih dari
 * baris tab sendiri, jadi peserta tanpa batch tetap melihat tab yang berisi.
 * Bila bagian terpilih tanpa baris sendiri, Setiap hari mengisinya: tanggal
 * dan jenisnya tidak bergantung pada isi, dan bagian di tanggal itu tidak
 * berubah karena tidak ada bagian yang berisi di sana.
 */
export function hariOutfitBerandaSetiapHari(
  hari: readonly HariOutfit[],
  hariIni: string,
  besok: string,
  pilihan: Pick<PilihanPeserta, "milik" | "bukanMilik"> | null | undefined,
  everyDay: OutfitSetiapHari | null,
): HariOutfitBeranda | null {
  const hasil = hariOutfitBeranda(hari, hariIni, besok, pilihan);
  if (hasil || !everyDay) return hasil;
  return hariOutfitBeranda(hari.map((isi) => (isi.outfit.length > 0 ? isi : { ...isi, outfit: [everyDay] })), hariIni, besok, pilihan);
}

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hari kartu Beranda untuk acara tanpa tab Agenda (hanya Setiap hari), dari
 * tanggal acara: hari pertama, hari ini bila di tengah acara, dan hari
 * terakhir. hariOutfitBeranda hanya membandingkan hari ini dengan tanggal itu,
 * jadi hasilnya sama dengan menjabarkan setiap hari acara. Tanpa tanggal acara:
 * satu hari tanpa tanggal, seperti tab tanpa tanggal.
 */
export function hariTanpaAgenda(mulai: string | null | undefined, selesai: string | null | undefined, hariIni: string): (string | null)[] {
  if (!mulai || !TANGGAL.test(mulai)) return [null];
  // Tanggal selesai sebelum tanggal mulai dibaca sebagai acara sehari, seperti rentangAcara.
  const akhir = selesai && TANGGAL.test(selesai) && selesai > mulai ? selesai : mulai;
  return [...new Set([mulai, ...(hariIni > mulai && hariIni < akhir ? [hariIni] : []), akhir])];
}
