/**
 * Highlight harian: carousel 9:16 (1080×1920) untuk klien, satu per hari
 * acara. Satu halaman, satu pesan. Isinya sudah jadi (teks dan angka siap
 * tampil), tanpa nama peserta, supaya salinan yang dikunci bisa disimpan
 * apa adanya dan digambar ulang sama persis.
 */
import type { TemaDeck } from "../jenis.ts";

export const KUNCI_HALAMAN = ["sampul", "hadir", "jam", "menit", "agenda", "rekap", "penutup"] as const;
export type KunciHalaman = (typeof KUNCI_HALAMAN)[number];

/** Permukaan halaman. "muda" = warna terang pasangan aksen; "putih" = foto di atas, putih di bawah. */
export type Permukaan = "foto" | "gelap" | "aksen" | "kertas" | "muda" | "putih";

type Dasar<K extends KunciHalaman> = { kunci: K; permukaan: Permukaan; foto: string | null };

export type HalamanHarian =
  | (Dasar<"sampul"> & { kecil: string; judul: string })
  | (Dasar<"hadir"> & { judul: string; isi: number; teks: string })
  | (Dasar<"jam"> & { judul: string; batang: Array<{ label: string; nilai: number; puncak: boolean }>; teks: string })
  | (Dasar<"menit"> & { besar: string; judul: string; teks: string })
  | (Dasar<"agenda"> & { judul: string; baris: Array<{ jam: string; nama: string; persen: number | null; teks: string }> })
  | (Dasar<"rekap"> & { judul: string; hari: Array<{ label: string; persen: number }>; teks: string })
  | (Dasar<"penutup"> & { judul: string; teks: string | null; ttd: string });

export type HariHighlight = {
  /** "YYYY-MM-DD" di zona acara. */
  tanggal: string;
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
};

/** Halaman yang tidak muncul karena datanya tidak ada, dengan alasan untuk panitia. */
export type HalamanAbsen = { kunci: KunciHalaman; alasan: string };
