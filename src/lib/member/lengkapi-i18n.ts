import type { LandingLang } from "@/lib/landing-i18n";

/** Teks halaman Lengkapi data dan kartunya di dashboard, mengikuti bahasa halaman acara. */
export const LENGKAPI_UI: Record<
  LandingLang,
  {
    eyebrow: string;
    title: string;
    forPerson: (nama: string, email: string | null) => string;
    notYou: string;
    save: string;
    saving: string;
    savedTitle: string;
    editAgainUntil: (tanggal: string) => string;
    editAgain: string;
    openArea: string;
    backToEvent: string;
    lost: string;
    invalidTitle: string;
    invalidBody: string;
    signIn: string;
    noFieldsTitle: string;
    noFieldsBody: string;
    contact: string;
    cardEyebrow: string;
    cardTitle: string;
    cardBody: (daftar: string) => string;
    cardButton: string;
    empty: string;
  }
> = {
  id: {
    eyebrow: "Lengkapi data",
    title: "Lengkapi data Anda",
    forPerson: (nama, email) => `Data untuk ${nama}${email ? ` (${email})` : ""}.`,
    notYou: "Bukan Anda? Tutup halaman ini.",
    save: "Simpan",
    saving: "Menyimpan…",
    savedTitle: "Terima kasih, data Anda tersimpan",
    editAgainUntil: (tanggal) => `Salah ketik? Buka lagi tautan dari email untuk mengubahnya sampai ${tanggal}.`,
    editAgain: "Ubah lagi",
    openArea: "Buka Dashboard saya",
    backToEvent: "Kembali ke halaman acara",
    lost: "Koneksi terputus. Periksa jaringan lalu tekan Simpan lagi.",
    invalidTitle: "Tautan ini sudah tidak berlaku",
    invalidBody: "Tautan Lengkapi data berlaku 14 hari, dan hanya tautan terbaru yang bisa dipakai. Minta tautan baru ke panitia.",
    signIn: "Masuk ke Dashboard saya",
    noFieldsTitle: "Tidak ada data yang perlu diisi",
    noFieldsBody: "Panitia belum meminta data tambahan untuk acara ini.",
    contact: "Hubungi panitia:",
    cardEyebrow: "Perlu dilengkapi",
    cardTitle: "Lengkapi data Anda",
    cardBody: (daftar) => `Panitia meminta Anda mengisi: ${daftar}.`,
    cardButton: "Lengkapi data",
    empty: "Belum diisi",
  },
  en: {
    eyebrow: "Update your details",
    title: "Update your details",
    forPerson: (nama, email) => `Details for ${nama}${email ? ` (${email})` : ""}.`,
    notYou: "Not you? Close this page.",
    save: "Save",
    saving: "Saving…",
    savedTitle: "Thank you, your details are saved",
    editAgainUntil: (tanggal) => `Made a typo? Open the link in the email again to change it until ${tanggal}.`,
    editAgain: "Change again",
    openArea: "Open my dashboard",
    backToEvent: "Back to the event page",
    lost: "The connection dropped. Check your network and press Save again.",
    invalidTitle: "This link has expired",
    invalidBody: "Update links work for 14 days, and only the newest link can be used. Ask the organisers for a new one.",
    signIn: "Sign in to my dashboard",
    noFieldsTitle: "There is nothing to fill in",
    noFieldsBody: "The organisers haven't asked for any extra details for this event.",
    contact: "Contact the organisers:",
    cardEyebrow: "Needs your input",
    cardTitle: "Update your details",
    cardBody: (daftar) => `The organisers ask you to fill in: ${daftar}.`,
    cardButton: "Update details",
    empty: "Not filled in",
  },
};
