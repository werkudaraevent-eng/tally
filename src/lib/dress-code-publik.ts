import { bacaOutfit, outfitTerlihat, urutOutfit, type OutfitEntry } from "./outfit.ts";

/**
 * Blok Dress code di halaman acara: dress code tiap tab Agenda yang terbit,
 * dibaca dari `rundown_sections.outfit` (Agenda > Dress code), jadi halaman
 * publik selalu sama dengan halaman Outfit peserta dan panitia tidak mengetik
 * ulang. Pola halaman attire Zola/The Knot: tamu menyiapkan pakaian sebelum
 * berangkat, sering sebelum masuk ke portal.
 */

/** Tab Agenda seperti tersimpan, dengan kolom outfit apa adanya. */
export type TabDressCode = { id: number; name: string | null; title: string | null; event_date: string | null; is_published: boolean; show_before_sign_in?: boolean | null; outfit?: unknown };
/** Baris Agenda: cukup untuk memeriksa isian yang menaut ke baris. */
export type BarisDressCode = { id: number; section_id: number; title: string | null; is_published: boolean };

export type HariDressCode = {
  id: number;
  /** Nomor tab yang sama di Susunan acara halaman ini ("Hari 02"). Null bila agenda tidak menampilkannya. */
  nomor: number | null;
  judul: string | null;
  tanggal: string | null;
  /** Tanpa `item_id`: halaman tidak memakainya. */
  isian: OutfitEntry[];
};

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hari yang tampil di blok, dalam urutan tab Agenda. Hanya tab terbit yang
 * tampil sebelum masuk (Show before sign-in, sama dengan agenda publik): hari
 * yang disembunyikan panitia tidak bocor lewat dress code-nya. Isian
 * yang menaut ke baris Agenda tampil bila baris itu terbit dan berjudul,
 * karena label waktunya membawa jam dan judul baris itu (acara kejutan yang
 * disembunyikan di Agenda tidak bocor lewat dress code). Who sees it tidak
 * berlaku, sama dengan agenda publik sebelum masuk. `pilih` kosong = semua
 * tab yang punya dress code. `nomorAgenda`: id tab ke nomornya di Susunan acara
 * (urutan tab yang ditampilkan agenda publik), supaya "Hari 02" sama di kedua bagian.
 */
export function hariDressCode(tabs: readonly TabDressCode[], baris: readonly BarisDressCode[], pilih?: readonly number[] | null, nomorAgenda?: ReadonlyMap<number, number>): HariDressCode[] {
  const terbit = tabs.filter((tab) => tab.is_published && tab.show_before_sign_in !== false);
  const dipilih = pilih && pilih.length > 0 ? new Set(pilih) : null;
  return terbit.flatMap((tab): HariDressCode[] => {
    if (dipilih && !dipilih.has(tab.id)) return [];
    const tampil = baris.filter((isi) => isi.section_id === tab.id && isi.is_published && isi.title?.trim());
    const isian = outfitTerlihat(urutOutfit(bacaOutfit(tab.outfit)), tampil);
    if (isian.length === 0) return [];
    const hari = tab.event_date && TANGGAL.test(tab.event_date) ? tab.event_date : null;
    return [{
      id: tab.id,
      nomor: nomorAgenda?.get(tab.id) ?? null,
      judul: tab.name?.trim() || tab.title?.trim() || null,
      tanggal: hari,
      isian,
    }];
  });
}

/** Ringkasan blok di daftar CMS: "All days" atau "2 days". */
export function ringkasanHariDressCode(sectionIds: readonly number[] | undefined): string {
  const jumlah = sectionIds?.length ?? 0;
  return jumlah === 0 ? "All days with a dress code" : jumlah === 1 ? "1 day" : `${jumlah} days`;
}
