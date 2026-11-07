import { mixHex } from "../color.ts";
import type { EventLandingConfig } from "../domain.ts";
import { kontras } from "../landing-hitung-mundur.ts";
import { GATHERING_ACCENT_DEFAULT, landingTokens } from "../landing-tokens.ts";

/**
 * Warna Kilas balik dari tema acara (Event page > Theme). Fungsi murni.
 *
 * Kartu kenangan berlatar warna merek yang digelapkan sampai teks putih
 * terbaca (≥ 7:1, AAA, karena dibaca di kereta yang terang); kartu pertanyaan
 * berlatar kertas hangat dari warna aksen. Aksen yang tidak terbaca di latar
 * gelap diganti putih.
 */
export type WarnaKilas = { latar: string; latar2: string; latarTeks: string; aksen: string; aksenTeks: string; kertas: string; tinta: string };

const PUTIH = "#ffffff";
const HITAM = "#141414";

/** Kejenuhan kasar 0..1 dari #rrggbb: 0 = abu-abu. */
function kejenuhan(hex: string): number {
  const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const tinggi = Math.max(...n);
  const rendah = Math.min(...n);
  return tinggi === 0 ? 0 : (tinggi - rendah) / tinggi;
}

/** Geser warna ke arah `ke` sedikit demi sedikit sampai kontrasnya dengan `lawan` cukup. Null bila tidak tercapai. */
function geserSampai(warna: string, ke: string, lawan: string, min: number): string | null {
  let w = warna;
  for (let i = 0; i < 12; i++) {
    if (kontras(w, lawan) >= min) return w;
    w = mixHex(w, ke, 0.12);
  }
  return kontras(w, lawan) >= min ? w : null;
}

export function warnaKilas(config: EventLandingConfig | null | undefined, tema?: { mode: "event" | "custom"; brand: string | null; accent: string | null } | null): WarnaKilas {
  const acara = landingTokens(config);
  const sendiri = tema?.mode === "custom" && tema.brand;
  const tokens = sendiri ? { brand: tema.brand!, accent: tema.accent ?? null } : { brand: acara.brand, accent: acara.accent ?? null };
  // Merek terang (kuning, krem, putih) tetap jadi latar dengan tulisan gelap,
  // supaya warnanya tidak berubah jadi zaitun pudar. Merek lain digelapkan
  // sampai tulisan putih terbaca (>= 7:1, AAA, karena dibaca di kereta yang terang).
  const terang = kontras(tokens.brand, HITAM) >= 7 && kontras(tokens.brand, PUTIH) < 4.5;
  const latarTeks = terang ? HITAM : PUTIH;
  const latar = terang ? tokens.brand : (geserSampai(tokens.brand, "#000000", PUTIH, 7) ?? "#000000");
  const lebihGelap = mixHex(latar, "#000000", terang ? 0.08 : 0.35);
  const latar2 = kontras(lebihGelap, latarTeks) >= 7 ? lebihGelap : latar;
  // Aksen yang kurang kontras digeser dulu (lebih gelap di latar terang, lebih
  // terang di latar gelap) supaya warnanya tetap ada; baru bila gagal, pakai warna tulisan.
  const calon = tokens.accent ?? GATHERING_ACCENT_DEFAULT;
  // Aksen tanpa warna (putih, abu, hitam) yang harus digeser hanya jadi abu:
  // pakai warna merek sendiri yang digeser, supaya layar aksen tetap berwarna.
  const tanpaWarna = kontras(calon, latar) < 3 && kejenuhan(calon) < 0.12;
  const aksen = geserSampai(tanpaWarna ? tokens.brand : calon, terang ? "#000000" : PUTIH, latar, 3) ?? latarTeks;
  const aksenTeks = kontras(aksen, HITAM) >= kontras(aksen, PUTIH) ? HITAM : PUTIH;
  const kertas = mixHex(aksen === PUTIH || aksen === HITAM ? tokens.brand : aksen, PUTIH, 0.92);
  const tinta = kontras(latar, kertas) >= 7 ? latar : HITAM;
  return { latar, latar2, latarTeks, aksen, aksenTeks, kertas, tinta };
}
