import type { RegistrationField, RegistrationFormConfig } from "./domain";
import { validateAnswers } from "./registration-fields";

/**
 * Form tamu walk-in mengikuti form registrasi utama acara.
 *
 * Satu aturan, dipakai di dua tempat: layar pemindai (tanda wajib dan pesan di
 * bawah kolom) dan /api/attendance/walkin (penegakannya). Ditulis dua kali,
 * layar bisa menerima yang ditolak server atau sebaliknya, dan petugas di depan
 * antrean membaca galat yang tidak menunjuk kolom mana pun.
 *
 * Bawaannya sama persis dengan formulir publik (src/app/daftar/isi-daftar.tsx):
 * email dan telepon wajib kecuali dimatikan, instansi dan jabatan opsional
 * kecuali dinyalakan. Satu pengecualian: area peserta tidak membuat email wajib
 * di sini. Di formulir publik email wajib karena menjadi nama pengguna akun,
 * dan walk-in tidak membuat akun.
 */
export type AturanWalkIn = { email: boolean; phone: boolean; company: boolean; title: boolean };

export function aturanWalkIn(config: RegistrationFormConfig | null | undefined): AturanWalkIn {
  return {
    email: config?.require_email !== false,
    phone: config?.require_phone !== false,
    company: config?.require_company ?? false,
    title: config?.require_job_title ?? false,
  };
}

export type IsianWalkIn = {
  name: string;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  extra?: Record<string, string>;
};

// Sama dengan /api/registrasi: alamat dengan domain tingkat atas, dan nomor
// yang hanya berisi angka dan tanda baca telepon.
const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^.@\s]+$/;
const POLA_TELEPON = /^[0-9+()\-\s]+$/;

/**
 * Galat per kolom. Kunci `extra.<key>` untuk pertanyaan tambahan, sama dengan
 * bentuk galat /api/registrasi, supaya layar bisa menaruh pesannya di bawah
 * kolom yang benar. Kosong berarti boleh disimpan.
 */
export function periksaWalkIn(isian: IsianWalkIn, aturan: AturanWalkIn, fields: RegistrationField[]): Record<string, string> {
  const galat: Record<string, string> = {};
  const isi = (nilai: string | null | undefined) => (nilai ?? "").trim();

  if (!isi(isian.name)) galat.name = "Nama wajib diisi.";

  const email = isi(isian.email);
  if (!email) {
    if (aturan.email) galat.email = "Email wajib diisi.";
  } else if (!POLA_EMAIL.test(email)) {
    galat.email = "Format email belum benar.";
  }

  const telepon = isi(isian.phone);
  if (!telepon) {
    if (aturan.phone) galat.phone = "No. HP wajib diisi.";
  } else if (telepon.length < 6 || !POLA_TELEPON.test(telepon)) {
    galat.phone = "No. HP hanya berisi angka, minimal 6 digit.";
  }

  if (aturan.company && !isi(isian.company)) galat.company = "Instansi wajib diisi.";
  if (aturan.title && !isi(isian.title)) galat.title = "Jabatan wajib diisi.";

  for (const issue of validateAnswers(fields, isian.extra ?? {}).issues) {
    galat[`extra.${issue.key}`] = issue.message;
  }
  return galat;
}
