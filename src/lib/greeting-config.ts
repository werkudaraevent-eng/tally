import { BRANDING_COLUMNS, DEFAULT_BRANDING, type Branding } from "@/lib/branding";

/**
 * Bentuk dan nilai bawaan konfigurasi Layar sapa.
 *
 * Dipisah ke modul sendiri dengan alasan yang sama seperti `display-config.ts`:
 * halaman `/sapa` dirender di server supaya konfigurasi CMS sudah ikut di HTML
 * pertama, sedangkan komponen layarnya client component karena butuh timer.
 * Keduanya harus memakai definisi yang sama persis.
 *
 * Modul ini WAJIB bebas dari impor server-only — ia ikut terbawa ke bundel
 * browser lewat komponen layar.
 */

export type GreetingOrientation = "landscape" | "portrait";

export type GreetingConfig = {
  is_enabled: boolean;
  orientation: GreetingOrientation;
  headline: string;
  idle_message: string;
  /** Null berarti seluruh sesi acara ini ikut menyapa. */
  session_id: number | null;
  greet_duplicates: boolean;
  hold_seconds: number;
  show_company: boolean;
  show_recent: boolean;
  recent_limit: number;
  background_color: string;
  text_color: string;
  accent_color: string;
  background_image_url: string | null;
} & Branding;

/**
 * Dipakai HANYA bila baris `greeting_settings` belum ada atau gagal dibaca.
 *
 * Nilainya sama persis dengan `default` kolomnya di database. Jaring pengaman
 * yang berbeda dari nilai bawaan database berarti layar tampil satu rupa sebelum
 * admin menyimpan apa pun dan rupa lain sesudahnya, tanpa ada yang mengubah
 * setelan.
 */
export const DEFAULT_GREETING: GreetingConfig = {
  is_enabled: true,
  orientation: "landscape",
  headline: "Selamat datang",
  idle_message: "Silakan pindai QR Anda di meja registrasi",
  session_id: null,
  greet_duplicates: false,
  hold_seconds: 8,
  show_company: true,
  show_recent: true,
  recent_limit: 6,
  background_color: "#101613",
  text_color: "#f7f5ed",
  accent_color: "#2649d0",
  background_image_url: null,
  ...DEFAULT_BRANDING,
};

export const GREETING_COLUMNS =
  `is_enabled,orientation,headline,idle_message,session_id,greet_duplicates,hold_seconds,show_company,show_recent,recent_limit,background_color,text_color,accent_color,background_image_url,${BRANDING_COLUMNS}`;

/** Satu jalur registrasi — satu meja, bukan satu tahap acara. */
export type Lane = { id: number; name: string; slug: string };

/**
 * Kode pemasangan yang sedang dipajang layar yang belum punya jalur.
 *
 * Bentuknya mengikuti pola perangkat lunak digital signage: layar menampilkan
 * kode pendek, dan orang yang MELIHAT kode itu mengklaimnya dari perangkat yang
 * punya papan ketik. Enam digit dipilih supaya terbaca dari seberang meja —
 * angka tidak punya pasangan yang tertukar seperti O/0 dan I/1.
 */
export type Pairing = { code: string; expires_at: string };

/** Satu sapaan di layar. */
export type Greeting = {
  /** Id baris `attendance_scans`. Menaik, jadi bisa dipakai sebagai kursor. */
  id: number;
  /** Sudah melewati penyamaran privasi — aman ditampilkan apa adanya. */
  name: string;
  company: string | null;
  scanned_at: string;
};

/**
 * Nama untuk layar sapa, menghormati `participants.allow_name_display`.
 *
 * Peserta yang menolak namanya dipajang tetap DISAPA — mengabaikannya di layar
 * sambutan sama saja dengan mengumumkan bahwa ia menolak — tetapi disapa dengan
 * inisial. Bentuk inisialnya sama dengan yang dipakai denah kursi publik, supaya
 * satu orang tidak muncul sebagai "B. S." di satu layar dan "BS" di layar lain
 * di ruangan yang sama.
 */
export function greetingName(name: string, allowNameDisplay: boolean): string {
  if (allowNameDisplay) return name;
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}.`)
    .join(" ");
  return initials || "Tamu";
}
