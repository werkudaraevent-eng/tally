// Branding header dan footer untuk layar publik: /denah (mode pencarian dan LED)
// dan /display.
//
// Modul ini dipakai bersama server dan browser, jadi WAJIB bebas dari impor
// server-only (mis. service client Supabase). Ia hanya berisi bentuk data,
// nilai bawaan, dan perhitungan ukuran murni.
//
// Kenapa satu modul untuk dua tabel: `seat_map_sessions` dan `display_settings`
// sengaja memakai nama kolom yang identik untuk bagian branding. Dengan begitu
// satu fungsi normalisasi dan satu komponen render melayani keduanya. Kalau
// masing-masing punya bentuk sendiri, setiap penambahan field kelak harus
// dikerjakan dua kali, dan begitu satu terlewat kedua layar di ruangan yang sama
// tampil dengan aturan berbeda.

/**
 * Kunci jenis huruf, bukan nama font.
 *
 * Daftar tertutup, dan itu disengaja. Font di layar ini di-self-host lewat
 * next/font supaya tidak ada permintaan ke server luar saat acara berlangsung.
 * LED di lokasi sering berada di jaringan buruk atau tertutup, dan font yang
 * gagal diambil di tengah acara berarti layar jatuh ke fallback yang tidak pernah
 * diuji — tepat ketika tidak ada yang bisa memperbaikinya.
 *
 * Memakai kunci, bukan nama font asli, membuat penukaran font di belakang kunci
 * tidak memerlukan migrasi data.
 */
export type BrandingFont = "sans" | "geometric" | "condensed" | "grotesk" | "serif" | "mono";

export const BRANDING_FONTS: { value: BrandingFont; label: string; hint: string }[] = [
  { value: "sans", label: "Sans (bawaan)", hint: "Geist. Netral, aman untuk semua ukuran layar." },
  { value: "geometric", label: "Geometric", hint: "Montserrat. Paling dekat dengan key visual acara." },
  { value: "condensed", label: "Condensed", hint: "Oswald. Untuk judul panjang di panel sempit." },
  { value: "grotesk", label: "Grotesk", hint: "Space Grotesk. Modern, sedikit teknis." },
  { value: "serif", label: "Serif", hint: "Playfair Display. Formal, untuk gala." },
  { value: "mono", label: "Mono", hint: "Geist Mono. Lebar huruf seragam." },
];

/**
 * Nama variabel CSS per kunci font.
 *
 * Variabelnya didaftarkan di root layout lewat next/font. Di sini hanya
 * pemetaan namanya, supaya modul ini tetap bebas dari impor next/font dan aman
 * dipakai di komponen klien mana pun.
 */
const FONT_VARIABLES: Record<BrandingFont, string> = {
  sans: "--font-sans",
  geometric: "--font-geometric",
  condensed: "--font-condensed",
  grotesk: "--font-grotesk",
  serif: "--font-serif",
  mono: "--font-mono",
};

/** Rantai fallback ikut disertakan: kalau font gagal dimuat, layar tetap terbaca. */
export function fontStack(font: BrandingFont): string {
  const fallback = font === "serif" ? "Georgia, serif" : font === "mono" ? "ui-monospace, monospace" : "ui-sans-serif, system-ui, sans-serif";
  return `var(${FONT_VARIABLES[font]}), ${fallback}`;
}

