/**
 * Templat impor tamu undangan. Baris contohnya dipakai juga oleh rute impor:
 * berkas yang diunggah tanpa menimpa contoh tidak menambahkan "Budi Santoso"
 * ke daftar tamu acara sungguhan.
 */

import { normalizePhone } from "@/lib/pesan/alamat";

export const KOLOM_TEMPLAT = ["Nama", "Email", "Instansi", "Jabatan", "No. HP"];

export const CONTOH_TEMPLAT = [
  ["Budi Santoso", "budi.santoso@example.com", "PT Maju Bersama", "Direktur Keuangan", "081234567890"],
  ["Siti Rahayu", "", "Kementerian Keuangan", "Analis", ""],
];

/**
 * Baris contoh templat yang belum ditimpa: kelima sel sama persis. Membandingkan
 * nama dan email saja menolak tamu sungguhan bernama "Siti Rahayu" tanpa email.
 * No. HP dibandingkan setelah dinormalkan, karena Excel bisa membuang angka 0
 * di depan.
 */
export function isContohTemplat(baris: { name: string; email?: string | null; company?: string | null; title?: string | null; phone?: string | null }) {
  const sama = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.toLowerCase();
  const hp = normalizePhone(baris.phone);
  return CONTOH_TEMPLAT.some(
    ([nama, surel, instansi, jabatan, telp]) =>
      sama(baris.name, nama) && sama(baris.email, surel) && sama(baris.company, instansi) && sama(baris.title, jabatan) && hp === normalizePhone(telp),
  );
}
