import type { CSSProperties } from "react";
import {
  LANDING_BODY_FONTS,
  LANDING_CORNERS,
  LANDING_HEADING_FONTS,
  type EventLandingConfig,
  type LandingCorners,
  type LandingHeadingFont,
  type LandingHeroAlign,
  type LandingHeroPosition,
  type LandingLayout,
} from "./domain.ts";

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
  /** Huruf isi. Forum selalu memasangnya; tata letak lain hanya bila admin memilih (lihat bodyFontChosen). */
  bodyFont: LandingHeadingFont;
  /** Admin memilih huruf isi sendiri. False = halaman mewarisi Inter dari <body>, seperti sebelum token ada. */
  bodyFontChosen: boolean;
  /** Forum selalu `soft`: rancangan IFC memakai sudutnya sendiri. */
  corners: LandingCorners;
  /** Hero Modern. Editorial dan Forum selalu kiri. */
  heroAlign: LandingHeroAlign;
  /** Hero Modern. Editorial dan Forum: `bottom`, tidak dibaca. */
  heroPosition: LandingHeroPosition;
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
  const isi = (LANDING_BODY_FONTS as readonly string[]).includes(c.body_font ?? "") ? c.body_font! : null;
  // Gathering: hero undangan di tengah (rancangan v3 KSO 21). Tanpa KV tidak ada
  // gambar yang perlu diperlihatkan di atas judul, jadi isinya di tengah juga.
  const heroAlign: LandingHeroAlign = layout !== "modern" ? "left" : c.hero_align === "left" || c.hero_align === "center" ? c.hero_align : gathering ? "center" : "left";
  const heroPosition: LandingHeroPosition =
    layout !== "modern" ? "bottom"
      : c.hero_position === "bottom" || c.hero_position === "middle" ? c.hero_position
        : gathering || !c.banner_url ? "middle" : "bottom";
  return {
    layout,
    brand: warna(c.theme?.seed, bawaan.brand),
    accent: forum ? warna(c.forum?.accent, FORUM_DEFAULTS.accent) : gathering ? warna(c.accent, GATHERING_ACCENT_DEFAULT) : null,
    secondary: forum ? warna(c.forum?.secondary, FORUM_DEFAULTS.secondary) : null,
    // Huruf judul bawaan mengikuti tata letak halaman acaranya, bukan bingkai:
    // formulir v2 acara Editorial berbingkai Modern tapi judulnya tetap serif.
    headingFont: huruf(c.heading_font, LANDING_TOKEN_DEFAULTS[forum ? "forum" : landingLayout(config)].headingFont),
    bodyFont: isi ?? bawaan.bodyFont,
    bodyFontChosen: isi !== null,
    corners: !forum && (LANDING_CORNERS as readonly string[]).includes(c.corners ?? "") ? c.corners! : "soft",
    heroAlign,
    heroPosition,
  };
}

/**
 * Nilai sudut per pilihan. `soft` tidak menimpa apa pun: skala M3 di
 * globals.css (:root) apa adanya. `full` (pil, avatar, saklar) tidak pernah ditimpa.
 */
const SUDUT: Record<Exclude<LandingCorners, "soft">, Record<string, string>> = {
  square: {
    "--md-sys-shape-corner-extra-small": "0px",
    "--md-sys-shape-corner-small": "0px",
    "--md-sys-shape-corner-medium": "0px",
    "--md-sys-shape-corner-large": "0px",
    "--md-sys-shape-corner-large-increased": "0px",
    "--md-sys-shape-corner-extra-large": "0px",
    "--md-sys-shape-corner-extra-large-increased": "0px",
    "--md-sys-shape-corner-extra-extra-large": "0px",
  },
  round: {
    "--md-sys-shape-corner-extra-small": "8px",
    "--md-sys-shape-corner-small": "12px",
    "--md-sys-shape-corner-medium": "16px",
    "--md-sys-shape-corner-large": "24px",
    "--md-sys-shape-corner-large-increased": "28px",
    "--md-sys-shape-corner-extra-large": "32px",
    "--md-sys-shape-corner-extra-large-increased": "40px",
    "--md-sys-shape-corner-extra-extra-large": "56px",
  },
};

/**
 * Gaya akar halaman: `--landing-heading`, `--landing-body`, huruf isi pilihan
 * admin, sudut, dan tanpa tebal palsu. Huruf yang tidak punya bobot yang diminta tampil dengan bobot
 * terdekat yang ada, bukan ditebalkan peramban (goresan kabur, lebar berubah).
 */
export function landingFontStyle(tokens: Pick<LandingTokens, "headingFont" | "bodyFont" | "bodyFontChosen" | "corners">): CSSProperties {
  return {
    "--landing-heading": LANDING_HEADING_FONTS[tokens.headingFont].cssVar,
    "--landing-body": LANDING_HEADING_FONTS[tokens.bodyFont].cssVar,
    ...landingShapeStyle(tokens),
    fontSynthesisWeight: "none",
  } as CSSProperties;
}

/**
 * Hanya pilihan admin yang tidak punya bawaan di permukaan itu: huruf isi dan
 * sudut. Untuk formulir pendaftaran, yang huruf dan bobotnya diatur sendiri;
 * tanpa pilihan hasilnya objek kosong, jadi formulir lama tidak berubah.
 */
export function landingShapeStyle(tokens: Pick<LandingTokens, "bodyFont" | "bodyFontChosen" | "corners">): CSSProperties {
  return {
    // Forum memasang huruf isinya sendiri lewat kelas (forum-shell.tsx).
    ...(tokens.bodyFontChosen ? { "--landing-body": LANDING_HEADING_FONTS[tokens.bodyFont].cssVar, fontFamily: "var(--landing-body)" } : null),
    ...(tokens.corners === "soft" ? null : SUDUT[tokens.corners]),
  } as CSSProperties;
}
