/**
 * Ukuran dan gaya bersama halaman highlight 1080×1920 (halaman.tsx dan
 * halaman-temuan.tsx). Gaya inline saja: next/og tidak mengenal kelas CSS.
 */
import type { CSSProperties } from "react";
import type { WarnaHalaman } from "@/lib/laporan/harian/warna";

export const LEBAR = 1080;
export const TINGGI = 1920;
export const TEPI = 104;

export type Huruf = { judul: string; isi: string };
export const kolom = (gaya: CSSProperties = {}): CSSProperties => ({ display: "flex", flexDirection: "column", ...gaya });
export const judul = (h: Huruf, w: WarnaHalaman, ukuran = 104): CSSProperties => ({ fontFamily: h.judul, fontSize: ukuran, lineHeight: 1.04, fontWeight: 800, letterSpacing: -3, color: w.teks, margin: 0, wordBreak: "break-word" });
export const isi = (h: Huruf, w: WarnaHalaman): CSSProperties => ({ fontFamily: h.isi, fontSize: 44, lineHeight: 1.32, fontWeight: 500, color: w.teks2, margin: 0, wordBreak: "break-word" });
/** Area di bawah kepala (top 72) sampai tepi bawah, isinya di tengah. */
export const tengah = (gap: number): CSSProperties => kolom({ flex: 1, justifyContent: "center", padding: `170px ${TEPI}px`, gap });

/** Ukuran halaman agenda per tingkat kerapatan: 0 lega, 1 padat, 2 rapat. */
export const UK = {
  judul: [104, 84, 76], nama: [42, 34, 30], batang: [22, 20, 16], antar: [56, 32, 22], dalam: [16, 10, 8], tengah: [80, 48, 36], jam: [120, 96, 80], persen: [170, 150, 120],
};
/** Baris teks kira-kira (lebar huruf ~0,6 ukuran); sengaja sedikit berlebih. */
const barisTeks = (teks: string, ukuran: number, lebar: number) => Math.max(1, Math.ceil((teks.length * ukuran * 0.6) / lebar));

/** Tinggi kira-kira halaman agenda pada satu tingkat kerapatan (px). */
export function tinggiAgenda(p: { judul: string; baris: Array<{ nama: string; ket?: string | null; persen: number | null }>; teks?: string }, t: number): number {
  const lebar = LEBAR - 2 * TEPI;
  const lebarNama = lebar - UK.jam[t] - UK.persen[t] - 48;
  const judulT = barisTeks(p.judul, UK.judul[t], lebar) * UK.judul[t] * 1.04;
  const baris = p.baris.map((r) => {
    const nama = t === 2 ? UK.nama[t] * 1.25 : barisTeks(r.nama, UK.nama[t], lebarNama) * UK.nama[t] * 1.1 + (r.ket ? 6 + 30 * 1.32 : 0);
    return Math.max(nama + (r.persen !== null ? UK.dalam[t] + UK.batang[t] : 0), 80);
  });
  const isiT = baris.reduce((a, x) => a + x, 0) + (p.baris.length - 1) * UK.antar[t];
  return judulT + UK.tengah[t] + isiT + (p.teks ? UK.tengah[t] + 30 * 1.32 * 2 : 0);
}

/** Tingkat paling lega yang muat: 0 lega, 1 padat, 2 rapat (nama satu baris). */
export function tingkatAgenda(p: Parameters<typeof tinggiAgenda>[0] & { foto?: string | null }): number {
  // 10% cadangan: perkiraan lebar huruf tidak persis.
  const ruang = (p.foto ? TINGGI - 720 - 80 - 170 : TINGGI - 2 * 170) * 0.9;
  for (const t of [0, 1]) if (tinggiAgenda(p, t) <= ruang && (t > 0 || p.baris.length <= 4) && (t > 1 || p.baris.length <= 7)) return t;
  return 2;
}