export type Branding = {
  /** Null berarti tidak ada logo; header tampil seperti sebelum fitur ini ada. */
  logo_url: string | null;
  logo_scale: number;
  /**
   * Satu gambar gabungan berisi blok sponsor / media partner yang sudah ditata
   * desainer. Null berarti footer tetap seperti sebelumnya.
   *
   * Sengaja satu gambar, bukan daftar logo yang disusun sistem: blok sponsor
   * punya aturan yang tidak bisa ditebak — jarak antar logo, ukuran optis yang
   * berbeda dari ukuran kotaknya, dan urutan yang sudah disepakati kontrak.
   * Menyusunnya otomatis menghasilkan barisan yang benar secara teknis tapi
   * terlihat salah, dan panitia tidak punya cara memperbaikinya.
   */
  footer_image_url: string | null;
  footer_image_scale: number;
  /** Mis. "Official Media Partners :". Null atau kosong berarti tidak dirender. */
  footer_text: string | null;
  heading_font: BrandingFont;
  title_scale: number;
  subtitle_scale: number;
  footer_scale: number;
  /** Null berarti ikut warna dasar layar, bukan berarti tanpa warna. */
  title_color: string | null;
  subtitle_color: string | null;
  footer_text_color: string | null;
};

/**
 * Nilai bawaan: semua kosong, semua skala 1.00.
 *
 * Ini bagian penting dari janji fitur ini — tanpa satu pun field diisi, kedua
 * layar tampil PERSIS seperti sebelum branding CMS ada. Header dan footer baru
 * muncul hanya setelah admin sengaja mengunggahnya.
 */
export const DEFAULT_BRANDING: Branding = {
  logo_url: null,
  logo_scale: 1,
  footer_image_url: null,
  footer_image_scale: 1,
  footer_text: null,
  heading_font: "sans",
  title_scale: 1,
  subtitle_scale: 1,
  footer_scale: 1,
  title_color: null,
  subtitle_color: null,
  footer_text_color: null,
};

export const BRANDING_COLUMNS =
  "logo_url,logo_scale,footer_image_url,footer_image_scale,footer_text,heading_font,title_scale,subtitle_scale,footer_scale,title_color,subtitle_color,footer_text_color";

export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2;

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Skala dari database datang sebagai string.
 *
 * `numeric` di Postgres diserialkan menjadi string oleh driver supaya presisinya
 * tidak hilang, jadi angka mentahnya tidak bisa langsung dipakai dalam perhitungan
 * CSS. Nilai di luar batas dijatuhkan ke 1, bukan dijepit: nilai aneh berarti data
 * rusak, dan tampil pada ukuran bawaan yang teruji lebih baik daripada tampil pada
 * ukuran ekstrem yang kebetulan masih lolos batas.
 */
function normalizeScale(raw: unknown): number {
  const value = typeof raw === "string" ? Number.parseFloat(raw) : typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isFinite(value) || value < SCALE_MIN || value > SCALE_MAX) return 1;
  return value;
}

function normalizeHex(raw: unknown): string | null {
  return typeof raw === "string" && HEX.test(raw) ? raw : null;
}

