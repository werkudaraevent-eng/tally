import { normalizeLandingSections, type EventLandingConfig, type LandingBodyFont, type LandingCorners, type LandingHeadingFont, type LandingLayout } from "./domain.ts";
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
  /** Warna, opasitas, dan tinggi bilah atas (EventLandingConfig.nav), hanya Gathering. */
  nav?: { color: string; opacity: number; height: number };
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
    (b.nav === undefined || (sama(landing.nav?.color, b.nav.color) && landing.nav?.opacity === b.nav.opacity && landing.nav?.height === b.nav.height)) &&
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
    // Gathering menulis bilah atasnya (warna, opasitas, tinggi). Preset lain
    // tidak menyentuh bilah di sini: Reset di Conference/Forum menjaga bilah
    // pilihan admin, termasuk putih penuh (QA #106 L1).
    ...(b.nav ? { nav: { ...landing.nav, color: b.nav.color, opacity: b.nav.opacity, height: b.nav.height } } : {}),
  };
}

/**
 * Pindah DARI Gathering ke preset lain: lepas nilai bilah yang masih persis
 * nilai Gathering (kembali ke bawaan). Nilai yang sudah diubah admin, logo,
 * dan lebar bilah tetap.
 */
function lepasBilahGathering(nav: EventLandingConfig["nav"]): EventLandingConfig["nav"] {
  if (!nav) return nav;
  const sisa = { ...nav };
  if (sama(sisa.color, GATHERING_NAV_DEFAULT.color) && sisa.opacity === GATHERING_NAV_DEFAULT.opacity) {
    delete sisa.color;
    delete sisa.opacity;
  }
  if (sisa.height === GATHERING_NAV_DEFAULT.height) delete sisa.height;
  return Object.keys(sisa).length ? sisa : undefined;
}

/** Terapkan preset (tata letak, fitur, dan semua token gaya) tanpa menyentuh isi: teks, gambar, bagian, perataan hero. */
export function terapkanPreset(preset: LandingThemePreset, landing: EventLandingConfig): EventLandingConfig {
  const dariGathering = landing.gathering === true && !preset.features.gathering;
  return gayaPreset(preset, {
    ...landing,
    layout: preset.layout,
    // Khusus undangan kini sakelar sendiri di tab Peserta: preset yang tidak
    // menyebutnya membiarkan pilihan admin (QA #110 M2).
    invite_only: preset.features.invite_only ?? landing.invite_only,
    // Satu preset, satu gaya: memilih preset lain mematikan gaya gathering.
    gathering: Boolean(preset.features.gathering),
    ...(dariGathering ? { nav: lepasBilahGathering(landing.nav) } : {}),
  });
}

/** Teks bawaan Tentang acara per bahasa (LANDING_UI), diberikan pemanggil. */
export type TentangBawaan = Record<"id" | "en", { heading: string; cards: { title: string; body: string }[] }>;

const adaTeks = (teks: string | null | undefined) => Boolean(teks?.trim());

/**
 * Isi Gathering di luar gaya, dipakai Apply DAN Reset (QA #107 M1): acara
 * yang sudah memakai Gathering hanya punya tombol Reset.
 *
 * - Judul dan kartu Tentang acara serta label "Tentang acara", hanya yang
 *   masih kosong. Teks Indonesia di kolom dasar, English di `en` (QA #107 M2).
 *   Kartu dianggap isi admin bila judul ATAU teksnya terisi (QA #107 L1).
 * - Bagian Lokasi disembunyikan: rancangan tidak memilikinya. Tetap bisa
 *   dinyalakan lagi di Page sections.
 */
export function isiGathering(landing: EventLandingConfig, bawaan: TentangBawaan): EventLandingConfig {
  const en = { ...landing.en };
  const hasil: EventLandingConfig = { ...landing };
  if (!adaTeks(landing.about_heading)) {
    hasil.about_heading = bawaan.id.heading;
    if (!adaTeks(en.about_heading)) en.about_heading = bawaan.en.heading;
  }
  if (landing.eyebrow_shown?.about === undefined) hasil.eyebrow_shown = { ...landing.eyebrow_shown, about: true };
  if (!(landing.about_cards ?? []).some((kartu) => adaTeks(kartu.title) || adaTeks(kartu.body))) {
    hasil.about_cards = bawaan.id.cards.map((kartu) => ({ ...kartu }));
    en.about_cards = bawaan.en.cards.map((kartu) => ({ ...kartu }));
  }
  if (Object.keys(en).length > 0) hasil.en = en;
  hasil.sections = normalizeLandingSections(landing.sections, landing.blocks).map((section) => (section.id === "venue" ? { ...section, enabled: false } : section));
  return hasil;
}

/** Apa yang akan diubah isiGathering, untuk kalimat konfirmasi Reset. */
export function isiGatheringMengubah(landing: EventLandingConfig): { tentang: boolean; lokasi: boolean } {
  const tentang =
    !adaTeks(landing.about_heading) ||
    landing.eyebrow_shown?.about === undefined ||
    !(landing.about_cards ?? []).some((kartu) => adaTeks(kartu.title) || adaTeks(kartu.body));
  const lokasi = normalizeLandingSections(landing.sections, landing.blocks).find((section) => section.id === "venue")?.enabled !== false;
  return { tentang, lokasi };
}
