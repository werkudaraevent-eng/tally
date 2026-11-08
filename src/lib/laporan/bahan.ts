/**
 * Bahan mentah satu laporan, dibaca sekali oleh bahan-server.ts lalu dihitung
 * oleh fungsi murni di slide/*.ts. Bahan tidak berisi nama atau kontak siapa
 * pun: cukup id peserta, nilai kelompoknya, dan waktu.
 */
import type { Pertanyaan } from "../kilas-balik/setelan.ts";
import type { TemaDeck } from "./jenis.ts";

export type SesiBahan = {
  /** Kunci baris Dashboard ("cp-12", "cp-12-20261107", "sesi-4"): kunci slide titik. */
  kunci: string;
  /** Nama dari Check-in (nama sesi atau checkpoint). */
  nama: string;
  /** Tanggal dan jam baris Agenda yang ditautkan, bila ada (zona acara). */
  tanggal: string | null;
  jam: string | null;
  diharapkan: number;
  sudah: number;
  /** Pindaian pertama tiap orang di sesi ini, ISO. */
  datang: string[];
  /** Id peserta yang dipindai (untuk hadir unik per hari di Highlight harian). */
  orang?: string[];
};

export type PengumumanBahan = { judul: string; terbit: string; total: number; dilihat: number; emailTerkirim: number; emailKlik: number };

export type PilihanDaftar = { kunci: string; label: string; opsi: string[] };

export type BahanLaporan = {
  acara: {
    nama: string;
    tempat: string | null;
    mulai: string | null;
    selesai: string | null;
    bahasa: "id" | "en";
    /** "+07:00". */
    offset: string;
    /** "WIB", "WITA", "WIT" atau kosong. */
    zona: string;
    /** Warna, huruf judul dan foto dari tema halaman acara. */
    tema: TemaDeck;
    logo: string | null;
  };
  sekarang: string;
  /** Undangan aktif (tidak dihapus); null bila acara tidak memakai undangan. */
  diundang: number | null;
  /** Pendaftaran masuk dan disetujui; null bila acara tanpa formulir pendaftaran. */
  mendaftar: number | null;
  disetujui: number | null;
  /** Peserta aktif dan nilai kolom kelompoknya (null = kosong atau tanpa kelompok). */
  peserta: Array<{ id: string; kelompok: string | null; jawaban: Record<string, string | null> }>;
  /** Label kolom kelompok, null bila tanpa kelompok. */
  kelompokLabel: string | null;
  /** Pertanyaan pilihan di formulir pendaftaran (untuk kelompok dan grafik dari pertanyaan). */
  pilihanDaftar: PilihanDaftar[];
  /** Yang pernah masuk area peserta; null bila acara tanpa area peserta. */
  portal: Set<string> | null;
  /** Peserta aktif yang pernah dipindai di sesi mana pun. */
  hadir: Set<string>;
  /** Jumlah sesi berbeda yang dihadiri per peserta. */
  sesiDiikuti: Map<string, number>;
  /** Sesi Check-in yang punya baris Agenda, urut waktu. */
  sesi: SesiBahan[];
  /** Semua sesi Check-in (untuk grafik kedatangan), termasuk tanpa Agenda. */
  semuaSesi: SesiBahan[];
  feedback: { pertanyaan: Pertanyaan[]; jawaban: Array<{ participant_id: string; answers: Record<string, unknown> }> } | null;
  pengumuman: PengumumanBahan[] | null;
  undian: { slot: number; pemenang: Array<{ participant_id: string | null; dikonfirmasi: boolean }> } | null;
  voting: { pertanyaan: number; pemilih: number } | null;
  logistik: { hotel: number; kamar: number; kendaraan: number; trip: number; tas: number; tasKembali: number | null } | null;
};
