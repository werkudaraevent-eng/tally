import { cocokSatu, type Saringan } from "../saringan-kolom.ts";

/**
 * Aturan tabel Logistics (Rooms, Trains), murni supaya bisa diuji sendiri
 * (tabel.check.ts). Perilakunya sama dengan Daftar peserta: cari di semua
 * kolom, "+ Filter" per kolom, urut dari judul kolom, Columns, Export.
 *
 * Sel bisa berisi beberapa nilai (penghuni kamar satu per baris), jadi setiap
 * kolom mengembalikan daftar teks. Saringan cocok bila SALAH SATU nilai cocok;
 * "kosong" berarti tidak ada nilai sama sekali.
 */

/**
 * Urutan alami yang menghormati nol di depan: angka dibandingkan menurut
 * panjangnya dulu, baru nilainya. "RY02" sebelum "RY10", dan seluruh seri
 * "RY01..RY99" sebelum seri "RY001..": dua seri label tidak lagi
 * berselang-seling (RY01, RY001, RY02, RY002) seperti dengan Intl.Collator
 * numeric, yang menganggap 01 dan 001 sama.
 */
export function bandingAlami(a: string, b: string): number {
  const pa = a.toLocaleLowerCase("en").match(/\d+|\D+/g) ?? [];
  const pb = b.toLocaleLowerCase("en").match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === y) continue;
    const angkaX = /^\d/.test(x);
    const angkaY = /^\d/.test(y);
    if (angkaX && angkaY) {
      if (x.length !== y.length) return x.length - y.length;
      return x < y ? -1 : 1;
    }
    return x.localeCompare(y, "en");
  }
  return pa.length - pb.length;
}

/** Urut menurut nilai pertama sel. Kosong selalu di akhir, ke arah mana pun; seri tetap urutan masukan. */
export function urutBaris<T>(baris: T[], ambil: (b: T) => string, dir: "asc" | "desc"): T[] {
  const arah = dir === "desc" ? -1 : 1;
  return baris
    .map((b, i) => ({ b, i, k: ambil(b).trim() }))
    .sort((x, y) => {
      if (!x.k || !y.k) return (x.k ? 0 : 1) - (y.k ? 0 : 1) || x.i - y.i;
      return arah * bandingAlami(x.k, y.k) || x.i - y.i;
    })
    .map((x) => x.b);
}

/** Satu saringan pada sel bernilai banyak: cocok bila salah satu nilai cocok. */
export function cocokSel(nilai: string[], s: Saringan): boolean {
  const isi = nilai.map((v) => v.trim()).filter(Boolean);
  if ("kosong" in s) return (isi.length === 0) === s.kosong;
  if (isi.length === 0) return cocokSatu("", s);
  return isi.some((v) => cocokSatu(v, s));
}

/**
 * Cari: setiap kata harus ditemukan di salah satu kolom baris itu (kolom
 * tersembunyi ikut), seperti pencarian Daftar peserta.
 */
export function cocokCari(nilaiSemua: string[], q: string): boolean {
  const kata = q.toLocaleLowerCase("en").split(/\s+/).filter(Boolean);
  if (kata.length === 0) return true;
  const teks = nilaiSemua.map((v) => v.toLocaleLowerCase("en"));
  return kata.every((k) => teks.some((t) => t.includes(k)));
}

/** Nilai dan jumlah baris yang memuatnya, untuk daftar centang "+ Filter". "" = kosong, terakhir. */
export function hitungSel<T>(baris: T[], ambil: (b: T) => string[]): Array<{ value: string; count: number }> {
  const hitung = new Map<string, number>();
  for (const b of baris) {
    const isi = [...new Set(ambil(b).map((v) => v.trim()).filter(Boolean))];
    for (const v of isi.length ? isi : [""]) hitung.set(v, (hitung.get(v) ?? 0) + 1);
  }
  return [...hitung.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (a.value === "" ? 1 : b.value === "" ? -1 : bandingAlami(a.value, b.value)));
}

/** Satu sel CSV: dikutip bila perlu, dan diberi petik di depan bila Excel akan membacanya sebagai rumus. */
export function selCsv(teks: string): string {
  const aman = /^[=+\-@\t\r]/.test(teks) ? `'${teks}` : teks;
  return /[",\n\r;]/.test(aman) ? `"${aman.replace(/"/g, '""')}"` : aman;
}

/** CSV dari kolom yang tampil; sel bernilai banyak digabung dengan "; ". */
export function keCsv(judul: string[], baris: string[][][]): string {
  const garis = [judul.map(selCsv).join(","), ...baris.map((b) => b.map((sel) => selCsv(sel.join("; "))).join(","))];
  return `﻿${garis.join("\r\n")}\r\n`;
}
