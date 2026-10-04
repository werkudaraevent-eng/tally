/**
 * Templat impor tamu undangan. Baris contohnya dipakai juga oleh rute impor:
 * berkas yang diunggah tanpa menimpa contoh tidak menambahkan "Budi Santoso"
 * ke daftar tamu acara sungguhan.
 */

export const KOLOM_TEMPLAT = ["Nama", "Email", "Instansi", "Jabatan", "No. HP"];

export const CONTOH_TEMPLAT = [
  ["Budi Santoso", "budi.santoso@example.com", "PT Maju Bersama", "Direktur Keuangan", "081234567890"],
  ["Siti Rahayu", "", "Kementerian Keuangan", "Analis", ""],
];

/** Baris contoh templat yang belum ditimpa: nama dan email sama persis. */
export function isContohTemplat(name: string, email: string | null | undefined) {
  const n = name.trim().toLowerCase();
  const e = (email ?? "").trim().toLowerCase();
  return CONTOH_TEMPLAT.some(([nama, surel]) => nama.toLowerCase() === n && surel.toLowerCase() === e);
}
