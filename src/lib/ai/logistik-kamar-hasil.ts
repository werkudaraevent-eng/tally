/** Hasil pencocokan "Read with AI" (Logistics), dipisah supaya dialog klien tidak memuat seluruh impor. */

export type StatusTemuan = "diisi" | "berubah" | "sama" | "tidak_ditemukan" | "ganda" | "bukan_hotel" | "bentrok" | "tanpa_nomor";

export type HasilTemuan = {
  /** Nama seperti tertulis di berkas. */
  namaBerkas: string;
  /** Nama di Tally bila cocok. */
  namaTally: string | null;
  hotel: string;
  nomor: string;
  /** Nomor yang tersimpan sekarang (untuk "berubah"). */
  lama: string | null;
  status: StatusTemuan;
};

export const LABEL_STATUS: Record<StatusTemuan, string> = {
  diisi: "Room number added",
  berubah: "Room number changes",
  sama: "Already the same",
  tidak_ditemukan: "Name not found in Tally",
  ganda: "More than one participant has this name",
  bukan_hotel: "No stay at this hotel in Tally",
  bentrok: "Different numbers for one person in the file",
  tanpa_nomor: "No room number in the file",
};
