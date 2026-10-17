import type { AgendaItem, AgendaPreview } from "../landing-agenda.ts";

/**
 * Hari agenda di portal Horizon. Satu tanggal bisa punya beberapa bagian
 * rundown (Batch 1 dan Batch 2 KSO, atau dua ruang yang berjalan bersamaan),
 * jadi tab hari dibentuk dari TANGGAL, dan bagian di hari itu dipilih dengan
 * kontrol segmen berlabel bagian pembedanya ("Batch 1"), bukan label CMS utuh
 * ("Jumat, 06 November 2026 (Batch 1)").
 *
 * Portal belum tahu peserta masuk bagian yang mana (rundown tidak punya
 * sasaran), jadi Beranda menampilkan butir dari setiap bagian beserta labelnya,
 * bukan diam-diam bagian pertama.
 *
 * Berkas ini tanpa impor runtime supaya bisa diuji langsung oleh Node
 * (hari-agenda.check.ts).
 */

export type BagianHari = { indeks: number; label: string | null };
export type HariAgenda = { tanggal: string | null; bagian: BagianHari[] };

type Kata = { teks: string; mulai: number; akhir: number };

function pecahKata(teks: string): Kata[] {
  return [...teks.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ teks: m[0], mulai: m.index ?? 0, akhir: (m.index ?? 0) + m[0].length }));
}

const samaKata = (a: string, b: string) => a.toLocaleLowerCase("id") === b.toLocaleLowerCase("id");

/**
 * Bagian pembeda dari label-label bagian di satu hari: kata awal dan akhir
 * yang sama dibuang, sisanya diambil dari teks aslinya. Pembeda yang hanya
 * angka atau satu huruf membawa kata sebelumnya ("Batch 1", "Hall B").
 * Label yang tidak bisa dibedakan dengan bersih: label utuh, atau null bila
 * label utuh pun kembar atau kosong (pemanggil memakai "Bagian 1").
 */
export function labelPembeda(judul: readonly (string | null | undefined)[]): (string | null)[] {
  const bersih = judul.map((teks) => teks?.trim() || null);
  if (bersih.length < 2) return bersih.map(() => null);
  const utuh = () => (bersih.every(Boolean) && new Set(bersih.map((teks) => teks!.toLocaleLowerCase("id"))).size === bersih.length ? bersih : bersih.map(() => null));
  if (bersih.some((teks) => !teks)) return utuh();
  const daftar = bersih.map((teks) => ({ asli: teks!, kata: pecahKata(teks!) }));
  if (daftar.some((item) => item.kata.length === 0)) return utuh();
  const pertama = daftar[0].kata;
  const minimal = Math.min(...daftar.map((item) => item.kata.length));
  let awal = 0;
  while (awal < minimal && daftar.every((item) => samaKata(item.kata[awal].teks, pertama[awal].teks))) awal += 1;
  let akhir = 0;
  while (akhir < minimal - awal && daftar.every((item) => samaKata(item.kata[item.kata.length - 1 - akhir].teks, pertama[pertama.length - 1 - akhir].teks))) akhir += 1;
  const hasil = daftar.map(({ asli, kata }) => {
    const sampai = kata.length - akhir;
    let dari = awal;
    if (sampai <= dari) return null;
    const sisa = kata.slice(dari, sampai);
    if (dari > 0 && sisa.length === 1 && (/^\p{N}+$/u.test(sisa[0].teks) || sisa[0].teks.length === 1)) dari -= 1;
    return asli.slice(kata[dari].mulai, kata[sampai - 1].akhir);
  });
  if (hasil.some((teks) => !teks) || new Set(hasil.map((teks) => teks!.toLocaleLowerCase("id"))).size !== hasil.length) return utuh();
  return hasil;
}

/** Bagian rundown dikelompokkan per tanggal, urut kemunculan pertama. Bagian tanpa tanggal menjadi hari sendiri. */
export function kelompokkanHari(agenda: ReadonlyArray<Pick<AgendaPreview, "tanggal" | "sectionTitle">>): HariAgenda[] {
  const hari: { tanggal: string | null; indeks: number[] }[] = [];
  agenda.forEach((bagian, indeks) => {
    const ada = bagian.tanggal ? hari.find((item) => item.tanggal === bagian.tanggal) : undefined;
    if (ada) ada.indeks.push(indeks);
    else hari.push({ tanggal: bagian.tanggal, indeks: [indeks] });
  });
  return hari.map((item) => {
    const label = item.indeks.length > 1 ? labelPembeda(item.indeks.map((indeks) => agenda[indeks].sectionTitle)) : item.indeks.map(() => null);
    return { tanggal: item.tanggal, bagian: item.indeks.map((indeks, urutan) => ({ indeks, label: label[urutan] })) };
  });
}

