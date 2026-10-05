import type { CSSProperties } from "react";
import { LANDING_HEADING_FONTS, type EventLandingConfig, type LandingHeadingFont, type LandingLayout } from "./domain.ts";

/**
 * Token gaya halaman acara: satu tempat yang menjawab "warna dan huruf apa
 * yang dipakai acara ini", dari landing_config plus nilai bawaan tata letaknya.
 *
 * Sebelumnya tiap tata letak menulis bawaannya sendiri (`heading_font ?? "serif"`
 * di Editorial, `?? "source"` di Modern, `?? "ubuntu"` di Forum, dan sekali lagi
 * di halaman Masuk), jadi satu perubahan bawaan harus diingat di empat tempat.
 *
 * Token kosong di config = nilai bawaan di tabel ini, yaitu persis tampilan
 * sebelum modul ini ada. Data yang sudah tayang tidak perlu diubah.
 *
 * Bobot judul TIDAK diatur di sini: tiap tata letak membaca kelasnya sendiri
 * (Modern dan Editorial 600, Forum 700 di forum/styles.ts), supaya mengganti
 * huruf tidak diam-diam mengubah ketebalan judul tata letak lain.
 */

/** Warna merek bawaan Editorial dan Modern. Diekspor ulang sebagai DEFAULT_REGISTRATION_SEED. */
export const DEFAULT_BRAND = "#2649D0";

/** Warna bawaan Forum (Figma IFC). Diekspor ulang oleh registration-theme-css. */
export const FORUM_DEFAULTS = { primary: "#002f54", accent: "#ffc72c", secondary: "#00aeef" } as const;

/** Aksen bawaan gaya gathering: emas, pasangan navy di rancangan KSO 21. */
export const GATHERING_ACCENT_DEFAULT = "#E9C46A";

export type LandingTokens = {
  layout: LandingLayout;
  /** Warna merek, selalu hex #rrggbb yang valid. */
  brand: string;
  /** Aksen: Forum dan Modern bergaya gathering. Null = tata letak ini tidak memakai aksen. */
  accent: string | null;
  /** Warna ketiga, khusus Forum. */
  secondary: string | null;
  headingFont: LandingHeadingFont;
  /** Huruf isi. Hanya Forum yang memasangnya hari ini; yang lain mewarisi Inter dari halaman. */
  bodyFont: LandingHeadingFont;
};

type Bawaan = Pick<LandingTokens, "brand" | "headingFont" | "bodyFont">;

/** Nilai bawaan per tata letak. Ubah di sini, bukan di komponen. */
export const LANDING_TOKEN_DEFAULTS: Record<LandingLayout, Bawaan> = {
  editorial: { brand: DEFAULT_BRAND, headingFont: "serif", bodyFont: "sans" },
  modern: { brand: DEFAULT_BRAND, headingFont: "source", bodyFont: "sans" },
  forum: { brand: FORUM_DEFAULTS.primary, headingFont: "ubuntu", bodyFont: "ubuntu" },
};

const HEX = /^#[0-9a-f]{6}$/i;
const warna = (nilai: string | undefined, bawaan: string) => (HEX.test(nilai ?? "") ? nilai! : bawaan);
const huruf = (nilai: string | undefined, bawaan: LandingHeadingFont): LandingHeadingFont =>
  nilai && Object.hasOwn(LANDING_HEADING_FONTS, nilai) ? (nilai as LandingHeadingFont) : bawaan;

/** Tata letak yang benar-benar dirender (render-landing.tsx): selain modern dan forum = Editorial. */
export function landingLayout(config: Pick<EventLandingConfig, "layout"> | null | undefined): LandingLayout {
  return config?.layout === "modern" || config?.layout === "forum" ? config.layout : "editorial";
}

/**
 * Token acara ini. `layout` menimpa tata letak config, untuk permukaan yang
 * berbingkai lain dari halamannya (formulir pendaftaran v2 selalu berbingkai
 * Modern atau Forum).
 */
export function landingTokens(config: EventLandingConfig | null | undefined, layout: LandingLayout = landingLayout(config)): LandingTokens {
  const c = config ?? {};
  const bawaan = LANDING_TOKEN_DEFAULTS[layout];
  const forum = layout === "forum";
  const gathering = layout === "modern" && c.gathering === true;
  return {
    layout,
    brand: warna(c.theme?.seed, bawaan.brand),
    accent: forum ? warna(c.forum?.accent, FORUM_DEFAULTS.accent) : gathering ? warna(c.accent, GATHERING_ACCENT_DEFAULT) : null,
    secondary: forum ? warna(c.forum?.secondary, FORUM_DEFAULTS.secondary) : null,
    headingFont: huruf(c.heading_font, bawaan.headingFont),
    bodyFont: bawaan.bodyFont,
  };
}

/**
 * Huruf untuk akar halaman: `--landing-heading`, `--landing-body`, dan tanpa
 * tebal palsu. Huruf yang tidak punya bobot yang diminta tampil dengan bobot
 * terdekat yang ada, bukan ditebalkan peramban (goresan kabur, lebar berubah).
 */
export function landingFontStyle(tokens: Pick<LandingTokens, "headingFont" | "bodyFont">): CSSProperties {
  return {
    "--landing-heading": LANDING_HEADING_FONTS[tokens.headingFont].cssVar,
    "--landing-body": LANDING_HEADING_FONTS[tokens.bodyFont].cssVar,
    fontSynthesisWeight: "none",
  } as CSSProperties;
}
