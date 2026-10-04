/**
 * Label alasan penerima dan alasan jeda, dibaca dari KODE-nya.
 *
 * Kolom `reason` dan `paused_reason` menyimpan kalimat yang ditulis saat
 * kejadian. Admin pindah ke English bertahap, dan baris lama tidak ikut
 * berubah, jadi layar laporan merender dari `reason_code` lewat peta ini dan
 * baru jatuh ke teks tersimpan bila kodenya tidak dikenal. Mengganti bahasa
 * cukup di sini; data lama ikut tampil dalam bahasa baru.
 *
 * Modul murni (tanpa server), supaya bisa diimpor komponen klien.
 */

export type SkipCode =
  | "tanpa_email"
  | "berhenti_email"
  | "email_memantul"
  | "area_mati"
  | "belum_boleh_masuk"
  | "di_luar_daftar_uji"
  | "sudah_daftar"
  | "sudah_peserta"
  | "terjadwal";

export const SKIP_REASON: Record<SkipCode, string> = {
  tanpa_email: "Tidak punya email",
  berhenti_email: "Berhenti menerima email",
  email_memantul: "Email pernah memantul",
  area_mati: "Area peserta belum dinyalakan",
  belum_boleh_masuk: "Belum boleh masuk area peserta",
  di_luar_daftar_uji: "Di luar daftar uji",
  sudah_daftar: "Sudah mendaftar",
  sudah_peserta: "Email ini sudah dipakai peserta",
  terjadwal: "Sudah ada di kiriman lain yang belum selesai",
};

/** Kode yang kalimatnya tetap: kalimat tersimpan diganti seluruhnya. */
const LABEL_ALASAN: Record<string, string> = {
  ...SKIP_REASON,
  peserta_dihapus: "Peserta sudah dihapus dari daftar",
  undangan_dihapus: "Tamu sudah dihapus dari daftar undangan",
  pendaftaran_ditutup: "Pendaftaran acara sudah ditutup",
  jadwal_dibatalkan: "Kiriman dibatalkan",
  idempotency_conflict: "Isi berubah saat dikirim ulang. Periksa apakah peserta sudah menerima.",
  bounce: "Alamat tidak ada atau menolak email",
  bounce_transient: "Kotak masuk penuh atau server penerima sibuk",
  complained: "Penerima menandai email sebagai spam",
  failed: "Penyedia email gagal mengirim",
  suppressed: "Alamat ada di daftar blokir penyedia email",
  // Ditulis fungsi SQL (migrasi 202610030003 dan 202610040007).
  lease_expired: "Pengirim berhenti sebelum penyedia membalas. Pesan mungkin sudah terkirim.",
};

// `alamat_berubah` sengaja tidak dipetakan: kalimat tersimpannya berbeda untuk
// peserta dan tamu. Fase 2b memberinya dua label menurut jenis penerima.

/**
 * Kode yang kalimatnya membawa rincian dari penyedia setelah ": ". Labelnya
 * diganti, rinciannya (teks penyedia, sudah English) dipertahankan.
 */
const LABEL_DENGAN_RINCIAN: Record<string, string> = {
  provider_auth: "Penyedia email menolak pengirim",
  invalid_address: "Alamat ditolak",
  pengirim_berhenti: "Pengiriman di situs uji berhenti",
};

export function labelAlasan(code: string | null | undefined, tersimpan: string | null | undefined): string | null {
  if (code && LABEL_DENGAN_RINCIAN[code]) {
    const titik = tersimpan?.indexOf(": ") ?? -1;
    const rincian = tersimpan && titik >= 0 ? tersimpan.slice(titik + 2) : "";
    return rincian ? `${LABEL_DENGAN_RINCIAN[code]}: ${rincian}` : LABEL_DENGAN_RINCIAN[code];
  }
  if (code && LABEL_ALASAN[code]) return LABEL_ALASAN[code];
  // provider_error dan kode yang belum dikenal: teks apa adanya.
  return tersimpan ?? null;
}

/**
 * Alasan jeda kiriman Invitation. Ditulis fungsi SQL di migrasi
 * 202610040007 tanpa kolom kode, jadi dikenali dari kalimatnya. Kalimat yang
 * tidak dikenal tampil apa adanya.
 */
export function labelAlasanJeda(tersimpan: string | null | undefined): string | null {
  if (!tersimpan) return null;
  if (tersimpan.startsWith("Ada penerima yang menandai undangan sebagai spam")) {
    return "Ada penerima yang menandai undangan sebagai spam. Periksa daftar dan isi sebelum melanjutkan.";
  }
  const pantul = /^(\d+) dari (\d+) undangan pertama memantul/.exec(tersimpan);
  if (pantul) return `${pantul[1]} dari ${pantul[2]} undangan pertama memantul. Periksa sumber daftar sebelum melanjutkan.`;
  if (tersimpan.startsWith("Kabar pengiriman gelombang pertama belum cukup")) {
    return "Kabar pengiriman gelombang pertama belum cukup untuk menilai daftar ini. Periksa laporan, lalu lanjutkan bila aman.";
  }
  return tersimpan;
}
