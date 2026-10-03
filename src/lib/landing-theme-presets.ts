import type { EventLandingConfig, LandingHeadingFont, LandingLayout } from "./domain";
import { FORUM_DEFAULTS } from "./registration-theme-css";

/**
 * Preset tema halaman acara: satu klik mengisi tata letak, warna, dan huruf
 * judul sekaligus. Semuanya tetap bisa diubah satu per satu sesudahnya.
 *
 * Yang disimpan nilainya, bukan nama preset. Menyimpan "preset: forum-ifc"
 * berarti acara yang sedang berjalan ikut berganti rupa setiap kali daftar ini
 * disunting.
 */
export type LandingThemePreset = {
  key: string;
  label: string;
  note: string;
  layout: LandingLayout;
  seed: string;
  heading_font: LandingHeadingFont;
  /** Warna pendamping tata letak Forum. */
  accent?: string;
  secondary?: string;
  /** Menyalakan "Khusus undangan" (lihat EventLandingConfig.invite_only). */
  invite_only?: boolean;
  /** Menyalakan gaya gathering (lihat EventLandingConfig.gathering). */
  gathering?: boolean;
};

export const LANDING_THEME_PRESETS: LandingThemePreset[] = [
  {
    // Figma "IFC Website" yang Hanung setujui pada 2026-10-01.
    key: "forum-ifc",
    label: "Forum IFC",
    note: "Tiga halaman, navy dengan aksen kuning dan biru langit, huruf Ubuntu",
    layout: "forum",
    seed: FORUM_DEFAULTS.primary,
    heading_font: "ubuntu",
    accent: FORUM_DEFAULTS.accent,
    secondary: FORUM_DEFAULTS.secondary,
  },
  {
    // Rancangan Gathering yang Hanung setujui pada 2026-10-03: tata letak
    // Modern yang sama dengan ILO, bukan tata letak ketiga. Yang berbeda: warna,
    // huruf, sifat "khusus undangan", dan gaya gathering (hero perjalanan,
    // susunan per hari, Tempat menginap). Menu Logistik dinyalakan terpisah
    // karena tersimpan di database, bukan di CMS.
    key: "gathering",
    label: "Gathering",
    note: "Gaya perjalanan, khusus undangan: lama menginap di hero, susunan per hari, tempat menginap, tamu masuk untuk melihat tiket, kamar, dan bus",
    layout: "modern",
    seed: "#0b6e69",
    heading_font: "source",
    invite_only: true,
    gathering: true,
  },
];

const sama = (a: string | undefined, b: string | undefined) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

/** Apakah isi CMS sekarang persis preset ini (untuk menandai kartu yang terpilih). */
export function presetCocok(preset: LandingThemePreset, landing: EventLandingConfig): boolean {
  return (
    (landing.layout ?? "editorial") === preset.layout &&
    sama(landing.theme?.seed, preset.seed) &&
    landing.heading_font === preset.heading_font &&
    Boolean(landing.gathering) === Boolean(preset.gathering) &&
    (preset.layout !== "forum" ||
      (sama(landing.forum?.accent ?? FORUM_DEFAULTS.accent, preset.accent) && sama(landing.forum?.secondary ?? FORUM_DEFAULTS.secondary, preset.secondary)))
  );
}

/** Terapkan preset tanpa menyentuh isi (teks, gambar, bagian). */
export function terapkanPreset(preset: LandingThemePreset, landing: EventLandingConfig): EventLandingConfig {
  return {
    ...landing,
    layout: preset.layout,
    heading_font: preset.heading_font,
    theme: { ...landing.theme, seed: preset.seed },
    // Satu preset, satu gaya: memilih preset lain mematikan gaya gathering.
    invite_only: Boolean(preset.invite_only),
    gathering: Boolean(preset.gathering),
    ...(preset.layout === "forum" ? { forum: { ...landing.forum, accent: preset.accent, secondary: preset.secondary } } : {}),
  };
}
