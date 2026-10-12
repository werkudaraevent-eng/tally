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

  if (!isi(isian.name)) galat.name = "Full name is required.";

  const email = isi(isian.email);
  if (!email) {
    if (aturan.email) galat.email = "Email is required.";
  } else if (!POLA_EMAIL.test(email)) {
    galat.email = "Enter a valid email address.";
  }

  const telepon = isi(isian.phone);
  if (!telepon) {
    if (aturan.phone) galat.phone = "Phone number is required.";
  } else if (telepon.length < 6 || !POLA_TELEPON.test(telepon)) {
    galat.phone = "Phone number can only contain digits, at least 6.";
  }

  if (aturan.company && !isi(isian.company)) galat.company = "Organisation is required.";
  if (aturan.title && !isi(isian.title)) galat.title = "Job title is required.";

  const jawaban = isian.extra ?? {};
  for (const issue of validateAnswers(fields, jawaban).issues) {
    const field = fields.find((f) => f.key === issue.key);
    galat[`extra.${issue.key}`] = field ? pesanTambahan(field, isi(jawaban[field.key]), issue.message) : issue.message;
  }
  return galat;
}

/**
 * Pesan berbahasa Inggris untuk pertanyaan tambahan.
 *
 * validateAnswers dipakai juga oleh formulir pendaftaran publik, jadi pesannya
 * tetap berbahasa acara di sana. Layar pemindai (staf) memakai bahasa Inggris:
 * jenis masalahnya dibaca dari jawaban yang kosong atau dari pesan aslinya.
 */
function pesanTambahan(field: RegistrationField, nilai: string, asli: string): string {
  const label = field.label;
  if (!nilai) return field.type === "checkbox" ? `Tick ${label}.` : `${label} is required.`;
  const sisa = asli.startsWith(label) ? asli.slice(label.length) : asli;
  if (sisa.includes("terlalu panjang")) return `${label} is too long.`;
  if (sisa.includes("pilihan")) return `${label} has an option that is not available.`;
  if (sisa.includes("berupa angka")) return `${label} must be a number.`;
  if (sisa.includes("minimal") && field.min !== undefined) return `${label} must be at least ${field.min}.`;
  if (sisa.includes("maksimal") && field.max !== undefined) return `${label} must be at most ${field.max}.`;
  if (sisa.includes("tanggal")) return `${label} is not a valid date.`;
  if (sisa.includes("alamat email")) return `${label} is not a valid email address.`;
  if (sisa.includes("nomor telepon")) return `${label} is not a valid phone number.`;
  if (sisa.includes("diunggah")) return `${label} did not upload. Upload it again.`;
  return `${label} is not valid.`;
}
