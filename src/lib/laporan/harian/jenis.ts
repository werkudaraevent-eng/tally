/**
 * Highlight harian: carousel 9:16 (1080×1920) untuk klien, satu per hari
 * acara. Satu halaman, satu pesan. Isinya sudah jadi (teks dan angka siap
 * tampil), tanpa nama peserta, supaya salinan yang dikunci bisa disimpan
 * apa adanya dan digambar ulang sama persis.
 */
import type { TemaDeck } from "../jenis.ts";

export const KUNCI_HALAMAN = ["sampul", "hadir", "jam", "menit", "agenda", "rekap", "puas", "layar", "penutup"] as const;
export type KunciHalaman = (typeof KUNCI_HALAMAN)[number];

/** Kunci "hari" untuk story Seluruh acara, di samping tanggal "YYYY-MM-DD". */
export const RINGKASAN = "semua";

/** Permukaan halaman. "muda" = warna terang pasangan aksen; "putih" = foto di atas, putih di bawah. */
export type Permukaan = "foto" | "gelap" | "aksen" | "kertas" | "muda" | "putih";

type Dasar<K extends KunciHalaman> = { kunci: K; permukaan: Permukaan; foto: string | null };

export type HalamanHarian =
  | (Dasar<"sampul"> & { kecil: string; judul: string })
  | (Dasar<"hadir"> & { judul: string; isi: number; teks: string })
  | (Dasar<"jam"> & { judul: string; batang: Array<{ label: string; nilai: number; puncak: boolean }>; teks: string })
  | (Dasar<"menit"> & { besar: string; judul: string; teks: string })
  /** `ket`: jumlah di balik persen, mis. "1.002 dari 1.251" (salinan lama tanpa ket). */
  | (Dasar<"agenda"> & { judul: string; baris: Array<{ jam: string; nama: string; persen: number | null; teks: string; ket?: string }> })
  | (Dasar<"rekap"> & { judul: string; hari: Array<{ label: string; persen: number; ket?: string }>; teks: string })
  | (Dasar<"puas"> & { besar: string; judul: string; segmen: Array<{ label: string; persen: number; ket: string }>; teks: string })
  | (Dasar<"layar"> & { judul: string; baris: Array<{ besar: string; teks: string }> })
  | (Dasar<"penutup"> & { judul: string; teks: string | null; ttd: string });

export type HariHighlight = {
  /** "YYYY-MM-DD" di zona acara, atau RINGKASAN untuk Seluruh acara. */
  tanggal: string;
  /** 0 untuk Seluruh acara. */
  hariKe: number;
  totalHari: number;
  nama: string;
  bahasa: "id" | "en";
  tema: TemaDeck;
  /** Nama huruf judul dan isi halaman acara, untuk gambar PNG. */
  huruf: { judul: string; isi: string };
  halaman: HalamanHarian[];
  /** Saat angka dihitung, ISO. */
  dibuat: string;
  /** Seluruh acara: label tanggal pendek ("6 sampai 8 Nov"), untuk sampul di pemutar. */
  rentang?: string;
};

/** Halaman yang tidak muncul karena datanya tidak ada, dengan alasan untuk panitia. */
export type HalamanAbsen = { kunci: KunciHalaman; alasan: string };
