import type { EventStatus, UserRole } from "@/lib/domain";

/**
 * Rumah tiap peran di dalam satu acara.
 *
 * Dulu ada halaman `/workspace` di antara pemilih acara dan layar kerja, yang
 * meminta pengguna memilih lagi "Admin atau Booth" — padahal jawabannya sudah
 * ditentukan perannya. Kasir dan petugas pemindai bahkan tidak punya kartu di
 * sana dan mendarat di halaman kosong. Peta ini menggantikannya: satu peran,
 * satu tujuan, tanpa pertanyaan.
 *
 * Admin yang ingin membantu booth atau kasir membuka layar itu dari pintasan
 * "Layar lapangan" di dashboard.
 */
export function roleHome(role: UserRole, slug: string): string {
  const dasar = `/e/${slug}`;
  switch (role) {
    case "booth":
      return `${dasar}/booth`;
    case "cashier":
      return `${dasar}/cashier`;
    case "scanner":
      return `${dasar}/scan`;
    default:
      return `${dasar}/admin`;
  }
}

/** Peran yang layarnya hanya berguna saat acara sedang aktif. */
export const FIELD_ROLES: readonly UserRole[] = ["booth", "cashier", "scanner"];

/**
 * Alasan tombol Buka nonaktif, atau null bila boleh dibuka.
 *
 * Layar booth, kasir, dan pemindai hanya mencatat sesuatu yang server tolak
 * pada acara draft maupun selesai. Mengantar operator ke sana berarti mengantar
 * ke penolakan; lebih jujur menuliskan alasannya di daftar acara. Admin selalu
 * boleh masuk: draft butuh disiapkan, dan acara selesai butuh dibaca laporannya.
 */
export function alasanTidakBisaBuka(role: UserRole, status: EventStatus): string | null {
  if (!FIELD_ROLES.includes(role) || status === "active") return null;
  return status === "draft" ? "Belum aktif" : "Sudah selesai";
}
