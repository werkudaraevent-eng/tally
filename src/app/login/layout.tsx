import type { Metadata } from "next";

/**
 * Layout tipis, hanya untuk judul tab.
 *
 * Halaman masuknya sendiri komponen klien — ia memegang keadaan formulir — dan
 * `export const metadata` tidak boleh hidup di berkas `"use client"`. Layout
 * inilah tempatnya.
 *
 * Judulnya spesifik, bukan judul aplikasi. Panitia membuka layar ini dari tab
 * yang sudah berisi empat tab Tally lain; "Tally — Pusat operasional acara" di
 * kelimanya membuat tab yang benar hanya bisa ditemukan dengan menekan satu per
 * satu.
 */
export const metadata: Metadata = {
  title: "Masuk · Tally",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
