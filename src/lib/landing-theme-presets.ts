import type { LandingHeadingFont } from "./domain";
import type { RegistrationThemeTone } from "./registration-theme";

/**
 * Preset tema halaman acara: titik awal, bukan kotak tertutup.
 *
 * Memilih preset mengisi warna merek, nada latar, dan huruf judul sekaligus;
 * ketiganya tetap bisa diubah satu per satu sesudahnya. Preset tidak disimpan
 * sebagai pilihan tersendiri. Menyimpan "preset: elegan" berarti acara ikut
 * berubah bila daftar ini disunting, dan acara yang sedang berjalan tidak boleh
 * berganti rupa karena sebuah pembaruan.
 *
 * Warna merek sengaja tidak terlalu gelap. Skema Material memakai nada tengah
 * hue warna itu untuk tombol, jadi navy #1B2A4A keluar sebagai tombol #4F5E81
 * yang pucat dan hitam keluar sebagai abu-abu. Nilai di bawah sudah diperiksa
 * hasil turunannya.
 */
export type LandingThemePreset = {
  key: string;
  label: string;
  note: string;
  seed: string;
  tone: RegistrationThemeTone;
  heading_font: LandingHeadingFont;
};

export const LANDING_THEME_PRESETS: LandingThemePreset[] = [
  { key: "korporat", label: "Korporat", note: "Biru bersih, huruf netral", seed: "#1F4FD1", tone: "neutral", heading_font: "sans" },
  { key: "resmi", label: "Resmi", note: "Navy dan huruf klasik untuk undangan", seed: "#1E3A8A", tone: "neutral", heading_font: "serif" },
  { key: "elegan", label: "Elegan", note: "Emas hangat untuk gala dan penghargaan", seed: "#8A6A1F", tone: "soft", heading_font: "serif" },
  { key: "segar", label: "Segar", note: "Hijau untuk acara komunitas dan keberlanjutan", seed: "#1E7A4C", tone: "soft", heading_font: "geometric" },
  { key: "energik", label: "Energik", note: "Jingga pekat dan judul rapat", seed: "#D9480F", tone: "vibrant", heading_font: "condensed" },
  { key: "teknologi", label: "Teknologi", note: "Ungu dan huruf teknis", seed: "#5B3FD9", tone: "vibrant", heading_font: "grotesk" },
];
