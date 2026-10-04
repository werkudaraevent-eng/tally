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
  tanpa_email: "No email",
  berhenti_email: "Unsubscribed",
  email_memantul: "Email bounced before",
  area_mati: "Participant area is turned off",
  belum_boleh_masuk: "Not allowed to sign in to the participant area yet",
  di_luar_daftar_uji: "Not on the test list",
  sudah_daftar: "Already registered",
  sudah_peserta: "Email already used by a participant",
  terjadwal: "Already in another blast that hasn't finished",
};

/** Kode yang kalimatnya tetap: kalimat tersimpan diganti seluruhnya. */
const LABEL_ALASAN: Record<string, string> = {
  ...SKIP_REASON,
  peserta_dihapus: "Participant was removed from the list",
  undangan_dihapus: "Invited guest was removed from the list",
  pendaftaran_ditutup: "Registration for this event is closed",
  jadwal_dibatalkan: "Blast cancelled",
  idempotency_conflict: "Content changed during the resend. Check whether the participant already received it.",
  bounce: "Address doesn't exist or rejects email",
  bounce_transient: "Inbox full or receiving server busy",
  complained: "Recipient marked the email as spam",
  failed: "Email provider failed to send",
  suppressed: "Address is on the email provider's block list",
  // Ditulis fungsi SQL (migrasi 202610030003 dan 202610040007).
  lease_expired: "The sender stopped before the provider replied. The message may have been sent.",
};

// `alamat_berubah`: kalimat tersimpannya berbeda untuk peserta dan tamu, jadi
// labelnya dipilih menurut jenis penerima (argumen ketiga labelAlasan).
const LABEL_ALAMAT_BERUBAH: Record<JenisPenerima, string> = {
  peserta: "Participant's email changed after the blast was prepared",
  tamu: "Invited guest's email changed after the blast was prepared",
};

export type JenisPenerima = "peserta" | "tamu";

/**
 * Kode yang kalimatnya membawa rincian dari penyedia setelah ": ". Labelnya
 * diganti, rinciannya (teks penyedia, sudah English) dipertahankan.
 */
const LABEL_DENGAN_RINCIAN: Record<string, string> = {
  provider_auth: "Email provider rejected the sender",
  invalid_address: "Address rejected",
  pengirim_berhenti: "Sending on the test site stopped",
};

export function labelAlasan(
  code: string | null | undefined,
  tersimpan: string | null | undefined,
  penerima?: JenisPenerima,
): string | null {
  if (code === "alamat_berubah" && penerima) return LABEL_ALAMAT_BERUBAH[penerima];
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
    return "A recipient marked the invitation as spam. Check the list and content before continuing.";
  }
  const pantul = /^(\d+) dari (\d+) undangan pertama memantul/.exec(tersimpan);
  if (pantul) return `${pantul[1]} of the first ${pantul[2]} invitations bounced. Check where the list came from before continuing.`;
  if (tersimpan.startsWith("Kabar pengiriman gelombang pertama belum cukup")) {
    return "Not enough delivery updates from the first wave to judge this list yet. Check the report, then continue if it looks safe.";
  }
  return tersimpan;
}
