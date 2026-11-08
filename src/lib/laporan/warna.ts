/**
 * Tema deck dari halaman acara: warna Kilas balik (merek gelap, aksen,
 * kertas hangat, dengan penjaga kontras), huruf judul, dan foto hero. Deck
 * lama yang hanya menyimpan satu warna aksen diturunkan dengan cara yang sama.
 */
import type { EventLandingConfig } from "../domain.ts";
import { LANDING_HEADING_FONTS } from "../domain.ts";
import { mixHex } from "../color.ts";
import { warnaKilas } from "../kilas-balik/warna.ts";
import { kontras } from "../landing-hitung-mundur.ts";
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

/** Geser `warna` ke `ke` sampai kontrasnya dengan `bg` >= 4,5:1 (teks kecil, AA). */
function cukup(warna: string, ke: string, bg: string): string {
  let w = warna;
  for (let i = 0; i < 20 && kontras(w, bg) < 4.5; i++) w = mixHex(w, ke, 0.1);
  return w;
}

/**
 * Variabel CSS satu permukaan: teks, teks redup, batang utama, merah, angka
 * besar. Teks redup dan merah dijaga >= 4,5:1 di permukaannya. Satu tempat,
 * dipakai semua blok.
 */
export function warnaPermukaan(t: TemaDeck, latar: Latar): Record<string, string> {
  const [bg, teks, isi, angka] =
    latar === "gelap" ? [t.latar, t.latarTeks, t.aksen, t.aksen]
      : latar === "aksen" ? [t.aksen, t.aksenTeks, t.aksenTeks, t.aksenTeks]
        // Tinta = merek gelap bila kontrasnya >= 7:1 di kertas, hitam bila tidak.
        : [t.kertas, t.tinta, t.tinta, t.tinta];
  const terangTeks = kontras(teks, "#000000") > kontras(teks, "#ffffff");
  const merah = terangTeks ? cukup(MERAH.gelap, "#ffffff", bg) : cukup(MERAH.terang, "#000000", bg);
  return { bg, teks, teks2: cukup(mixHex(teks, bg, 0.28), teks, bg), isi, merah, angka };
}

/**
 * Permukaan aksen dipakai hanya bila tulisannya terbaca (>= 4,5:1). Merek
 * terang membuat aksen yang digeser jadi zaitun pudar: deck itu cukup gelap
 * dan kertas saja.
 */
export const aksenTerbaca = (t: TemaDeck) => kontras(t.aksen, t.aksenTeks) >= 4.5;
