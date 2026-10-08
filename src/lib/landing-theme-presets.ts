import type { EventLandingConfig, LandingBodyFont, LandingCorners, LandingHeadingFont, LandingLayout } from "./domain.ts";
import { DEFAULT_BRAND, FORUM_DEFAULTS, GATHERING_ACCENT_DEFAULT, GATHERING_BRAND_DEFAULT, GATHERING_BUTTON_DEFAULT, GATHERING_NAV_DEFAULT, LANDING_TOKEN_DEFAULTS, landingLayout, landingTokens } from "./landing-tokens.ts";

/**
 * Preset tema halaman acara: satu klik mengisi tata letak, warna, dan huruf
 * judul sekaligus. Semuanya tetap bisa diubah satu per satu sesudahnya.
 *
 * Yang disimpan nilainya, bukan nama preset. Menyimpan "preset: forum-ifc"
 * berarti acara yang sedang berjalan ikut berganti rupa setiap kali daftar ini
 * disunting.
 *
 * Token gaya yang dibawa preset. Apply menulis SEMUANYA (QA #90 M2), supaya
 * hasil preset tidak bergantung pada pilihan yang tertinggal dari sebelumnya.
 * Perataan hero tidak termasuk: itu isi bagian Hero (Page sections), bukan gaya.
 */
export type LandingPresetTokens = {
  brand: string;
  /** Aksen gathering (Modern) atau aksen Forum. */
  accent?: string;
  /** Warna ketiga, hanya Forum. */
  secondary?: string;
  /** Warna tombol gaya gathering (EventLandingConfig.button_color). */
  button?: string;
  /** Warna dan opasitas bilah atas (EventLandingConfig.nav), hanya Gathering. */
  nav?: { color: string; opacity: number };
  heading_font: LandingHeadingFont;
  body_font: LandingBodyFont;
  corners: LandingCorners;
};

export type LandingThemePreset = {
  key: string;
  label: string;
  note: string;
  /**
   * Cuplikan 162×100 (2x) di public/, dipotong di bagian yang membedakan preset.
   * Dibuat dari acara contoh bernama netral, bukan acara klien.
   */
  thumb: string;
  layout: LandingLayout;
  tokens: LandingPresetTokens;
  /**
   * Fitur yang ikut preset dan menentukan "preset mana yang dipakai acara ini".
   * Token boleh diubah sesudahnya (kartu jadi "Edited"); fitur tidak.
   */
  features: {
    /** Menyalakan "Khusus undangan" (lihat EventLandingConfig.invite_only). */
    invite_only?: boolean;
    /** Menyalakan gaya gathering (lihat EventLandingConfig.gathering). */
    gathering?: boolean;
  };
};

export const LANDING_THEME_PRESETS: LandingThemePreset[] = [
  {
    // Halaman acara Modern biasa, juga jalan kembali dari Gathering (QA PR #57 M1).
    // "Conference", bukan "Modern": Modern adalah nama tata letak, dan dua
    // "Modern" di satu tab adalah separuh keluhan preset vs layout.
    key: "modern",
    label: "Conference",
    note: "Register, programme, speakers",
    thumb: "/preset-tema/conference.png",
    layout: "modern",
    tokens: { brand: DEFAULT_BRAND, heading_font: "source", body_font: "sans", corners: "soft" },
    features: {},
  },
  {
    // Figma "IFC Website" yang Hanung setujui pada 2026-10-01.
    key: "forum-ifc",
    label: "Forum IFC",
    note: "Three pages, navy with yellow and sky blue",
    thumb: "/preset-tema/forum.png",
    layout: "forum",
    tokens: { brand: FORUM_DEFAULTS.primary, accent: FORUM_DEFAULTS.accent, secondary: FORUM_DEFAULTS.secondary, heading_font: "ubuntu", body_font: "ubuntu", corners: "soft" },
    features: {},
  },
  {
    // Rancangan Gathering yang Hanung setujui pada 2026-10-03: tata letak
    // Modern yang sama dengan ILO, bukan tata letak ketiga. Yang berbeda: warna,
    // huruf, sifat "khusus undangan", dan gaya gathering (hero perjalanan,
    // susunan per hari, Tempat menginap). Menu Logistik dinyalakan terpisah
    // karena tersimpan di database, bukan di CMS.
    key: "gathering",
    label: "Gathering",
    note: "Invite only, trip days, hotel",
    thumb: "/preset-tema/gathering.png",
    layout: "modern",
    // Rancangan pen.dev Hanung (2026-10-07): navy, aksen emas, tombol hijau,
    // bilah atas putih. Inter saja: kunci "sans" = Inter.
    tokens: { brand: GATHERING_BRAND_DEFAULT, accent: GATHERING_ACCENT_DEFAULT, button: GATHERING_BUTTON_DEFAULT, nav: GATHERING_NAV_DEFAULT, heading_font: "sans", body_font: "sans", corners: "soft" },
    features: { invite_only: true, gathering: true },
  },
];

