/**
 * Label fitur Tamu undangan dan nama jenis kiriman, di SATU berkas.
 *
 * Glosarium panel admin (thread Bahasa panel admin) belum diputuskan. Semua
 * kata yang dilihat panitia untuk fitur ini dikumpulkan di sini supaya bisa
 * diganti ke bahasa Indonesia atau Inggris penuh tanpa menyentuh logika.
 * Tidak mengimpor apa pun: dipakai server dan peramban.
 */

export const KIND_LABEL = {
  undangan: "Link login",
  invitation: "Invitation",
  info: "Info acara",
} as const;

export const AUDIENCE_LABEL = {
  peserta: "Peserta",
  tamu: "Tamu undangan",
} as const;

export const TAMU = {
  tab: "Tamu undangan",
  importButton: "Impor tamu…",
  importTitle: "Impor tamu undangan",
  sendInvite: "Kirim undangan",
  sendInviteSelected: (n: number) => `Kirim undangan ke ${n} terpilih`,
  remind: "Ingatkan yang belum daftar",
  empty: "Belum ada tamu undangan.",
  emptyHint: "Impor daftar dari Excel atau CSV. Tidak ada email yang terkirim saat impor.",
  emptyComposer: "Belum ada tamu. Impor di Pendaftaran →",
  copyLink: "Salin tautan pribadi",
  linkCopied: "Tautan pribadi disalin",
  newLink: "Buat tautan baru",
  newLinkConfirm: "Tautan lama berhenti bekerja, termasuk yang sudah terkirim di email. Lanjutkan?",
  edit: "Ubah data",
  remove: "Hapus",
  removeConfirm: (nama: string) => `Hapus ${nama} dari tamu undangan? Tautan pribadinya berhenti bekerja.`,
  viewRegistration: "Lihat pendaftaran →",
  approx: "perkiraan",
  noEmail: "Tanpa email",
} as const;

export type InviteStatus = "sudah_daftar" | "ditolak" | "gagal" | "membuka" | "terkirim" | "terjadwal" | "belum_dikirim";

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  sudah_daftar: "Sudah daftar",
  ditolak: "Ditolak",
  gagal: "Gagal kirim",
  membuka: "Membuka formulir",
  terkirim: "Terkirim",
  terjadwal: "Terjadwal",
  belum_dikirim: "Belum dikirim",
};

export const INVITE_STATUS_TONE: Record<InviteStatus, "neutral" | "primary" | "success" | "warning" | "error"> = {
  sudah_daftar: "success",
  ditolak: "neutral",
  gagal: "error",
  membuka: "primary",
  terkirim: "primary",
  terjadwal: "neutral",
  belum_dikirim: "neutral",
};

export type InviteFilter = "semua" | "belum_dikirim" | "belum_daftar" | "sudah_daftar" | "gagal";

export const INVITE_FILTER_LABEL: Record<InviteFilter, string> = {
  semua: "Semua",
  belum_dikirim: "Belum dikirim",
  belum_daftar: "Belum daftar",
  sudah_daftar: "Sudah daftar",
  gagal: "Gagal",
};

export const AKSES = {
  title: "Setelan pendaftaran",
  change: "Ubah setelan",
  openTo: "Terbuka untuk",
  anyone: "Siapa saja yang punya tautan",
  inviteOnly: "Hanya tamu undangan",
  inviteAutoApprove: "Tamu undangan langsung disetujui",
  inviteAutoApproveHint: "Berlaku bila tamu mendaftar lewat tautan pribadinya dengan email yang diundang. Email lain selalu masuk Menunggu.",
  generalAutoApprove: "Setujui otomatis pendaftar umum",
  publicLinkInviteOnly: "Tautan umum (khusus undangan)",
  confirmInviteOnly: (n: number) =>
    n > 0
      ? `Hanya ${n} tamu undangan yang bisa mendaftar, lewat tautan pribadinya. Orang lain yang membuka formulir melihat halaman "Khusus undangan".`
      : "Belum ada tamu undangan, jadi tidak ada yang bisa mendaftar sampai Anda mengimpor daftarnya.",
} as const;

export const IMPOR = {
  attest: "Daftar ini dari panitia atau klien, dan orang-orang ini mengharapkan undangan acara ini.",
  retention: "Tamu yang tidak mendaftar dihapus 30 hari setelah acara.",
  noSend: "Impor tidak mengirim email apa pun.",
  willAdd: "akan ditambahkan",
  withoutEmail: "tanpa email (tidak bisa dikirimi email)",
  merged: "sudah diundang atau ganda di berkas, digabung",
  alreadyParticipant: "sudah jadi peserta, dilewati",
  rejected: "tidak diimpor (email tidak sah atau tanpa nama)",
  suppressed: "pernah berhenti atau memantul, tidak akan dikirimi",
  possibleDuplicates: "nama sama tanpa email, kemungkinan ganda",
  downloadRejected: "Unduh baris yang ditolak",
  commit: "Tambahkan",
  previewBlocked: "Impor dari situs uji hanya untuk acara draf, karena situs uji memakai database produksi.",
} as const;

/** Kalimat halaman publik (formulir dari undangan, tautan terpakai, khusus undangan). */
export const PUBLIK = {
  id: {
    invitedAs: "Undangan untuk",
    change: "Ganti",
    changeHint: "Pendaftaran dengan email lain perlu disetujui panitia.",
    usedTitle: "Tautan undangan ini sudah dipakai",
    usedBody: "Tautan pribadi hanya bisa dipakai sekali untuk mendaftar.",
    openDashboard: "Masuk ke Dashboard saya",
    contact: (alamat: string) => `Bila ini keliru, hubungi panitia di ${alamat}.`,
    contactGeneric: "Bila ini keliru, hubungi panitia acara.",
    invalidTitle: "Tautan undangan tidak berlaku",
    invalidBody: "Tautan ini sudah diganti atau tidak lengkap. Minta tautan baru di bawah ini, atau hubungi panitia.",
    inviteOnlyTitle: "Pendaftaran khusus undangan",
    inviteOnlyBody: "Acara ini hanya untuk tamu yang diundang. Gunakan tautan pribadi di email undangan Anda.",
    resendTitle: "Kirim ulang undangan",
    resendHint: "Masukkan email yang menerima undangan. Bila email itu ada di daftar tamu, tautan pribadinya kami kirim ulang.",
    resendButton: "Kirim ulang",
    resendDone: "Bila email itu ada di daftar tamu, undangannya sudah kami kirim ulang. Periksa juga folder spam.",
    emailLabel: "Email",
  },
  en: {
    invitedAs: "Invitation for",
    change: "Change",
    changeHint: "Registering with another email needs organiser approval.",
    usedTitle: "This invitation link has been used",
    usedBody: "A personal link can only be used once to register.",
    openDashboard: "Go to my Dashboard",
    contact: (alamat: string) => `If this is a mistake, contact the organisers at ${alamat}.`,
    contactGeneric: "If this is a mistake, contact the event organisers.",
    invalidTitle: "This invitation link is not valid",
    invalidBody: "The link has been replaced or is incomplete. Request a new one below, or contact the organisers.",
    inviteOnlyTitle: "Registration by invitation only",
    inviteOnlyBody: "This event is for invited guests only. Use the personal link in your invitation email.",
    resendTitle: "Resend my invitation",
    resendHint: "Enter the email that received the invitation. If it is on the guest list, we will resend the personal link.",
    resendButton: "Resend",
    resendDone: "If that email is on the guest list, we have resent the invitation. Please check your spam folder too.",
    emailLabel: "Email",
  },
} as const;
