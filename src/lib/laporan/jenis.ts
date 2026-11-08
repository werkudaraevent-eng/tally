/**
 * Event report: bentuk satu deck laporan akhir acara.
 *
 * Satu slide disusun dari beberapa bentuk saja (angka, tabel, batang, garis,
 * teks, peta panas, chip). Halaman admin, tab Laporan klien dan cetak PDF
 * menggambar bentuk yang sama, jadi tidak ada tata letak per slide yang
 * ditulis dua kali. Isinya sudah jadi (teks dan angka siap tampil), tanpa nama
 * peserta: deck yang dikunci untuk klien disimpan apa adanya.
 */

/** Penanda baris atau batang: utama = data yang dibahas, masalah = merah, kedua = biru muda. */
export type Sorot = "utama" | "kedua" | "masalah" | null;

export type BlokAngka = {
  jenis: "angka";
  isi: Array<{ label: string; nilai: string; ket: string; masalah?: boolean }>;
  /** Bertumpuk ke bawah (kolom samping), bukan berjajar. */
  tumpuk?: boolean;
  /** Angka pertama raksasa di kiri, sisanya daftar di kanan (Ringkasan). */
  raksasa?: boolean;
};

export type BlokTabel = {
  jenis: "tabel";
  kolom: Array<{ label: string; kanan?: boolean }>;
  /** `batang` 0..100 digambar setelah kolom `batangSetelah` (indeks). */
  baris: Array<{ sel: string[]; batang?: number; sorot?: Sorot; total?: boolean }>;
  batangSetelah?: number;
  /** Sel teks membungkus (paling banyak 3 baris), untuk tabel yang ditulis panitia. */
  bungkus?: boolean;
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
  /** Tinggi grafik tegak: besar 360 px (bawaan), sedang 236, kecil 130. */
  tinggi?: "sedang" | "kecil";
};

export type BlokGaris = {
  jenis: "garis";
  titik: Array<{ label: string; sub?: string; nilai: number; teks: string; masalah?: boolean }>;
  min: number;
  maks: number;
  /** Label sumbu, mis. "%". */
  satuan: string;
};

export type BlokTeks = { jenis: "teks"; paragraf: string[]; kecil?: string[]; poin?: string[]; /** Poin sebagai kartu bernomor berjajar. */ kartu?: boolean };

/** Peta panas: baris = titik check-in, kolom = jam, isi = orang yang pertama kali di-scan di jam itu. */
export type BlokPanas = {
  jenis: "panas";
  kolom: string[];
  baris: Array<{ label: string; sub: string; nilai: number[]; total: string; ket: string }>;
  maks: number;
  /** Angka ditulis di sel bila >= ambang. */
  ambang: number;
  labelTotal: string;
  keterangan: string;
};

/** Deretan chip di slide pembatas: nama titik dan angkanya. */
export type BlokChip = { jenis: "chip"; isi: Array<{ label: string; nilai: string }> };

export type Blok = BlokAngka | BlokTabel | BlokBatang | BlokGaris | BlokTeks | BlokPanas | BlokChip;

/** Permukaan slide dari tema acara: gelap = warna merek, aksen = warna aksen, kertas = terang. */
export type Latar = "gelap" | "aksen" | "kertas";

/** Warna tema acara (lib/kilas-balik/warna.ts), huruf judul dan foto hero. */
export type TemaDeck = {
  latar: string;
  latar2: string;
  latarTeks: string;
  aksen: string;
  aksenTeks: string;
  kertas: string;
  tinta: string;
  /** Nilai CSS huruf judul, mis. "var(--font-jakarta)". */
  judul: string;
  foto: string | null;
};

export type SlideSampul = {
  kunci: "sampul";
  jenis: "sampul";
  judul: string;
  baris: string[];
  /** Label miring di atas judul, mis. "Laporan panitia". */
  stiker?: string;
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
  /** penuh = blok berurutan ke bawah; dua = blok pertama kiri, sisanya kanan; pembatas = pembuka bagian berfoto. */
  tata: "penuh" | "dua" | "pembatas";
  /** Diisi susun.ts; deck lama tanpa ini digambar di kertas. */
  latar?: Latar;
  /** Satu label miring di bawah judul, untuk angka kunci slide ini. */
  stiker?: { teks: string; merah?: boolean };
  blok: Blok[];
  /** Catatan panitia, tampil di bawah temuan. */
  catatan: string | null;
  kaki: string;
};

export type Slide = SlideSampul | SlideIsi;

export type Deck = {
  bahasa: "id" | "en";
  /** Tema acara saat deck disusun. */
  tema?: TemaDeck;
  /** Deck lama (sebelum tema): satu warna aksen hex. */
  warna?: string;
  nama: string;
  slide: Slide[];
  dibuat: string;
};

/** Slide bawaan yang tidak bisa dibuat karena modulnya tidak dipakai, dengan alasan untuk panitia. */
export type SlideAbsen = { kunci: string; nama: string; alasan: string };
