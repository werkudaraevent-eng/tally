/**
 * Templat bawaan dan kolom isian Pesan peserta. Berkas ini tidak mengimpor apa
 * pun dari server, supaya penyusun di peramban memakai teks yang sama dengan
 * yang dibuat API.
 */

export type BlastKind = "undangan" | "info";

export const FIELDS = [
  { key: "nama", label: "Nama" },
  { key: "perusahaan", label: "Perusahaan" },
  { key: "acara", label: "Nama acara" },
  { key: "tanggal", label: "Tanggal acara" },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];

export const DEFAULT_CONTENT: Record<BlastKind, { title: string; subject: string; body: string }> = {
  undangan: {
    title: "Undangan masuk",
    subject: "Undangan: {acara}",
    body: [
      "Halo {nama},",
      "",
      "Anda terdaftar sebagai peserta {acara}, {tanggal}. Tiket dan info acara Anda ada di Dashboard saya.",
      "",
      "Tekan tombol di bawah untuk membuat kata sandi dan masuk. Tautan ini hanya untuk Anda dan berlaku 7 hari.",
    ].join("\n"),
  },
  info: {
    title: "Kabar untuk peserta",
    subject: "{acara}: ",
    body: "Halo {nama},\n\n",
  },
};
