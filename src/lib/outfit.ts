import { z } from "zod";
import { labelPembeda, tanpaLabelBagian } from "./member/hari-agenda.ts";
import type { PilihanPeserta } from "./sasaran-bagian.ts";
import { SEPARATOR } from "./typography.ts";

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
/** Pilihan gaya dalam satu isian (mis. empat gaya Gala Dinner). */
export const OUTFIT_PILIHAN_MAX = 6;
export const OUTFIT_PILIHAN_BATAS = { name: 60, description: 200 } as const;
/** Label halaman bawaan; sama di kedua bahasa. */
export const OUTFIT_LABEL_BAWAAN = "Outfit";
export const OUTFIT_LABEL_MAX = 16;

/**
 * `item_id`: baris `rundown_items` di bagian yang sama. Untuk baris, `when`
 * ditulis server ("17.30 Gala Dinner") dan dibaca peserta apa adanya, jadi
 * portal tidak perlu tahu tautannya.
 */
export type OutfitEntry = { item_id?: number; when?: string; what: string; note?: string; photo_url?: string; options?: OutfitPilihan[] };

/**
 * Satu pilihan gaya: peserta memakai salah satunya (pola panduan attire The
 * Knot/Zola). Isian tanpa `options` tetap satu outfit dengan satu foto.
 */
export type OutfitPilihan = { name: string; description?: string; photo_url?: string };

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

export const outfitPilihanSchema = z.object({
  name: z.string().trim().min(1, "Each option needs a name.").max(OUTFIT_PILIHAN_BATAS.name),
  description: opsional(OUTFIT_PILIHAN_BATAS.description),
  photo_url: fotoHttps,
});

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
  // Kosong berarti tanpa pilihan: kuncinya tidak disimpan.
  options: z
    .array(outfitPilihanSchema)
    .max(OUTFIT_PILIHAN_MAX, `${OUTFIT_PILIHAN_MAX} options is the most.`)
    .nullish()
    .transform((daftar) => (daftar && daftar.length > 0 ? daftar : undefined)),
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
      const foto = fotoBaca(teks(baris.photo_url, 600));
      const pilihan = bacaPilihan(baris.options);
      const idBaris = baris.item_id;
      return [
        {
          what,
          ...(typeof idBaris === "number" && Number.isInteger(idBaris) && idBaris > 0 ? { item_id: idBaris } : {}),
          ...(teks(baris.when, OUTFIT_BATAS.when) ? { when: teks(baris.when, OUTFIT_BATAS.when) } : {}),
          ...(teks(baris.note, OUTFIT_BATAS.note) ? { note: teks(baris.note, OUTFIT_BATAS.note) } : {}),
          ...(foto ? { photo_url: foto } : {}),
          ...(pilihan.length > 0 ? { options: pilihan } : {}),
        },
      ];
    });
}

