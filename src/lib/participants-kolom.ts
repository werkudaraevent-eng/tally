import type { ImportField } from "./participants-io";

// Pengenal kolom impor Daftar peserta. Modul murni (tanpa server) supaya bisa
// diuji dengan `participants-kolom.check.ts`.

/**
 * Nama kolom alternatif yang diterima importir.
 *
 * Berkas nyata datang dari spreadsheet panitia, bukan dari ekspor aplikasi ini.
 * Menolak "Nama" karena headernya bukan "name" memaksa orang menyunting baris
 * pertama sebelum boleh mengunggah -- pekerjaan yang tidak menghasilkan apa pun
 * dan yang gagal dilakukan justru saat sedang terburu-buru.
 */
export const HEADER_ALIASES: Record<string, ImportField> = {
  qr_code: "qr_code", qr: "qr_code", kode: "qr_code", kode_qr: "qr_code",
  kode_peserta: "qr_code", unique_code: "qr_code", uniquecode: "qr_code",
  participant_code: "qr_code",
  name: "name", nama: "name", nama_lengkap: "name", full_name: "name", fullname: "name", participant_name: "name",
  company: "company", perusahaan: "company", instansi: "company", affiliation: "company",
  organisation: "company", organization: "company", organisasi: "company",
  title: "title", jabatan: "title", job_title: "title", jobtitle: "title", posisi: "title", position: "title",
  email: "email", surel: "email", alamat_email: "email", email_address: "email",
  phone: "phone", telepon: "phone", telp: "phone", hp: "phone", no_hp: "phone", whatsapp: "phone",
  phone_number: "phone", mobile: "phone", mobile_number: "phone",
  participant_type: "participant_type", tipe: "participant_type", tipe_peserta: "participant_type",
  kategori: "participant_type", participanttype: "participant_type", type: "participant_type",
  rsvp_status: "rsvp_status", rsvp: "rsvp_status", status_rsvp: "rsvp_status", rsvpstatus: "rsvp_status",
};

/** Samakan bentuk header sebelum dicocokkan: "No. HP " -> "no_hp". */
export function normalizeHeader(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type KolomImpor = { kind: "base"; field: ImportField } | { kind: "extra"; key: string } | null;

/**
 * Kolom berkas -> kolom bawaan atau kunci pertanyaan tambahan.
 *
 * Nama kolom bawaan yang persis (`name`, `phone`, ...) selalu kolom bawaan.
 * Selain itu kolom pertanyaan tambahan (kunci atau labelnya) menang atas alias:
 * pertanyaan berkunci "position" atau "mobile" tidak boleh jawabannya pindah ke
 * jabatan atau telepon saat hasil ekspor diimpor ulang.
 */
export function kolomImpor(cell: string, tambahan: Map<string, string>): KolomImpor {
  const header = normalizeHeader(cell);
  const base = HEADER_ALIASES[header];
  if (base && base === header) return { kind: "base", field: base };
  const key = tambahan.get(header);
  if (key) return { kind: "extra", key };
  if (base) return { kind: "base", field: base };
  return null;
}
