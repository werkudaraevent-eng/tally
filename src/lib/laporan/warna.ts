/**
 * Tema deck dari halaman acara: warna Kilas balik (merek gelap, aksen,
 * kertas hangat, dengan penjaga kontras), huruf judul, dan foto hero. Deck
 * lama yang hanya menyimpan satu warna aksen diturunkan dengan cara yang sama.
 */
import type { EventLandingConfig } from "../domain.ts";
import { LANDING_HEADING_FONTS } from "../domain.ts";
import { warnaKilas } from "../kilas-balik/warna.ts";
import { landingTokens } from "../landing-tokens.ts";
import type { Deck, Latar, TemaDeck } from "./jenis.ts";

const JUDUL_BAWAAN = "var(--font-sans)";

export function temaAcara(lc: EventLandingConfig | null | undefined): TemaDeck {
  const huruf = LANDING_HEADING_FONTS[landingTokens(lc).headingFont]?.cssVar ?? JUDUL_BAWAAN;
  const src = lc?.hero_bg_url?.trim();
  const foto = src && lc?.hero_bg_on !== false && /^https:\/\//.test(src) ? src : null;
  return { ...warnaKilas(lc), judul: huruf, foto };
}

/** Tema dari satu warna merek saja (deck lama, contoh). */
export function temaDariWarna(hex: string): TemaDeck {
  const merek = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#1D3F8F";
  return { ...warnaKilas(null, { mode: "custom", brand: merek, accent: null }), judul: JUDUL_BAWAAN, foto: null };
}

export function temaDeck(deck: Pick<Deck, "tema" | "warna">): TemaDeck {
  return deck.tema ?? temaDariWarna(deck.warna ?? "");
}

/** Merah untuk "masalah" yang terbaca di tiap permukaan. */
export const MERAH = { gelap: "#FFB4AB", terang: "#B3261E" } as const;

/**
 * Variabel CSS satu permukaan: teks, teks redup, garis, batang biasa,
 * batang utama, merah, angka besar. Satu tempat, dipakai semua blok.
 */
export function warnaPermukaan(t: TemaDeck, latar: Latar): Record<string, string> {
  if (latar === "gelap") {
    const putih = t.latarTeks.toLowerCase() === "#ffffff";
    return { bg: t.latar, teks: t.latarTeks, isi: t.aksen, merah: putih ? MERAH.gelap : MERAH.terang, angka: t.aksen };
  }
  if (latar === "aksen") {
    const putih = t.aksenTeks.toLowerCase() === "#ffffff";
    return { bg: t.aksen, teks: t.aksenTeks, isi: t.aksenTeks, merah: putih ? MERAH.gelap : MERAH.terang, angka: t.aksenTeks };
  }
  // Tinta = merek gelap bila kontrasnya >= 7:1 di kertas, hitam bila tidak.
  return { bg: t.kertas, teks: t.tinta, isi: t.tinta, merah: MERAH.terang, angka: t.tinta };
}