/** Ditulis hanya https lewat API; data uji lokal memakai http, jadi http(s) diterima saat membaca. */
function fotoBaca(foto: string | undefined): string | undefined {
  return foto && /^https?:\/\/[^\s"'<>\\]+$/i.test(foto) ? foto : undefined;
}

/** Pilihan tersimpan apa adanya, toleran seperti bacaOutfit: tanpa nama dibuang. */
function bacaPilihan(nilai: unknown): OutfitPilihan[] {
  if (!Array.isArray(nilai)) return [];
  const teks = (isi: unknown, maks: number) => (typeof isi === "string" && isi.trim() ? isi.trim().slice(0, maks) : undefined);
  return nilai.slice(0, OUTFIT_PILIHAN_MAX).flatMap((isi): OutfitPilihan[] => {
    if (!isi || typeof isi !== "object") return [];
    const baris = isi as Record<string, unknown>;
    const name = teks(baris.name, OUTFIT_PILIHAN_BATAS.name);
    if (!name) return [];
    const description = teks(baris.description, OUTFIT_PILIHAN_BATAS.description);
    const foto = fotoBaca(teks(baris.photo_url, 600));
    return [{ name, ...(description ? { description } : {}), ...(foto ? { photo_url: foto } : {}) }];
  });
}

/** Label halaman Outfit acara ini (`landing_config.member.outfit_label`). */
export function labelOutfit(label: string | null | undefined): string {
  return label?.trim().slice(0, OUTFIT_LABEL_MAX) || OUTFIT_LABEL_BAWAAN;
}

/** Cukup untuk menurunkan jenis: isian tersimpan, atau kiriman editor (null = kosong). */
type IsianJenis = { item_id?: number | null; when?: string | null };

/** `item_id` = baris agenda; tanpa itu `when` = sebagian hari; selain itu seharian. */
export function jenisOutfit(isian: IsianJenis): JenisOutfit {
  if (isian.item_id) return "baris";
  return isian.when?.trim() ? "waktu" : "seharian";
}

/**
 * Label waktu yang dibaca peserta: `when` apa adanya, atau `semuaHari`
 * ("Sepanjang hari") untuk isian seharian, supaya tiap outfit di satu hari
 * berlabel sama rata dengan yang berjam.
 */
export function kapanOutfit(isian: IsianJenis, semuaHari: string): string | null {
  return isian.when?.trim() || (jenisOutfit(isian) === "seharian" ? semuaHari : null);
}

/**
 * Pakaian di ringkasan (strip Susunan acara, Beranda, Berikutnya): dengan
 * pilihan gaya, jumlahnya ikut ("Colonial Elegance · 4 pilihan") supaya
 * peserta tahu ada yang dipilih tanpa ringkasan memanjang.
 */
export function apaRingkas(isian: Pick<OutfitEntry, "what" | "options">, jumlahPilihan: (jumlah: number) => string): string {
  return isian.options?.length ? `${isian.what} ${SEPARATOR} ${jumlahPilihan(isian.options.length)}` : isian.what;
}

/** Foto kecil di ringkasan: foto isian, atau foto pilihan pertama yang punya foto. */
export function fotoRingkas(isian: Pick<OutfitEntry, "photo_url" | "options">): string | null {
  return isian.photo_url ?? isian.options?.find((pilihan) => pilihan.photo_url)?.photo_url ?? null;
}

/** Urutan tersimpan, kecuali isian seharian yang selalu di depan. */
export function urutOutfit<T extends IsianJenis>(daftar: readonly T[]): T[] {
  const seharian = (isian: T) => jenisOutfit(isian) === "seharian";
  return [...daftar.filter(seharian), ...daftar.filter((isian) => !seharian(isian))];
}

export type MasalahOutfit = { jenis: "terlaluBanyak" } | { jenis: "seharianGanda" } | { jenis: "barisGanda"; item_id: number };

/**
 * Aturan daftar satu tab, sama di editor dan server: paling banyak tiga isian,
 * satu seharian, dan satu baris agenda tidak ditautkan dua kali. Null bila sah.
 */
export function cekDaftarOutfit(daftar: readonly IsianJenis[]): MasalahOutfit | null {
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

/** Alasan yang dibaca admin di kaki panel dan toast, sama di editor dan server. `judul`: judul baris yang ditautkan dua kali. */
export function alasanDaftarOutfit(masalah: MasalahOutfit, judul: (itemId: number) => string): string {
  if (masalah.jenis === "seharianGanda") return "Only one Whole day line per tab.";
  if (masalah.jenis === "barisGanda") return `${judul(masalah.item_id)} already has a dress code.`;
  return `${OUTFIT_MAX} is the most per tab, so the phone strip stays short.`;
}

/** Baris agenda seperti tersimpan: bahan tautan dan teks waktunya. */
export type BarisOutfit = { start_time: string; title: string | null; is_published: boolean };

/**
 * Isian yang ditulis Save dress code, atau alasan penolakannya. Baris yang
 * baru ditautkan (tidak ada di `tersimpan`: item_id ke teks tersimpannya)
 * harus ada di `barisTab` (baris tab itu di acara itu), berjudul, dan tampil
 * di halaman publik. Tautan tersimpan tidak diperiksa ulang: baris yang
 * kemudian disembunyikan tidak memblokir suntingan lain, dan baris yang hilang
 * (acara salinan, hapus yang tulisan keduanya gagal) tetap memakai teks
 * tersimpannya. `when` isian bertaut selalu dari barisnya, jadi judul dan jam
 * yang diketik ulang tidak bisa basi.
 */
export function tautkanOutfit(
  outfit: readonly OutfitEntry[],
  tersimpan: ReadonlyMap<number, string | undefined>,
  barisTab: ReadonlyMap<number, BarisOutfit>,
  label: string | null,
): { isian: OutfitEntry[] } | { alasan: string } {
  const masalah = cekDaftarOutfit(outfit);
  if (masalah) return { alasan: alasanDaftarOutfit(masalah, (id) => barisTab.get(id)?.title?.trim() || tersimpan.get(id) || "That item") };
  const hasil: OutfitEntry[] = [];
  for (const isian of outfit) {
    if (!isian.item_id) {
      hasil.push(isian);
      continue;
    }
    const item = barisTab.get(isian.item_id);
    if (!tersimpan.has(isian.item_id)) {
      const judul = item?.title?.trim();
      if (!item || !judul) return { alasan: "That item is not on this tab any more. Pick another." };
      if (!item.is_published) return { alasan: `${judul} is hidden, so it cannot be picked.` };
    }
    hasil.push({ ...isian, when: item ? teksWaktuOutfit(item.start_time, item.title ?? "", label) : tersimpan.get(isian.item_id) ?? isian.when });
  }
  return { isian: urutOutfit(hasil) };
}

/** item_id isian jsonb apa adanya, atau null. */
function idTautan(isian: unknown): number | null {
  const id = isian && typeof isian === "object" ? (isian as { item_id?: unknown }).item_id : undefined;
  return typeof id === "number" ? id : null;
}

/** Isian jsonb apa adanya yang menaut ke baris agenda. */
export function adaTautan(daftar: unknown): boolean {
  return Array.isArray(daftar) && daftar.some((isian) => idTautan(isian) !== null);
}

/**
 * Isian yang boleh dilihat peserta pada satu hari, dari baris yang tampil
 * untuknya (`barisTampil`: baris hari itu sesudah Published dan Who
 * sees it). Isian yang ditautkan ke baris lain disembunyikan, karena teks
 * waktunya membawa jam dan judul baris itu. `item_id` dibuang: halaman tidak
 * memakainya.
 */
export function outfitTerlihat(isian: readonly OutfitEntry[], barisTampil: ReadonlyArray<{ id: number }>): OutfitEntry[] {
  const tampil = new Set(barisTampil.map((baris) => baris.id));
  return isian.filter((isi) => !isi.item_id || tampil.has(isi.item_id)).map((isi) => {
    const salinan = { ...isi };
    delete salinan.item_id;
    return salinan;
  });
}

/** Isian tersimpan (jsonb apa adanya) tanpa yang menaut ke baris yang dihapus. */
export function tanpaIsianBaris(daftar: readonly unknown[], itemId: number): unknown[] {
  return daftar.filter((isian) => idTautan(isian) !== itemId);
}

/**
 * Teks waktu isian bertaut ditulis ulang dari barisnya (`barisTab`: baris tab
 * itu saja, jadi id dari acara asal sebuah salinan tidak ditemukan). Isian
 * lain, dan isian yang barisnya tidak ditemukan, tidak disentuh: peserta tetap
 * membaca teks tersimpannya. Kunci jsonb lain ikut apa adanya.
 */
export function segarkanIsianBaris(daftar: readonly unknown[], barisTab: ReadonlyMap<number, Pick<BarisOutfit, "start_time" | "title">>, label: string | null): unknown[] {
  return daftar.map((isian) => {
    const id = idTautan(isian);
    const item = id === null ? undefined : barisTab.get(id);
    return item ? { ...(isian as object), when: teksWaktuOutfit(item.start_time, item.title ?? "", label) } : isian;
  });
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
 * Tab yang dibuka portal (loadAgendaPreview): terbit dan punya butir publik
 * berjudul. Hanya tab ini yang membentuk segmen Batch di Jadwal peserta.
 */
export function tabTerlihatOutfit(
  tabs: readonly { id: number; is_published: boolean }[],
  butir: readonly { section_id: number; title: string | null; is_published: boolean }[],
): Set<number> {
  const berisi = new Set(butir.flatMap((item) => (item.is_published && item.title?.trim() ? [item.section_id] : [])));
  return new Set(tabs.flatMap((tab) => (tab.is_published && berisi.has(tab.id) ? [tab.id] : [])));
}

/**
 * Label pembeda tab ini ("Batch 1"), dibentuk seperti segmen Batch di portal:
 * dari nama tab bertanggal sama yang dibuka peserta (`terlihat`, dari
 * tabTerlihatOutfit), jadi tab draf atau tanpa butir publik tidak mengubahnya.
 * Tab ini sendiri selalu ikut, supaya teksnya sudah benar begitu tab ini
 * terlihat. Null bila tanggalnya satu tab.
 */
export function labelTabOutfit(tabs: readonly TabOutfit[], id: number, terlihat: ReadonlySet<number>): string | null {
  const tab = tabs.find((isi) => isi.id === id);
  if (!tab?.event_date) return null;
  const sama = tabs.filter((isi) => isi.event_date === tab.event_date && (isi.id === id || terlihat.has(isi.id)));
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
