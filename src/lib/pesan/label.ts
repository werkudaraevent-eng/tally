/**
 * Label fitur Tamu undangan dan nama jenis kiriman, di SATU berkas.
 *
 * Glosarium panel admin (thread Bahasa panel admin) belum diputuskan. Semua
 * kata yang dilihat panitia untuk fitur ini dikumpulkan di sini supaya bisa
 * diganti ke bahasa Indonesia atau Inggris penuh tanpa menyentuh logika.
 * Tidak mengimpor apa pun: dipakai server dan peramban.
 */

import { plural } from "@/lib/plural";

export const KIND_LABEL = {
  undangan: "Sign-in link",
  invitation: "Invitation",
  info: "Event update",
} as const;

export const AUDIENCE_LABEL = {
  peserta: "Participants",
  tamu: "Invited guests",
} as const;

export const TAMU = {
  tab: "Invited guests",
  addButton: "Add invited guest",
  addTitle: "Add invited guests",
  addManual: "Type",
  addImport: "Import Excel",
  addAnother: "Save and add another",
  addAttest: "This person expects an invitation to this event.",
  addNoSend: "No email has been sent yet. Invitations are sent from the Invited guests tab.",
  sendInvite: "Send invitation",
  sendInviteSelected: (n: number) => `Send invitation to ${n} selected`,
  remind: "Remind those not registered",
  empty: "No invited guests yet.",
  emptyHint: "Add them one by one or import from Excel with Add invited guest. No email has been sent yet.",
  emptyComposer: "No invited guests yet. Add them in Registration →",
  copyLink: "Copy private link",
  linkCopied: "Private link copied",
  newLink: "Create new link",
  newLinkConfirm: "The old link stops working, including the one already sent by email. Continue?",
  edit: "Edit details",
  remove: "Remove",
  removeConfirm: (nama: string) => `Remove ${nama} from invited guests? Their private link stops working.`,
  viewRegistration: "View registration →",
  approx: "Estimated",
  noEmail: "No email",
} as const;

export type InviteStatus = "sudah_daftar" | "ditolak" | "gagal" | "membuka" | "terkirim" | "terjadwal" | "belum_dikirim";

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  sudah_daftar: "Registered",
  ditolak: "Rejected",
  gagal: "Send failed",
  membuka: "Opened the form",
  terkirim: "Sent",
  terjadwal: "Scheduled",
  belum_dikirim: "Not sent",
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
  semua: "All",
  belum_dikirim: "Not sent",
  belum_daftar: "Not registered yet",
  sudah_daftar: "Registered",
  gagal: "Failed",
};

export const AKSES = {
  title: "Registration settings",
  change: "Change settings",
  openTo: "Open to",
  anyone: "Anyone with the link",
  inviteOnly: "Invited guests only",
  inviteAutoApprove: "Approve invited guests automatically",
  inviteAutoApproveHint: "Applies when an invited guest registers through their private link with the invited email. Other emails always go to Pending approval.",
  generalAutoApprove: "Approve other registrants automatically",
  publicLinkInviteOnly: "Public link (invitation only)",
  confirmInviteOnly: (n: number) =>
    n > 0
      ? `Only ${plural(n, "invited guest")} can register, through their private links. Anyone else who opens the form sees the "Invitation only" page.`
      : "There are no invited guests yet, so nobody can register until you import the list.",
} as const;

export const IMPOR = {
  attest: "This list comes from staff or the client, and these people expect an invitation to this event.",
  retention: "Invited guests who don't register are deleted 30 days after the event.",
  noSend: "Importing sends no email.",
  willAdd: "will be added",
  withoutEmail: "without email (can't be emailed)",
  merged: "already invited or duplicated in the file, merged",
  alreadyParticipant: "already a participant or registering, skipped",
  rejected: "not imported (invalid email, no name, or a template sample row)",
  suppressed: "unsubscribed or bounced before, won't be emailed",
  possibleDuplicates: "same name without email, possible duplicates",
  downloadRejected: "Download rejected rows",
  commit: "Add",
  previewBlocked: "Imports from a test site only work for draft events, because test sites use the production database.",
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
