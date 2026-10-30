import type { HasilCetakMeja } from "@/lib/badge/stasiun";
import type { LabelData } from "@/lib/label/layout";

/**
 * Bentuk data yang dipakai bersama layar pemindai dan bagian-bagiannya.
 *
 * Berkas terpisah supaya lembar hasil dan dialog walk-in tidak perlu mengimpor
 * dari `scan-client.tsx`: keduanya dipakai OLEH berkas itu, dan impor bolak-balik
 * antara induk dan anaknya adalah lingkaran yang baru terasa saat salah satunya
 * dipecah lagi.
 */

/** `jumlah_barang`: barang yang diperiksa di sesi ini (kaos, goodie bag). Nol = tanpa daftar centang. */
export type Sesi = {
  id: number;
  name: string;
  slug: string;
  hadir?: number | null;
  jumlah_barang?: number;
  /** Peserta boleh memindai QR checkpoint sesi ini sendiri (Show QR). Tidak ada: panitia saja. */
  self_scan?: "self" | "both";
  /** Check-in > Sessions > Record luggage: lembar hasil meminta jumlah dan foto bagasi. */
  bagasi?: true;
  /** Check-in > Sessions > Luggage: Pick-up: lembar hasil menampilkan titipan peserta untuk diserahkan. */
  ambil_bagasi?: true;
};

/** Satu baris daftar centang barang, dari `pickup_checklist`. */
export type BarisBarang = {
  item_id: number;
  name: string;
  size: string | null;
  has_size: boolean;
  picked_up_at: string | null;
  picked_up_size: string | null;
};

/**
 * Checkpoint peserta (Check-in > Checkpoints) yang selesai lewat pemindaian
 * atau penyerahan barang ini. Hanya ada bila fiturnya dinyalakan dan sesi atau
 * barangnya memang checkpoint. `terbuka_sebelum`: langkah sebelumnya yang belum
 * dikerjakan; petugas mengarahkan, tidak menolak.
 */
export type CatatanCheckpoint = {
  total: number;
  done: number;
  points: boolean;
  selesai: { posisi: number; judul: string; poin: number | null }[];
  terbuka_sebelum: { posisi: number; judul: string }[];
};

/**
 * Jalur registrasi, yaitu satu MEJA, bukan satu tahap acara.
 *
 * Lima meja berdampingan melayani sesi "Registrasi" yang sama. Jalur ikut
 * dikirim bersama setiap pemindaian supaya TV di atas meja ini menyapa tamu meja
 * ini saja, bukan seluruh lobi.
 */
export type Jalur = { id: number; name: string; slug: string };

/**
 * Empat status pertama datang dari server. Tiga terakhir dibuat di perangkat
 * ketika jawaban server tidak pernah sampai atau menolak:
 *
 * - `gagal`: jaringan putus, kehabisan waktu, atau server galat (5xx). Tamu ini
 *   BELUM tercatat; Ulangi mengirim kode yang sama.
 * - `login`: sesi petugas habis (401). Mengulang hanya berputar di tempat; yang
 *   menolong adalah masuk lagi.
 * - `ditolak`: server menjawab tetapi menolak (4xx lain, mis. sesi ditutup).
 *   Mengulang tidak akan mengubah jawabannya.
 */
export type StatusHasil = "recorded" | "duplicate" | "not_found" | "created" | "gagal" | "login" | "ditolak";

export type Hasil = {
  status: StatusHasil;
  participant?: { id: string; name: string; company: string | null; title: string | null; qr_code?: string };
  first_scan_at?: string | null;
  scan_count?: number;
  session_unique_total?: number;
  qr?: string;
  /** Kalimat dari server atau perangkat, untuk status `gagal`, `login`, `ditolak`. */
  pesan?: string;
  /**
   * Jawaban `duplicate` atas Ulangi yang ternyata sudah tersimpan pada percobaan
   * yang jawabannya hilang. Ditampilkan hijau, bukan oranye: tamu ini baru saja
   * datang, bukan masuk dua kali.
   */
  tersimpanSebelumnya?: boolean;
  /** Kursi tamu ini ("Row A · Seat 8"), satu per sesi. Tidak ada bila acaranya tanpa kursi. */
  kursi?: { sesi: string | null; tulisan: string }[];
  /** Badge kertas di stasiun cetak: pekerjaan yang diantrekan, atau yang terakhir untuk pemindaian ulang. */
  badge_cetak?: HasilCetakMeja;
  /**
   * Shown after scan (Check-in > Sessions): info pilihan panitia untuk sesi ini,
   * urut. Menggantikan baris Company · Title. `nilai` null = datanya belum ada.
   * Tidak ada = sesi belum diatur.
   */
  info?: { label: string; nilai: string | null }[];
  /** Checkpoint yang selesai di pemindaian ini (lihat CatatanCheckpoint). */
  checkpoint?: CatatanCheckpoint;
  /** Walk-in baru: email Sign-in link (Participant area > Email a sign-in link to walk-ins). */
  signin_link?: { state: "queued"; email: string } | { state: "skipped"; reason: string } | { state: "failed" };
  /**
   * Pencatatan dari Cari nama yang gagal sampai ke server: siapa yang dicoba,
   * untuk judul lembar merah dan untuk Ulangi. Pencarian tidak membawa kode QR.
   */
  dicoba?: { id: string; nama: string };
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
  scan_count: number;
};

/** Hasil Cari nama. Tanpa kode QR: kode adalah kunci masuk peserta, dicatat lewat id. */
export type BarisCari = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
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

/** Satu titipan di meja ambil (`/api/attendance/luggage/handover`). */
export type TitipanBagasi = {
  id: number;
  session_id: number;
  session_name: string;
  bag_count: number;
  photo_url: string | null;
  recorded_at: string;
  by: string | null;
  handed_over_at: string | null;
  handed_over_by: string | null;
  mine: boolean;
};

/** Catatan bagasi di layar pemindai (`/api/attendance/luggage`). `photo_url`: signed URL berumur pendek. */
export type CatatanBagasi = {
  session_id: number;
  bag_count: number;
  photo_url: string | null;
  recorded_at: string;
  updated_at: string;
  by?: string | null;
};
