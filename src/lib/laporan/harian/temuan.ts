/**
 * Aturan temuan untuk Daily highlights dan Whole event: satu halaman, satu
 * temuan, dengan pembanding. Semua dari data yang sudah diisi panitia
 * (Agenda + Check-in, kolom kelompok yang sama dengan deck). Fungsi murni.
 */
import type { BahanLaporan, SesiBahan } from "../bahan.ts";
import { MIN_KELOMPOK } from "../teks.ts";

/** Sesi ini sekian poin di bawah rata-rata baru disebut sepi. */
export const AMBANG_SEPI = 10;
/** Selisih antar kelompok di satu sesi baru dirinci bila sebesar ini. */
export const AMBANG_KELOMPOK = 15;
/** Selisih tertinggi dan terendah di bawah ini disebut merata. */
export const AMBANG_MERATA = 5;
/** Sampai sekian sesi tampil semua; lebih dari itu teratas dan terbawah. */
export const BATAS_SESI = 12;

/** Sesi yang punya jumlah diharapkan, dengan persen hadirnya (mentah, 0-100). */
export type Laju = { s: SesiBahan; p: number };
export const lajuSesi = (sesi: SesiBahan[]): Laju[] => sesi.filter((s) => s.diharapkan > 0).map((s) => ({ s, p: (s.sudah / s.diharapkan) * 100 }));

/** Rata-rata kehadiran per sesi: semua yang hadir dibagi semua yang diharapkan. */
export function rataSesi(sesi: SesiBahan[]): number | null {
  const ada = sesi.filter((s) => s.diharapkan > 0);
  const harap = ada.reduce((a, s) => a + s.diharapkan, 0);
  return harap > 0 ? (ada.reduce((a, s) => a + s.sudah, 0) / harap) * 100 : null;
}

/** Urut dari tertinggi; lebih dari BATAS_SESI: setengah teratas dan setengah terbawah. */
export function urutSesi(laju: Laju[]): { baris: Laju[]; terpotong: boolean } {
  const urut = [...laju].sort((a, c) => c.p - a.p || a.s.nama.localeCompare(c.s.nama));
  if (urut.length <= BATAS_SESI) return { baris: urut, terpotong: false };
  const separuh = BATAS_SESI / 2;
  return { baris: [...urut.slice(0, separuh), ...urut.slice(-separuh)], terpotong: true };
}

/** Sesi terendah bila AMBANG_SEPI poin atau lebih di bawah rata-rata (butuh 2 sesi atau lebih). */
export function sesiSepi(laju: Laju[], rata: number | null): Laju | null {
  if (laju.length < 2 || rata === null) return null;
  const rendah = laju.reduce((a, c) => (c.p < a.p ? c : a));
  return rata - rendah.p >= AMBANG_SEPI ? rendah : null;
}

export type BarisKelompok = { label: string; hadir: number; total: number; p: number };

/** Kelompok peserta dengan anggota MIN_KELOMPOK atau lebih (yang kecil dan kosong tidak ikut). */
export function anggotaKelompok(b: BahanLaporan): Map<string, Set<string>> {
  const peta = new Map<string, Set<string>>();
  if (!b.kelompokLabel) return peta;
  for (const p of b.peserta) {
    if (!p.kelompok) continue;
    const set = peta.get(p.kelompok) ?? new Set<string>();
    set.add(p.id);
    peta.set(p.kelompok, set);
  }
  for (const [k, set] of peta) if (set.size < MIN_KELOMPOK) peta.delete(k);
  return peta;
}

/**
 * Hadir per kelompok di sesi-sesi ini. Hanya sesi untuk semua peserta (yang
 * diharapkan = semua peserta) dan yang punya id orang, supaya penyebutnya
 * benar: jumlah anggota kelompok.
 */
export function hadirKelompok(b: BahanLaporan, sesi: SesiBahan[]): BarisKelompok[] {
  const anggota = anggotaKelompok(b);
  const pakai = sesi.filter((s) => s.orang && s.diharapkan >= b.peserta.length);
  if (anggota.size < 2 || !pakai.length) return [];
  return [...anggota]
    .map(([label, set]) => {
      const hadir = pakai.reduce((a, s) => a + s.orang!.filter((id) => set.has(id)).length, 0);
      const total = set.size * pakai.length;
      return { label, hadir, total, p: (hadir / total) * 100 };
    })
    .sort((a, c) => c.p - a.p || a.label.localeCompare(c.label));
}

/** Selisih tertinggi dan terendah, dalam poin. */
export const selisih = (baris: Array<{ p: number }>) => (baris.length ? baris[0].p - baris[baris.length - 1].p : 0);
