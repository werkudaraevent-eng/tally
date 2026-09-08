import type { LabelData } from "@/lib/label/layout";

/**
 * Bentuk data yang dipakai bersama layar pemindai dan bagian-bagiannya.
 *
 * Berkas terpisah supaya lembar hasil dan dialog walk-in tidak perlu mengimpor
 * dari `scan-client.tsx`: keduanya dipakai OLEH berkas itu, dan impor bolak-balik
 * antara induk dan anaknya adalah lingkaran yang baru terasa saat salah satunya
 * dipecah lagi.
 */

export type Sesi = { id: number; name: string; slug: string; hadir?: number };

/**
 * Jalur registrasi, yaitu satu MEJA, bukan satu tahap acara.
 *
 * Lima meja berdampingan melayani sesi "Registrasi" yang sama. Jalur ikut
 * dikirim bersama setiap pemindaian supaya TV di atas meja ini menyapa tamu meja
 * ini saja, bukan seluruh lobi.
 */
export type Jalur = { id: number; name: string; slug: string };

export type StatusHasil = "recorded" | "duplicate" | "not_found" | "created";

export type Hasil = {
  status: StatusHasil;
  participant?: { id: string; name: string; company: string | null; title: string | null; qr_code: string };
  first_scan_at?: string | null;
  scan_count?: number;
  session_unique_total?: number;
  qr?: string;
};

/**
 * Peserta bernama sama yang sudah ada, dikembalikan server ketika petugas
 * menyimpan tamu walk-in.
 *
 * Server MENOLAK MENULIS ketika ini terisi. Yang memutuskan apakah dua nama yang
 * sama adalah dua orang yang sama bukan aturan, melainkan petugas yang sedang
 * memandang orangnya.
 */
export type Kandidat = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  qr_code: string;
  scan_count: number;
};

export type BarisCari = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  qr_code: string;
  scan_count: number;
  first_scan_at: string | null;
};

/** Isi dialog tamu walk-in. Kolom bawaan; jawaban formulir terpisah di `extra`. */
export type FormWalkIn = {
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  extra: Record<string, string>;
};

export const FORM_KOSONG: FormWalkIn = { name: "", company: "", title: "", phone: "", email: "", extra: {} };

/**
 * Kapan label dicetak tanpa diminta.
 *
 * Tiga nilai, bukan sakelar dua posisi. Sebagian acara mencetak badge untuk
 * SETIAP tamu yang check-in; sebagian lain sudah mengirim badge lewat pos dan
 * hanya perlu mencetak untuk yang datang tanpa terdaftar. Sakelar dua posisi
 * memaksa keduanya memilih perilaku yang salah untuk salah satunya.
 */
export type ModeCetak = "off" | "walkin" | "semua";

export type StatusCetak = { fase: "diam" | "jalan" | "selesai" | "galat"; teks?: string };

/** Data peserta yang cukup untuk dicetak. Alias, supaya pemanggil tidak perlu tahu asalnya. */
export type DataLabel = LabelData;
