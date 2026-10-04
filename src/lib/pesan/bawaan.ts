/**
 * Templat bawaan dan kolom isian Pesan peserta. Berkas ini tidak mengimpor apa
 * pun dari server, supaya penyusun di peramban memakai teks yang sama dengan
 * yang dibuat API.
 */

/** undangan = Link login (peserta); invitation = undangan mendaftar (tamu); info = Info acara. */
export type BlastKind = "undangan" | "info" | "invitation";

export const FIELDS = [
  { key: "nama", label: "Name" },
  { key: "perusahaan", label: "Organisation" },
  { key: "acara", label: "Event name" },
  { key: "tanggal", label: "Event date" },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];

export const DEFAULT_CONTENT: Record<BlastKind, { title: string; subject: string; body: string }> = {
  undangan: {
    title: "Sign-in link",
    subject: "Undangan: {acara}",
    body: [
      "Halo {nama},",
      "",
      "Anda terdaftar sebagai peserta {acara}, {tanggal}. Tiket dan info acara Anda ada di Dashboard saya.",
      "",
      "Tekan tombol di bawah untuk membuat kata sandi dan masuk. Tautan ini hanya untuk Anda dan berlaku 7 hari.",
    ].join("\n"),
  },
  invitation: {
    title: "Event invitation",
    subject: "Anda diundang ke {acara}",
    body: [
      "Halo {nama},",
      "",
      "Dengan senang hati kami mengundang Anda ke {acara}, {tanggal}.",
      "",
      "Tekan tombol di bawah untuk mendaftar. Tautan ini khusus untuk Anda, jadi mohon tidak diteruskan.",
    ].join("\n"),
  },
  info: {
    title: "Event update",
    subject: "{acara}: ",
    body: "Halo {nama},\n\n",
  },
};

/** Isi bawaan "Ingatkan yang belum daftar": tamu yang sudah diundang tapi belum mendaftar. */
export const INVITATION_REMINDER = {
  title: "Invitation reminder",
  subject: "Pengingat: undangan Anda ke {acara}",
  body: [
    "Halo {nama},",
    "",
    "Kami belum menerima pendaftaran Anda untuk {acara}, {tanggal}. Tempat Anda masih kami simpan.",
    "",
    "Tekan tombol di bawah untuk mendaftar. Tautan ini khusus untuk Anda, jadi mohon tidak diteruskan.",
  ].join("\n"),
};
