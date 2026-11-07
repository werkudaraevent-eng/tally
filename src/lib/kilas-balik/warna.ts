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
export type WarnaKilas = { latar: string; latar2: string; aksen: string; aksenTeks: string; kertas: string; tinta: string };

export function warnaKilas(config: EventLandingConfig | null | undefined, tema?: { mode: "event" | "custom"; brand: string | null; accent: string | null } | null): WarnaKilas {
  const acara = landingTokens(config);
  const sendiri = tema?.mode === "custom" && tema.brand;
  const tokens = sendiri ? { brand: tema.brand!, accent: tema.accent ?? null } : { brand: acara.brand, accent: acara.accent ?? null };
  let latar = tokens.brand;
  for (let i = 0; i < 20 && kontras(latar, "#ffffff") < 7; i++) latar = mixHex(latar, "#000000", 0.12);
  const latar2 = mixHex(latar, "#000000", 0.35);
  const calon = tokens.accent ?? GATHERING_ACCENT_DEFAULT;
  const aksen = kontras(calon, latar) >= 3 ? calon : "#ffffff";
  const aksenTeks = kontras(aksen, "#141414") >= kontras(aksen, "#ffffff") ? "#141414" : "#ffffff";
  const kertas = mixHex(aksen === "#ffffff" ? tokens.brand : aksen, "#ffffff", 0.92);
  const tinta = kontras(latar, kertas) >= 7 ? latar : "#141414";
  return { latar, latar2, aksen, aksenTeks, kertas, tinta };
}
