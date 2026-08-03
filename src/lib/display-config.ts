// Bentuk dan nilai bawaan konfigurasi Live Display.
//
// Sengaja dipisah ke modul sendiri, bukan dibiarkan di dalam komponen layar:
// halaman `/display` kini dirender di server supaya konfigurasi CMS sudah ikut di
// HTML pertama, sedangkan komponen layarnya tetap client component karena butuh
// timer refresh dan animasi. Keduanya harus memakai definisi yang sama persis.
//
// Modul ini WAJIB bebas dari impor server-only (mis. service client Supabase),
// karena ikut terbawa ke bundel browser lewat komponen layar.

import { BRANDING_COLUMNS, DEFAULT_BRANDING, type Branding } from "@/lib/branding";

export type DisplayConfig = {
  event_title: string;
  headline: string;
  tagline: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  background_image_url: string | null;
  leaderboard_limit: number;
  show_company: boolean;
  show_booth_progress: boolean;
  show_ticker: boolean;
  ticker_text: string | null;
  refresh_seconds: number;
} & Branding;

/**
 * Dipakai HANYA sebagai jaring pengaman bila baris `display_settings` tidak dapat
 * dibaca. Dalam keadaan normal layar memakai konfigurasi dari database, jadi nilai
 * di sini tidak boleh dianggap sebagai tampilan yang akan dilihat penonton.
 */
export const DEFAULT_CONFIG: DisplayConfig = {
  event_title: "Tally Event Transaction Hub",
  headline: "Top spender live",
  tagline: "The room's leaders.",
  background_color: "#101613",
  text_color: "#f7f5ed",
  accent_color: "#a66616",
  background_image_url: null,
  leaderboard_limit: 10,
  show_company: true,
  show_booth_progress: true,
  show_ticker: true,
  ticker_text: null,
  refresh_seconds: 30,
  // Branding kosong dan skala 1: tanpa diisi admin, layar tampil persis seperti
  // sebelum header/footer CMS ada.
  ...DEFAULT_BRANDING,
};

/** Kolom yang dibaca dari `display_settings`. Sama dengan endpoint GET-nya. */
export const DISPLAY_CONFIG_COLUMNS =
  `event_title,headline,tagline,background_color,text_color,accent_color,background_image_url,leaderboard_limit,show_company,show_booth_progress,show_ticker,ticker_text,refresh_seconds,${BRANDING_COLUMNS}`;
