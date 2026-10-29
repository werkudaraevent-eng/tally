import { bacaOutfit, outfitTerlihat, urutOutfit, type OutfitEntry } from "./outfit.ts";

/**
 * Blok Dress code di halaman acara: dress code tiap tab Agenda yang terbit,
 * dibaca dari `rundown_sections.outfit` (Agenda > Dress code), jadi halaman
 * publik selalu sama dengan halaman Outfit peserta dan panitia tidak mengetik
 * ulang. Pola halaman attire Zola/The Knot: tamu menyiapkan pakaian sebelum
 * berangkat, sering sebelum masuk ke portal.
 */

/** Tab Agenda seperti tersimpan, dengan kolom outfit apa adanya. */
export type TabDressCode = { id: number; name: string | null; title: string | null; event_date: string | null; is_published: boolean; outfit?: unknown };
/** Baris Agenda: cukup untuk memeriksa isian yang menaut ke baris. */
export type BarisDressCode = { id: number; section_id: number; title: string | null; is_published: boolean };

export type HariDressCode = {
  id: number;
  /** Urutan tanggal tab di antara tanggal tab terbit (1 = hari pertama). Null tanpa tanggal. */
  nomor: number | null;
  judul: string | null;
  tanggal: string | null;
  /** Tanpa `item_id`: halaman tidak memakainya. */
  isian: OutfitEntry[];
};

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hari yang tampil di blok, dalam urutan tab Agenda. Hanya tab terbit; isian
 * yang menaut ke baris Agenda tampil bila baris itu terbit dan berjudul,
 * karena label waktunya membawa jam dan judul baris itu (acara kejutan yang
 * disembunyikan di Agenda tidak bocor lewat dress code). Who sees it tidak
 * berlaku, sama dengan agenda publik sebelum masuk. `pilih` kosong = semua
 * tab yang punya dress code.
 */
export function hariDressCode(tabs: readonly TabDressCode[], baris: readonly BarisDressCode[], pilih?: readonly number[] | null): HariDressCode[] {
  const terbit = tabs.filter((tab) => tab.is_published);
  const tanggal = [...new Set(terbit.flatMap((tab) => (tab.event_date && TANGGAL.test(tab.event_date) ? [tab.event_date] : [])))].sort();
  const dipilih = pilih && pilih.length > 0 ? new Set(pilih) : null;
  return terbit.flatMap((tab): HariDressCode[] => {
    if (dipilih && !dipilih.has(tab.id)) return [];
    const tampil = baris.filter((isi) => isi.section_id === tab.id && isi.is_published && isi.title?.trim());
    const isian = outfitTerlihat(urutOutfit(bacaOutfit(tab.outfit)), tampil);
    if (isian.length === 0) return [];
    const hari = tab.event_date && TANGGAL.test(tab.event_date) ? tab.event_date : null;
    return [{
      id: tab.id,
      nomor: hari ? tanggal.indexOf(hari) + 1 : null,
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