const sama = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

/**
 * Apakah acara ini memakai preset ini: tata letak dan fiturnya sama. Warna dan
 * huruf boleh berbeda; bedanya ditandai `presetDiubah`, bukan dengan
 * menghilangkan tanda "In use".
 */
export function presetCocok(preset: LandingThemePreset, landing: EventLandingConfig): boolean {
  const gathering = landingLayout(landing) === "modern" && landing.gathering === true;
  return landingLayout(landing) === preset.layout && gathering === Boolean(preset.features.gathering);
}

/** Token mana yang berbeda dari bundel preset (dibaca dari token yang berlaku, bukan config mentah). */
export function presetDiubah(preset: LandingThemePreset, landing: EventLandingConfig): boolean {
  const t = landingTokens(landing);
  const b = preset.tokens;
  return !(
    sama(t.brand, b.brand) &&
    (b.accent === undefined || sama(t.accent, b.accent)) &&
    (b.secondary === undefined || sama(t.secondary, b.secondary)) &&
    (b.button === undefined || sama(landing.button_color, b.button)) &&
    (b.nav === undefined || (sama(landing.nav?.color, b.nav.color) && landing.nav?.opacity === b.nav.opacity)) &&
    t.headingFont === b.heading_font &&
    t.bodyFont === b.body_font &&
    // Forum tidak membaca sudut.
    (preset.layout === "forum" || t.corners === b.corners)
  );
}

/**
 * Tulis token gaya preset ke config. Nilai yang sama dengan bawaan tata letak
 * disimpan kosong (huruf isi, sudut), supaya config tetap sependek mungkin dan
 * halaman merender persis seperti acara yang belum pernah memilihnya.
 */
export function gayaPreset(preset: LandingThemePreset, landing: EventLandingConfig): EventLandingConfig {
  const b = preset.tokens;
  const bawaan = LANDING_TOKEN_DEFAULTS[preset.layout];
  return {
    ...landing,
    theme: { ...landing.theme, seed: b.brand },
    heading_font: b.heading_font,
    body_font: b.body_font === bawaan.bodyFont ? undefined : b.body_font,
    corners: b.corners === "soft" ? undefined : b.corners,
    ...(preset.layout === "forum"
      ? { forum: { ...landing.forum, accent: b.accent, secondary: b.secondary } }
      : b.accent ? { accent: b.accent } : {}),
    // Hanya preset bertombol (Gathering) yang mengisinya; preset lain mengosongkan.
    button_color: b.button,
    nav: navPreset(b, landing.nav),
  };
}

/**
 * Bilah atas: Gathering menulis putih penuh. Preset lain hanya melepas putih
 * Gathering itu (kembali ke bawaan); warna bilah pilihan admin tetap.
 * Logo, lebar, dan tinggi bilah tidak pernah disentuh.
 */
function navPreset(b: LandingPresetTokens, nav: EventLandingConfig["nav"]): EventLandingConfig["nav"] {
  if (b.nav) return { ...nav, color: b.nav.color, opacity: b.nav.opacity };
  if (!nav || !(sama(nav.color, GATHERING_NAV_DEFAULT.color) && nav.opacity === GATHERING_NAV_DEFAULT.opacity)) return nav;
  const { color: _warna, opacity: _opasitas, ...sisa } = nav;
  void _warna;
  void _opasitas;
  return Object.keys(sisa).length ? sisa : undefined;
}

/** Terapkan preset (tata letak, fitur, dan semua token gaya) tanpa menyentuh isi: teks, gambar, bagian, perataan hero. */
export function terapkanPreset(preset: LandingThemePreset, landing: EventLandingConfig): EventLandingConfig {
  return gayaPreset(preset, {
    ...landing,
    layout: preset.layout,
    // Satu preset, satu gaya: memilih preset lain mematikan gaya gathering.
    invite_only: Boolean(preset.features.invite_only),
    gathering: Boolean(preset.features.gathering),
  });
}
