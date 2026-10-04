/**
 * Status penerima dan alasan gagal, dalam bahasa panitia.
 *
 * Satu berkas untuk semua pemetaan kode penyedia (Resend sekarang, Meta
 * menyusul) supaya kalimat di laporan kiriman tidak tersebar dan tidak berbeda
 * untuk kejadian yang sama.
 */

export type RecipientStatus =
  | "antre"
  | "mengirim"
  | "terkirim"
  | "diterima"
  | "dibaca"
  | "tidak_pasti"
  | "gagal_sementara"
  | "gagal_tetap"
  | "dilewati";

export const STATUS_LABEL: Record<RecipientStatus, string> = {
  antre: "Queued",
  mengirim: "Sending",
  terkirim: "Sent",
  diterima: "Delivered",
  dibaca: "Read",
  tidak_pasti: "Unconfirmed",
  gagal_sementara: "Retrying",
  gagal_tetap: "Failed",
  dilewati: "Skipped",
};

export const STATUS_TONE: Record<RecipientStatus, "neutral" | "primary" | "success" | "warning" | "error"> = {
  antre: "neutral",
  mengirim: "neutral",
  terkirim: "primary",
  diterima: "success",
  dibaca: "success",
  tidak_pasti: "warning",
  gagal_sementara: "error",
  gagal_tetap: "error",
  dilewati: "neutral",
};

/**
 * Kegagalan kirim email dari balasan Resend.
 *
 * `httpStatus` 422 = alamat atau isi ditolak validasi: mengulang tidak menolong.
 * 401/403 = kunci API atau domain pengirim bermasalah: gagal_sementara, karena
 * setelah pemilik sistem membereskannya kiriman yang sama bisa dicoba lagi.
 * 409 = kunci idempotensi dipakai dengan isi berbeda (data peserta berubah di
 * tengah percobaan): tidak pasti, panitia yang memutuskan.
 */
export function emailFailure(error: string, httpStatus: number | null): { status: RecipientStatus; reason_code: string; reason: string } {
  if (httpStatus === 409) return { status: "tidak_pasti", reason_code: "idempotency_conflict", reason: "Isi berubah saat dikirim ulang. Periksa apakah peserta sudah menerima." };
  if (httpStatus === 401 || httpStatus === 403) return { status: "gagal_sementara", reason_code: "provider_auth", reason: `Penyedia email menolak pengirim: ${error}` };
  if (httpStatus === 422) return { status: "gagal_tetap", reason_code: "invalid_address", reason: `Alamat ditolak: ${error}` };
  return { status: "gagal_sementara", reason_code: "provider_error", reason: error };
}

/** Peristiwa webhook Resend menjadi status penerima. Null = tidak mengubah status. */
export function resendEvent(type: string, data: { bounce?: { type?: string; message?: string } } | null): { status: RecipientStatus; reason_code: string | null; reason: string | null } | null {
  switch (type) {
    case "email.delivered":
      return { status: "diterima", reason_code: null, reason: null };
    case "email.bounced": {
      const permanen = (data?.bounce?.type ?? "").toLowerCase() !== "transient";
      return permanen
        ? { status: "gagal_tetap", reason_code: "bounce", reason: "Alamat tidak ada atau menolak email" }
        : { status: "gagal_sementara", reason_code: "bounce_transient", reason: "Kotak masuk penuh atau server penerima sibuk" };
    }
    case "email.complained":
      return { status: "gagal_tetap", reason_code: "complained", reason: "Penerima menandai email sebagai spam" };
    case "email.failed":
      return { status: "gagal_sementara", reason_code: "failed", reason: "Penyedia email gagal mengirim" };
    case "email.suppressed":
      return { status: "gagal_tetap", reason_code: "suppressed", reason: "Alamat ada di daftar blokir penyedia email" };
    default:
      return null;
  }
}