function escapeRegex(teks: string) {
  return teks.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Judul butir tanpa label bagiannya di ujung, karena kontrol segmen sudah
 * menyebutnya: "Berkumpul di Stasiun Gambir (Batch 2)" di bagian Batch 2
 * menjadi "Berkumpul di Stasiun Gambir". Hanya bentuk dalam kurung di ujung.
 */
export function tanpaLabelBagian(judul: string, label: string | null): string {
  if (!label) return judul;
  const hasil = judul.replace(new RegExp(`\\s*[(\\[]\\s*${escapeRegex(label)}\\s*[)\\]]\\s*$`, "iu"), "").trim();
  return hasil || judul;
}

/** "09.00" atau "09:00" menjadi menit sejak tengah malam; null bila bukan jam. */
export function menitDari(jam: string | null | undefined): number | null {
  const cocok = jam?.match(/^(\d{1,2})[.:](\d{2})/);
  return cocok ? Number(cocok[1]) * 60 + Number(cocok[2]) : null;
}

export type StatusButir = "berlangsung" | "berikutnya" | null;

/** Status tiap butir hari ini: yang sedang berjalan dan yang berikutnya. */
export function statusHari(items: readonly AgendaItem[], menit: number): Map<number, StatusButir> {
  const hasil = new Map<number, StatusButir>();
  const isi = items.filter((item) => menitDari(item.time) !== null);
  isi.forEach((item, index) => {
    const mulai = menitDari(item.time)!;
    const selesai = menitDari(item.end) ?? menitDari(isi[index + 1]?.time ?? null) ?? mulai + 60;
    if (mulai <= menit && menit < selesai) hasil.set(item.id, "berlangsung");
  });
  const berikut = isi.find((item) => menitDari(item.time)! > menit);
  if (berikut) hasil.set(berikut.id, "berikutnya");
  return hasil;
}

export type ButirBeranda = { indeks: number; label: string | null; item: AgendaItem };
export type RingkasanBeranda = {
  /** Butir yang sedang berjalan hari ini, satu per bagian. `sampai` hanya bila jam selesainya diketahui. */
  berlangsung: (ButirBeranda & { sampai: string | null })[];
  /** Butir berikutnya hari ini, atau butir pertama hari acara berikutnya, satu per bagian. */
  berikutnya: { tanggal: string; kapan: "hari-ini" | "besok" | "nanti"; butir: (ButirBeranda & { menitLagi: number | null })[] } | null;
};

/**
 * Isi kartu Berlangsung dan Berikutnya di Beranda. Hari dengan beberapa bagian
 * memberi satu butir per bagian, masing-masing dengan label bagiannya.
 */
export function ringkasanBeranda(agenda: readonly AgendaPreview[], hariIni: string, besok: string, menit: number): RingkasanBeranda {
  const hari = kelompokkanHari(agenda);
  const ini = hari.find((item) => item.tanggal === hariIni);
  const berlangsung: RingkasanBeranda["berlangsung"] = [];
  const berikutHariIni: NonNullable<RingkasanBeranda["berikutnya"]>["butir"] = [];
  for (const { indeks, label } of ini?.bagian ?? []) {
    const items = agenda[indeks].items;
    const status = statusHari(items, menit);
    const sedang = items.find((item) => status.get(item.id) === "berlangsung");
    if (sedang) {
      const berjam = items.filter((item) => menitDari(item.time) !== null);
      const sesudahnya = berjam[berjam.indexOf(sedang) + 1];
      berlangsung.push({ indeks, label, item: sedang, sampai: sedang.end ?? sesudahnya?.time ?? null });
    }
    const berikut = items.find((item) => status.get(item.id) === "berikutnya");
    if (berikut) berikutHariIni.push({ indeks, label, item: berikut, menitLagi: menitDari(berikut.time)! - menit });
  }
  if (berikutHariIni.length > 0) return { berlangsung, berikutnya: { tanggal: hariIni, kapan: "hari-ini", butir: berikutHariIni } };
  const nanti = hari.find((item) => item.tanggal !== null && item.tanggal > hariIni);
  const butir = (nanti?.bagian ?? []).flatMap(({ indeks, label }) => {
    const item = agenda[indeks].items.find((butir) => !butir.jeda);
    return item ? [{ indeks, label, item, menitLagi: null }] : [];
  });
  return { berlangsung, berikutnya: nanti && butir.length > 0 ? { tanggal: nanti.tanggal!, kapan: nanti.tanggal === besok ? "besok" : "nanti", butir } : null };
}
