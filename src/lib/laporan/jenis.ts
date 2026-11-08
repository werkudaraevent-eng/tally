/**
 * Event report: bentuk satu deck laporan akhir acara.
 *
 * Satu slide disusun dari lima bentuk saja (angka, tabel, batang, garis,
 * teks). Halaman admin, tab Laporan klien, cetak PDF dan ekspor PPTX semuanya
 * menggambar lima bentuk ini, jadi tidak ada tata letak per slide yang ditulis
 * dua kali. Isinya sudah jadi (teks dan angka siap tampil), tanpa nama
 * peserta: deck yang dikunci untuk klien disimpan apa adanya.
 */

/** Penanda baris atau batang: utama = data yang dibahas, masalah = merah, kedua = biru muda. */
export type Sorot = "utama" | "kedua" | "masalah" | null;

export type BlokAngka = { jenis: "angka"; isi: Array<{ label: string; nilai: string; ket: string; masalah?: boolean }> };

export type BlokTabel = {
  jenis: "tabel";
  kolom: Array<{ label: string; kanan?: boolean }>;
  /** `batang` 0..100 digambar setelah kolom `batangSetelah` (indeks). */
  baris: Array<{ sel: string[]; batang?: number; sorot?: Sorot; total?: boolean }>;
  batangSetelah?: number;
};

export type BlokBatang = {
  jenis: "batang";
  arah: "tegak" | "datar";
  /** Judul kecil di atas grafik. */
  judul?: string;
  seri: Array<{ label: string; sub?: string; nilai: number; teks: string; sorot?: Sorot }>;
  /** Batang kedua per baris (perbandingan porsi), hanya untuk arah datar. */
  pasangan?: Array<{ nilai: number; teks: string }>;
  legenda?: [string, string];
  /** Garis tegak penanda, sesudah batang ke-n (mis. jam berangkat). */
  penanda?: { setelah: number; label: string };
  maks?: number;
};

export type BlokGaris = {
  jenis: "garis";
  titik: Array<{ label: string; sub?: string; nilai: number; teks: string; masalah?: boolean }>;
  min: number;
  maks: number;
  /** Label sumbu, mis. "%". */
  satuan: string;
};

export type BlokTeks = { jenis: "teks"; paragraf: string[]; kecil?: string[]; poin?: string[] };

export type Blok = BlokAngka | BlokTabel | BlokBatang | BlokGaris | BlokTeks;

export type SlideSampul = {
  kunci: "sampul";
  jenis: "sampul";
  judul: string;
  baris: string[];
  /** "Data per 8 November 2026 pukul 20.15 WIB". */
  kaki: string;
  logo: string | null;
};

export type SlideIsi = {
  kunci: string;
  jenis: "isi";
  /** Judul yang tampil: editan panitia, atau saran. */
  judul: string;
  /** Judul yang dihitung dari angka. */
  saran: string;
  /** penuh = blok berurutan ke bawah; dua = blok pertama kiri, sisanya kanan. */
  tata: "penuh" | "dua";
  blok: Blok[];
  /** Catatan panitia, tampil di bawah temuan. */
  catatan: string | null;
  kaki: string;
};

export type Slide = SlideSampul | SlideIsi;

export type Deck = {
  bahasa: "id" | "en";
  /** Warna aksen dari tema acara (hex). */
  warna: string;
  nama: string;
  slide: Slide[];
  dibuat: string;
};

/** Slide bawaan yang tidak bisa dibuat karena modulnya tidak dipakai, dengan alasan untuk panitia. */
export type SlideAbsen = { kunci: string; nama: string; alasan: string };