function normalizeUrl(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function normalizeFont(raw: unknown): BrandingFont {
  return BRANDING_FONTS.some((item) => item.value === raw) ? (raw as BrandingFont) : "sans";
}

/** Membaca kolom branding dari baris tabel mana pun yang memakai nama kolom ini. */
export function normalizeBranding(raw: Record<string, unknown> | null | undefined): Branding {
  if (!raw) return DEFAULT_BRANDING;
  const text = typeof raw.footer_text === "string" ? raw.footer_text.trim() : "";
  return {
    logo_url: normalizeUrl(raw.logo_url),
    logo_scale: normalizeScale(raw.logo_scale),
    footer_image_url: normalizeUrl(raw.footer_image_url),
    footer_image_scale: normalizeScale(raw.footer_image_scale),
    footer_text: text.length > 0 ? text : null,
    heading_font: normalizeFont(raw.heading_font),
    title_scale: normalizeScale(raw.title_scale),
    subtitle_scale: normalizeScale(raw.subtitle_scale),
    footer_scale: normalizeScale(raw.footer_scale),
    title_color: normalizeHex(raw.title_color),
    subtitle_color: normalizeHex(raw.subtitle_color),
    footer_text_color: normalizeHex(raw.footer_text_color),
  };
}

/**
 * Mengalikan skala admin ke rumus `clamp()` yang sudah ada.
 *
 * Inilah cara skala bekerja, dan alasannya menentukan seluruh rancangan fitur
 * ini. Tampilan LED sengaja tidak punya satu pun ukuran piksel tetap: semuanya
 * `clamp()` dengan `vmin`/`vw` supaya tata letak menyesuaikan diri dari panel
 * 256x768 sampai 1080x1920 tanpa disetel ulang saat pemasangan.
 *
 * Kalau admin diberi field "ukuran font dalam px", angka yang pas di monitornya
 * akan mepet di panel sempit dan mungil di LED besar — dan itu baru terlihat
 * setelah layar terpasang di dinding. Dengan mengalikan KETIGA batas clamp,
 * proporsi dan sifat responsifnya tetap utuh; yang berubah hanya besarnya
 * relatif terhadap isi lain.
 *
 * Skala 1 mengembalikan string aslinya tanpa disentuh, bukan hasil perkalian
 * dengan 1. Ini menjaga agar nilai bawaan benar-benar identik dengan kode
 * sebelumnya, bukan sekadar setara secara matematis.
 */
export function scaleClamp(expression: string, scale: number): string {
  if (scale === 1) return expression;
  const match = /^clamp\(\s*([^,]+),\s*(.+),\s*([^,]+)\s*\)$/.exec(expression.trim());
  // Bukan clamp() melainkan ukuran tunggal seperti `12px`. Tetap dikalikan, bukan
  // dikembalikan apa adanya: ada elemen yang memang berukuran tetap di semua layar
  // (sub judul di halaman ponsel memakai `text-xs`), dan mengembalikannya utuh
  // membuat penggeser ukuran di CMS tidak berpengaruh pada elemen itu tanpa ada
  // yang menjelaskan mengapa.
  if (!match) return scaleTerm(expression, scale);
  return `clamp(${scaleTerm(match[1], scale)}, ${scaleTerm(match[2], scale)}, ${scaleTerm(match[3], scale)})`;
}

/**
 * Mengalikan satu suku CSS.
 *
 * Suku sederhana (`14px`, `2.6vmin`) dihitung langsung supaya hasilnya tetap
 * berupa nilai yang mudah dibaca saat memeriksa layar di lokasi. Suku majemuk
 * seperti `max(1.9vmin, 0.9vw)` dibungkus `calc()`: menghitungnya sendiri berarti
 * menulis ulang parser CSS, sementara browser sudah bisa melakukannya.
 */
function scaleTerm(term: string, scale: number): string {
  const trimmed = term.trim();
  const simple = /^(-?\d*\.?\d+)(px|vmin|vmax|vh|vw|rem|em|%)$/.exec(trimmed);
  if (simple) {
    const value = Number.parseFloat(simple[1]) * scale;
    return `${Math.round(value * 1000) / 1000}${simple[2]}`;
  }
  return `calc((${trimmed}) * ${scale})`;
}

/**
 * Tinggi logo, sebagai rumus clamp yang ikut skala admin.
 *
 * Tinggi yang dipatok, bukan lebar: logo punya rasio yang sangat beragam (PRIMA
 * berbentuk lonjong lebar, logo lain nyaris persegi). Menyeragamkan LEBAR membuat
 * logo tinggi tampak raksasa dan logo lebar tampak kerdil. Tinggi seragam adalah
 * yang mendekati cara mata menilai "ukurannya sama".
 */
export function logoHeight(scale: number, variant: "led" | "compact"): string {
  const base = variant === "led" ? "clamp(28px, 6vmin, 120px)" : "clamp(22px, 4vmin, 56px)";
  return scaleClamp(base, scale);
}

/** Tinggi maksimum gambar footer. Lebarnya mengikuti rasio aslinya. */
export function footerImageHeight(scale: number, variant: "led" | "compact"): string {
  const base = variant === "led" ? "clamp(18px, 4.4vmin, 88px)" : "clamp(16px, 3vmin, 44px)";
  return scaleClamp(base, scale);
}
