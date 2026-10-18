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
  /** Label kecil di pita acara (dialog layar penuh di ponsel). */
  alis: string;
  bantuan: string;
  hubungiPanitia: string;
  /** Cara masuk Email code: catatan di bawah kolom email. */
  kodeCatatan: string;
  /** Setelah kode diminta. Netral: sama untuk email terdaftar maupun tidak. */
  kodeTerkirim: (email: string) => string;
  kodeLabel: string;
  kirimUlang: string;
  gantiEmail: string;
  kodeBaru: string;
  /** Cara masuk dua kolom data peserta. */
  kolomCatatan: string;
  /** English saja: pesan untuk kode galat API. Indonesia memakai pesan server. */
  galat?: (kode: string, mode: MasukMode, menit: number | null) => string;
};

export const MASUK_UI: Record<LandingLang, MasukUiText> = {
  id: {
    judul: { masuk: "Masuk ke Dashboard saya", tautan: "Kirim tautan ke email", sandi: "Buat kata sandi", kode: "Masuk ke Dashboard saya", verifikasi: "Cek email Anda", kolom: "Masuk ke Dashboard saya" },
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
    tombol: { masuk: "Masuk", tautan: "Kirim tautan", sandi: "Simpan kata sandi dan masuk", kode: "Kirim kode", verifikasi: "Masuk", kolom: "Masuk" },
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
    alis: "Peserta",
    bantuan: "Butuh bantuan?",
    hubungiPanitia: "Hubungi panitia",
    kodeCatatan: "Kami kirim kode 6 digit ke email ini. Tidak perlu kata sandi.",
    kodeTerkirim: (email) => `Bila ${email} terdaftar di acara ini, kode 6 digit sudah kami kirim ke sana. Berlaku 10 menit. Periksa juga folder spam.`,
    kodeLabel: "Kode 6 digit",
    kirimUlang: "Kirim ulang kode",
    gantiEmail: "Ganti email",
    kodeBaru: "Bila email ini terdaftar, kode baru sedang dikirim. Pakai kode dari email terbaru.",
    kolomCatatan: "Isi sesuai data yang Anda berikan ke panitia.",
  },
  en: {
    judul: { masuk: "Sign in to My dashboard", tautan: "Email me a link", sandi: "Create a password", kode: "Sign in to My dashboard", verifikasi: "Check your email", kolom: "Sign in to My dashboard" },
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
    tombol: { masuk: "Sign in", tautan: "Send link", sandi: "Save password and sign in", kode: "Send code", verifikasi: "Sign in", kolom: "Sign in" },
    belumPunya: "No password yet?",
    sudahPunya: "Already have a password?",
    kirimTautan: "Email me a link",
    masuk: "Sign in",
    tautanTidakBerlaku: "That link has already been used or has expired. Request a new one below.",
    tautanTerkirim: (email) => `If ${email} is registered for this event, we have sent an email with the next step. Check your spam folder too.`,
    koneksi: "Connection lost. Check your network, then try again.",
    gagalUmum: "That did not work. Please try again.",
    alis: "Participants",
    bantuan: "Need help?",
    hubungiPanitia: "Contact the organisers",
    kodeCatatan: "We'll email you a 6-digit code. No password needed.",
    kodeTerkirim: (email) => `If ${email} is registered for this event, we have sent a 6-digit code to it. It is valid for 10 minutes. Check your spam folder too.`,
    kodeLabel: "6-digit code",
    kirimUlang: "Resend code",
    gantiEmail: "Change email",
    kodeBaru: "If this email is registered, a new code is on its way. Use the code from the latest email.",
    kolomCatatan: "Enter the details you gave the organisers.",
    galat: (kode, mode, menit) => {
      switch (kode) {
        case "RATE_LIMITED":
          menit = Math.max(1, menit ?? 1);
          return `Too many ${mode === "kode" || mode === "verifikasi" ? "code requests or attempts" : "attempts"}${mode === "kolom" ? "" : " for this email"}. Try again in ${menit} ${menit === 1 ? "minute" : "minutes"}.`;
        case "METHOD_OFF":
          return "The sign-in method for this event has changed. Reload the page.";
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
            : mode === "tautan" || mode === "kode"
              ? "Enter your registration email."
              : mode === "verifikasi"
                ? "Enter the 6 digits from the email."
                : mode === "kolom"
                  ? "Fill in both fields."
                  : "Check the password length, or request a new link.";
        case "INVALID":
          if (mode === "verifikasi") return "That code does not match or has expired. Check it again, or request a new code.";
          if (mode === "kolom") return "Those details don't match any participant. Check them again, or contact the organisers.";
          return mode === "sandi"
            ? 'This link has already been used or has expired. Request a new one with "Forgot password?".'
            : 'Email or password does not match. Check again, or choose "Forgot password?" to get a link by email.';
        default:
          return "That did not work. Please try again.";
      }
    },
  },
};
