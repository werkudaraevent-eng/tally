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

/** Bentuk yang bukan dari layar admin (API langsung, klien basi). */
const BENTUK_SALAH = "Every day is not in the expected shape. Reload the page and try again.";

/**
 * Skema tulis (Participant area). Tidak dikirim = tidak diubah, seperti
 * `outfit_label`; null atau `what` kosong = tidak ada (null). Batas sama
 * dengan baris Agenda. Pesannya dibaca admin di kelompok Every day (422 dari
 * PATCH Participant area, lewat galatSetiapHari), jadi English dan menyebut kolomnya.
 */
export const outfitSetiapHariSchema = z
  .object(
    {
      what: z.string({ invalid_type_error: BENTUK_SALAH }).trim().max(OUTFIT_BATAS.what, `What to wear can be at most ${OUTFIT_BATAS.what} characters.`).nullish(),
      note: z.string({ invalid_type_error: BENTUK_SALAH }).trim().max(OUTFIT_BATAS.note, `The note can be at most ${OUTFIT_BATAS.note} characters.`).nullish(),
      photo_url: z
        .string({ invalid_type_error: BENTUK_SALAH })
        .trim()
        .max(600, "The photo address is too long. Upload the photo again.")
        .nullish()
        .refine((nilai) => !nilai || urlHttps(nilai), "The photo must be an https:// address. Upload the photo again."),
    },
    { invalid_type_error: BENTUK_SALAH },
  )
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
 * Setiap hari di satu tab: null bila tidak diisi, atau bila tab punya baris
 * Seharian sendiri (baris itu menggantikannya di tab ini). Satu aturan untuk
 * portal (denganSetiapHari) dan baris Dress code di Agenda.
 */
export function setiapHariDiTab(entries: readonly OutfitEntry[], everyDay: OutfitSetiapHari | null | undefined): OutfitSetiapHari | null {
  return everyDay?.what?.trim() && !entries.some(seharian) ? everyDay : null;
}

/**
 * Baris satu tab seperti yang dilihat peserta: Setiap hari lebih dulu, sebagai
 * `{ when: label, what, note, photo_url }`, lalu baris tab dalam urutannya.
 * Tanpa Setiap hari, atau bila tab punya baris Seharian sendiri (baris itu
 * menggantikannya di tab ini), baris tab apa adanya.
 */
