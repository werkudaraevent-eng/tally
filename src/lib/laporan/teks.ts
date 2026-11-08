/**
 * Kata dan angka di deck. Deck mengikuti bahasa acara (seperti halaman publik
 * dan email), jadi tiap kalimat punya versi id dan en. Kalimat ditulis seperti
 * panitia bicara ke direksi: pendek, satu gagasan, tanpa titik dua di judul,
 * tanpa tanda pisah, dan "lebih sering", bukan "karena".
 */
import type { SlideIsi } from "./jenis.ts";

export type Bahasa = "id" | "en";

export const pilih = (bahasa: Bahasa, teks: { id: string; en: string }) => teks[bahasa];

/** 1.234 (id) atau 1,234 (en). */
export function angka(nilai: number, bahasa: Bahasa): string {
  return Math.round(nilai).toLocaleString(bahasa === "id" ? "id-ID" : "en-GB");
}

/** Persen bulat; "<1%" untuk nilai di atas nol yang dibulatkan ke nol. */
export function persen(bagian: number, total: number): number {
  return total > 0 ? Math.round((bagian / total) * 100) : 0;
}
export function teksPersen(bagian: number, total: number): string {
  if (total <= 0) return "0%";
  const nilai = persen(bagian, total);
  return nilai === 0 && bagian > 0 ? "<1%" : `${nilai}%`;
}

/** "x dari y" / "x of y". */
export const dari = (x: number, y: number, bahasa: Bahasa) => `${angka(x, bahasa)} ${bahasa === "id" ? "dari" : "of"} ${angka(y, bahasa)}`;

const BULAN = {
  id: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const HARI = {
  id: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

/** "2026-11-06" jadi "6 November 2026". */
export function tanggal(iso: string, bahasa: Bahasa): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return bahasa === "id" ? `${d} ${BULAN.id[m - 1]} ${y}` : `${d} ${BULAN.en[m - 1]} ${y}`;
}

/** "6 sampai 8 November 2026", atau satu tanggal. */
export function rentang(mulai: string | null, selesai: string | null, bahasa: Bahasa): string | null {
  if (!mulai) return null;
  if (!selesai || selesai === mulai) return tanggal(mulai, bahasa);
  const [y1, m1, d1] = mulai.split("-").map(Number);
  const [y2, m2] = selesai.split("-").map(Number);
  const kata = bahasa === "id" ? "sampai" : "to";
  if (y1 === y2 && m1 === m2) return `${d1} ${kata} ${tanggal(selesai, bahasa)}`;
  return `${tanggal(mulai, bahasa)} ${kata} ${tanggal(selesai, bahasa)}`;
}

/** Nama hari dari tanggal "YYYY-MM-DD". */
export function namaHari(iso: string, bahasa: Bahasa): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return HARI[bahasa][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Jam di zona acara dari ISO, "05.00" (id) atau "05:00" (en). */
export function jam(iso: string, offset: string, bahasa: Bahasa): string {
  const tanda = offset.startsWith("-") ? -1 : 1;
  const [oj, om] = offset.slice(1).split(":").map(Number);
  const lokal = new Date(Date.parse(iso) + tanda * (oj * 60 + om) * 60000);
  const hh = String(lokal.getUTCHours()).padStart(2, "0");
  const mm = String(lokal.getUTCMinutes()).padStart(2, "0");
  return bahasa === "id" ? `${hh}.${mm}` : `${hh}:${mm}`;
}

/** Tanggal "YYYY-MM-DD" di zona acara dari ISO. */
export function tanggalLokal(iso: string, offset: string): string {
  const tanda = offset.startsWith("-") ? -1 : 1;
  const [oj, om] = offset.slice(1).split(":").map(Number);
  return new Date(Date.parse(iso) + tanda * (oj * 60 + om) * 60000).toISOString().slice(0, 10);
}

/** Satu slide isi tanpa judul akhir dan catatan: disusun di susun.ts. */
export type SlideHitung = Omit<SlideIsi, "judul" | "catatan">;

/**
 * Hasil satu slide bawaan. `bobot` dipakai Ringkasan untuk memilih tiga
 * temuan terbesar; `temuan` adalah kalimatnya (null = bukan temuan).
 */
export type HasilSlide =
  | { ada: true; slide: SlideHitung; bobot: number; temuan: string | null }
  | { ada: false; nama: string; alasan: string };

/** Kelompok di bawah ini digabung ke "Lainnya" dan perbandingan disembunyikan. */
export const MIN_KELOMPOK = 10;
/** Di bawah ini perbandingan diberi tanda sampel kecil. */
export const SAMPEL_KECIL = 30;
