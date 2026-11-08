/**
 * Warna tiap permukaan halaman harian, dari tema acara (warna Kilas balik).
 * Lima permukaan bergantian supaya carousel tidak satu warna, tapi semuanya
 * turunan merek: gelap, aksen, kertas, putih, dan "muda" (pasangan aksen
 * di roda warna, sangat terang). Teks di tiap permukaan dijaga >= 4,5:1.
 */
import { mixHex } from "../../color.ts";
import { kontras } from "../../landing-hitung-mundur.ts";
import type { TemaDeck } from "../jenis.ts";
import type { Permukaan } from "./jenis.ts";

const PUTIH = "#FFFFFF";
const HITAM = "#141414";

function keHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const maks = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (maks + min) / 2;
  if (maks === min) return [0, 0, l];
  const d = maks - min;
  const s = l > 0.5 ? d / (2 - maks - min) : d / (maks + min);
  const h = maks === r ? (g - b) / d + (g < b ? 6 : 0) : maks === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function dariHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Pasangan aksen: hue diputar 150°, sangat terang, sedikit berwarna. Aksen tanpa warna dapat biru muda. */
export function warnaMuda(aksen: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(aksen)) return "#DCEBFA";
  const [h, s] = keHsl(aksen);
  return s < 0.12 ? "#DCEBFA" : dariHsl((h + 150) % 360, Math.min(Math.max(s, 0.45), 0.75), 0.88);
}

export type WarnaHalaman = { bg: string; teks: string; teks2: string; isi: string; redup: string; angka: string };

/** Teks redup: campuran teks dan latar, digeser ke teks sampai >= 4,5:1 (teks 30-44 px tetap dijaga AA). */
function redupkan(teks: string, bg: string): string {
  let w = mixHex(teks, bg, 0.3);
  for (let i = 0; i < 20 && kontras(w, bg) < 4.5; i++) w = mixHex(w, teks, 0.15);
  return kontras(w, bg) >= 4.5 ? w : teks;
}
/** Warna batang utama: dipakai bila >= 3:1 di latarnya, selain itu warna tulisan. */
const batang = (warna: string, bg: string, teks: string) => (kontras(warna, bg) >= 3 ? warna : teks);

export function warnaHalaman(t: TemaDeck, p: Permukaan): WarnaHalaman {
  switch (p) {
    case "foto":
      return { bg: t.latar2, teks: PUTIH, teks2: "#FFFFFFD9", isi: t.aksen, redup: "#FFFFFF40", angka: PUTIH };
    case "gelap":
      // Aksen yang samar di latar (merek terang) diganti warna tulisan untuk angka besar.
      return { bg: t.latar, teks: t.latarTeks, teks2: redupkan(t.latarTeks, t.latar), isi: batang(t.aksen, t.latar, t.latarTeks), redup: `${t.latarTeks}29`, angka: batang(t.aksen, t.latar, t.latarTeks) };
    case "aksen":
      return { bg: t.aksen, teks: t.aksenTeks, teks2: redupkan(t.aksenTeks, t.aksen), isi: t.aksenTeks, redup: `${t.aksenTeks}2E`, angka: t.aksenTeks };
    case "kertas":
      return { bg: t.kertas, teks: t.tinta, teks2: redupkan(t.tinta, t.kertas), isi: batang(t.latar, t.kertas, t.tinta), redup: `${t.tinta}21`, angka: t.tinta };
    case "putih":
      // Merek terang (kuning, putih, merah muda) hampir tak terlihat di putih: batang puncak jadi hitam.
      return { bg: PUTIH, teks: HITAM, teks2: redupkan(HITAM, PUTIH), isi: batang(t.latar, PUTIH, HITAM), redup: "#C9CCD3", angka: HITAM };
    case "muda": {
      const bg = warnaMuda(t.aksen);
      const teks = kontras(t.tinta, bg) >= 4.5 ? t.tinta : HITAM;
      return { bg, teks, teks2: redupkan(teks, bg), isi: batang(t.latar, bg, HITAM), redup: `${teks}24`, angka: teks };
    }
  }
}