export function denganSetiapHari(entries: readonly OutfitEntry[], everyDay: OutfitSetiapHari | null | undefined, labelSetiapHari: string): OutfitEntry[] {
  const setiap = setiapHariDiTab(entries, everyDay);
  if (!setiap) return [...entries];
  return [
    { when: labelSetiapHari, what: setiap.what, ...(setiap.note ? { note: setiap.note } : {}), ...(setiap.photo_url ? { photo_url: setiap.photo_url } : {}) },
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

// ---- Admin --------------------------------------------------------------------
// Every day disunting hanya di Participant area > Dress code page (satu
// penulis) dan hanya dibaca di Agenda > Dress code. Kalimat admin English,
// seperti layar admin lain.

/** Nama baris ini di layar admin. */
export const SETIAP_HARI_ADMIN = "Every day";

/** Label baris ini di portal bahasa Indonesia (portal-i18n `outfit.everyDay`), untuk pratinjau admin. */
const SETIAP_HARI_PESERTA = "Setiap hari";

type BarisRingkas = { untuk: string; apa: string };

/**
 * Baris di baris Dress code Agenda: "Every day" lebih dulu bila Setiap hari
 * tampil di tab ini (`setiap`: pakaiannya, dari setiapHariDiTab pada isian
 * tersimpan), lalu baris tab sendiri dalam urutannya.
 */
export function barisDenganSetiapHari<T extends BarisRingkas>(sendiri: readonly T[], setiap: string | null): Array<T | BarisRingkas> {
  return setiap ? [{ untuk: SETIAP_HARI_ADMIN, apa: setiap }, ...sendiri] : [...sendiri];
}

/** Petunjuk kartu Whole day di Agenda > Dress code. */
export function petunjukSeharian(everyDay: OutfitSetiapHari | null): string {
  return everyDay ? `Replaces “${everyDay.what}” (Every day) on this tab. Other tabs keep it.` : "Covers the whole of this tab. Other tabs need their own.";
}

/**
 * Baris kedua kotak Every day di editor tab. `diganti`: tab punya baris Whole
 * day sendiri di editor, tersimpan atau baru, jadi kalimatnya ikut kartunya.
 */
export function keteranganSetiapHari(diganti: boolean): string {
  return diganti ? "Not shown on this tab, because this tab has its own Whole day line." : "Set in Participant area for the whole event, so this tab shows it too.";
}

/** Keadaan kosong editor tab. Dengan Every day, peserta tetap membaca pakaian di hari itu. */
export function kosongDresscode(everyDay: OutfitSetiapHari | null): { judul: string; teks: string } {
  return everyDay
    ? {
        judul: "No extra dress code for this tab",
        teks: `Participants see the every-day dress code (${everyDay.what}). Add a line for the whole day or for one of this tab’s agenda items if this day needs more.`,
      }
    : {
        judul: "No dress code for this tab yet",
        teks: "Add one for the whole day, or for one of this tab’s agenda items. Participants see it above this day in their schedule.",
      };
}

/** Kolom Every day di Participant area, teks apa adanya selama diketik. */
export type IsianSetiapHari = { what: string; note: string; photo_url: string | null };

/** Draf `member.outfit_every_day`: bentuk tersimpan, dengan teks apa adanya. */
export type DrafSetiapHari = { what: string; note?: string; photo_url?: string };

/** `member.outfit_every_day` (tersimpan atau draf, bentuk apa pun) sebagai isian kolom. */
export function isianSetiapHari(nilai: unknown): IsianSetiapHari {
  const isi = nilai && typeof nilai === "object" ? (nilai as Record<string, unknown>) : {};
  const teks = (kolom: unknown) => (typeof kolom === "string" ? kolom : "");
  return { what: teks(isi.what), note: teks(isi.note), photo_url: teks(isi.photo_url) || null };
}

/**
 * Draf sesudah satu kolom diubah. Teks tidak dipangkas, supaya spasi bisa
 * diketik. Isian yang sama persis dengan yang tersimpan mengembalikan nilai
 * tersimpan itu sendiri: Participant area membandingkan JSON, jadi mengetik
 * lalu menghapus tidak terhitung perubahan, juga bila urutan kuncinya berbeda.
 */
export function drafSetiapHari<T>(kini: unknown, ubah: Partial<IsianSetiapHari>, tersimpan: T): T | DrafSetiapHari {
  const isian = { ...isianSetiapHari(kini), ...ubah };
  const asal = isianSetiapHari(tersimpan);
  if (isian.what === asal.what && isian.note === asal.note && isian.photo_url === asal.photo_url) return tersimpan;
  return { what: isian.what, ...(isian.note ? { note: isian.note } : {}), ...(isian.photo_url ? { photo_url: isian.photo_url } : {}) };
}

/**
 * Yang dikirim Save changes, dirapikan seperti skema tulis: teks dipangkas,
 * kolom kosong dibuang, dan null bila What to wear kosong, jadi tidak ada yang
 * tersimpan. Batas dan https diperiksa server: yang salah tetap dikirim untuk ditolak.
 */
export function kirimanSetiapHari(nilai: unknown): OutfitSetiapHari | null {
  const isian = isianSetiapHari(nilai);
  const what = isian.what.trim();
  if (!what) return null;
  const note = isian.note.trim();
  const foto = isian.photo_url?.trim() ?? "";
  return { what, ...(note ? { note } : {}), ...(foto ? { photo_url: foto } : {}) };
}

/** Sama menurut yang akan tersimpan: Every day yang tidak berubah tidak dikirim. */
export function samaSetiapHari(a: unknown, b: unknown): boolean {
  return JSON.stringify(kirimanSetiapHari(a)) === JSON.stringify(kirimanSetiapHari(b));
}

/** Kalimat "Participants see …" di kelompok Every day: format strip peserta, null tanpa What to wear. */
export function lihatSetiapHari(nilai: unknown): string | null {
  const isian = kirimanSetiapHari(nilai);
  return isian ? gabungMeta([SETIAP_HARI_PESERTA, isian.what]) : null;
}

/**
 * Petunjuk kolom What to wear. Kosong berarti tidak ada Every day, jadi catatan
 * dan foto yang masih tampil ikut terhapus saat Save changes; peringatannya
 * muncul sebelum disimpan, bukan sesudah keduanya hilang.
 */
export function petunjukApaSetiapHari(nilai: unknown): { hint: string; warning?: boolean } {
  const isian = isianSetiapHari(nilai);
  const ikut = [isian.note.trim() ? "note" : "", isian.photo_url?.trim() ? "photo" : ""].filter(Boolean);
  if (isian.what.trim() || ikut.length === 0) return { hint: "Leave empty if there is no dress code for every day" };
  return { hint: `Left empty, Save changes removes Every day, including its ${ikut.join(" and ")}.`, warning: true };
}

/**
 * `member` sesudah digabung di PATCH Participant area: Every day yang
 * dikosongkan (null dari skema tulis) dibuang dari simpanan, bukan disimpan null.
 */
export function tanpaSetiapHariKosong(member: LandingMemberConfig): LandingMemberConfig {
  if (member.outfit_every_day !== null) return member;
  const salinan = { ...member };
  delete salinan.outfit_every_day;
  return salinan;
}

/** Kalimat galat Every day dari jawaban 422 PATCH Participant area (`zod.flatten()`), atau null. */
export function galatSetiapHari(body: unknown): string | null {
  const kolom = (body as { error?: { details?: { fieldErrors?: Record<string, unknown> } } } | null)?.error?.details?.fieldErrors?.outfit_every_day;
  return (Array.isArray(kolom) ? kolom.find((pesan): pesan is string => typeof pesan === "string" && pesan.trim() !== "") : undefined) ?? null;
}
