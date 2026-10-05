import type { MasukMode } from "@/app/masuk/masuk-client";
import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Teks dialog masuk area peserta (components/member/masuk-dialog.tsx).
 *
 * Teks Indonesia sama persis dengan yang sebelumnya ditulis langsung di
 * dialognya. Pesan galat Indonesia tetap dari server; dialog English
 * menerjemahkan kode galatnya (`galat`), karena API area peserta menulis
 * pesannya dalam bahasa Indonesia.
 */
export type MasukUiText = {
  judul: Record<MasukMode, string>;
  tutup: string;
  untukPertamaKali: string;
  untuk: (email: string) => string;
  emailLabel: string;
  emailPlaceholder: string;
  sandiLabel: string;
  sandiBaruLabel: string;
  lupa: string;
  minimal: (n: number) => string;
  memproses: string;
  tombol: Record<MasukMode, string>;
  belumPunya: string;
  sudahPunya: string;
  kirimTautan: string;
  masuk: string;
  tautanTidakBerlaku: string;
  tautanTerkirim: (email: string) => string;
  koneksi: string;
  gagalUmum: string;
  /** English saja: pesan untuk kode galat API. Indonesia memakai pesan server. */
  galat?: (kode: string, mode: MasukMode, menit: number | null) => string;
};

export const MASUK_UI: Record<LandingLang, MasukUiText> = {
  id: {
    judul: { masuk: "Masuk area peserta", tautan: "Kirim tautan ke email", sandi: "Buat kata sandi" },
    tutup: "Tutup",
    untukPertamaKali: "Untuk membuat kata sandi pertama kali, atau bila Anda lupa kata sandi.",
    untuk: (email) => `Untuk ${email}.`,
    emailLabel: "Email pendaftaran",
    emailPlaceholder: "nama@perusahaan.com",
    sandiLabel: "Kata sandi",
    sandiBaruLabel: "Kata sandi baru",
    lupa: "Lupa kata sandi?",
    minimal: (n) => `Minimal ${n} karakter.`,
    memproses: "Memproses...",
    tombol: { masuk: "Masuk", tautan: "Kirim tautan", sandi: "Simpan kata sandi dan masuk" },
    belumPunya: "Belum punya kata sandi?",
    sudahPunya: "Sudah punya kata sandi?",
    kirimTautan: "Kirim tautan ke email",
    masuk: "Masuk",
    tautanTidakBerlaku: "Tautan itu sudah dipakai atau kedaluwarsa. Minta tautan baru di bawah.",
    // Netral untuk ketiga kemungkinan: tautan kata sandi, kabar "akses belum
    // dibuka" (peserta impor yang belum boleh masuk), atau tidak ada apa-apa.
    tautanTerkirim: (email) => `Bila ${email} terdaftar di acara ini, kami sudah mengirim email berisi langkah berikutnya. Periksa juga folder spam.`,
    koneksi: "Koneksi terputus. Periksa jaringan Anda, lalu coba lagi.",
    gagalUmum: "Belum berhasil. Coba lagi.",
  },
  en: {
    judul: { masuk: "Participant sign-in", tautan: "Email me a link", sandi: "Create a password" },
    tutup: "Close",
    untukPertamaKali: "To create your password for the first time, or if you have forgotten it.",
    untuk: (email) => `For ${email}.`,
    emailLabel: "Registration email",
    emailPlaceholder: "name@company.com",
    sandiLabel: "Password",
    sandiBaruLabel: "New password",
    lupa: "Forgot password?",
    minimal: (n) => `At least ${n} characters.`,
    memproses: "Processing...",
    tombol: { masuk: "Sign in", tautan: "Send link", sandi: "Save password and sign in" },
    belumPunya: "No password yet?",
    sudahPunya: "Already have a password?",
    kirimTautan: "Email me a link",
    masuk: "Sign in",
    tautanTidakBerlaku: "That link has already been used or has expired. Request a new one below.",
    tautanTerkirim: (email) => `If ${email} is registered for this event, we have sent an email with the next step. Check your spam folder too.`,
    koneksi: "Connection lost. Check your network, then try again.",
    gagalUmum: "That did not work. Please try again.",
    galat: (kode, mode, menit) => {
      switch (kode) {
        case "RATE_LIMITED":
          menit = Math.max(1, menit ?? 1);
          return `Too many attempts for this email. Try again in ${menit} ${menit === 1 ? "minute" : "minutes"}.`;
        case "NOT_ELIGIBLE":
          return "This account cannot sign in yet. The participant area is only for people registered for this event. Contact the organisers.";
        case "EMAIL_IN_USE":
          return 'This email already has an account for this event. Sign in with its password, or choose "Forgot password?".';
        case "EMAIL_NOT_CONFIGURED":
          return "Email sending is not set up for this event yet. Contact the organisers.";
        case "EMAIL_FAILED":
          return "The email was not sent. Please try again shortly.";
        case "MEMBER_DISABLED":
          return "The participant area is not open for this event.";
        case "NOT_FOUND":
          return "Event not found.";
        case "VALIDATION_ERROR":
          return mode === "masuk"
            ? "Enter your email and password."
            : mode === "tautan"
              ? "Enter your registration email."
              : "Check the password length, or request a new link.";
        case "INVALID":
          return mode === "sandi"
            ? 'This link has already been used or has expired. Request a new one with "Forgot password?".'
            : 'Email or password does not match. Check again, or choose "Forgot password?" to get a link by email.';
        default:
          return "That did not work. Please try again.";
      }
    },
  },
};
