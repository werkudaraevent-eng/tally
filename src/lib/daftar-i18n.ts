import type { LandingLang } from "./landing-i18n";

/**
 * Teks bawaan formulir pendaftaran publik, per bahasa.
 *
 * Bahasa formulir mengikuti alamatnya, sama dengan halaman acara: bahasa utama
 * di `/e/<slug>/daftar`, bahasa lainnya di `/e/<slug>/en/daftar` atau
 * `/e/<slug>/id/daftar`. Teks dari panitia (kolom tambahan, sambutan, pesan
 * berhasil) belum punya versi English dan tetap tampil apa adanya.
 */
export type DaftarUiText = {
  registration: string;
  eventPage: string;
  backToEvent: string;
  navAria: string;
  signIn: string;
  signInMemberArea: string;
  managedBy: string;
  personalData: string;
  optionalNote: string;
  alreadyRegistered: string;
  optional: string;
  fullName: string;
  email: string;
  emailHelpRequired: string;
  emailHelpOptional: string;
  phone: string;
  company: string;
  jobTitle: string;
  deviceUsed: string;
  openCode: string;
  registerNow: string;
  sending: string;
  consent: string;
  connectionLost: string;
  failed: string;
  successApproved: string;
  successPending: string;
  messageApproved: string;
  messagePending: string;
  emailSent: string;
  emailNotSent: string;
  yourLink: string;
  linkHelp: string;
  linkHelpPending: string;
  notFoundTitle: string;
  notFoundBody: string;
  closedTitle: string;
  closedBody: (eventName: string) => string;
  /**
   * Galat server per kode API, untuk halaman English: pesan server ditulis
   * dalam bahasa Indonesia. Di halaman Indonesia pesan server tampil apa adanya.
   */
  errors: Partial<Record<"REGISTRATION_DUPLICATE_EMAIL" | "REGISTRATION_CLOSED" | "RATE_LIMITED" | "VALIDATION_ERROR" | "INTERNAL_ERROR", string>>;
  field: {
    choose: string;
    fileHelp: string;
    fileTooLarge: string;
    fileFormat: string;
    uploadLost: string;
    uploadRejected: string;
    uploading: string;
    replaceFile: string;
    chooseFile: string;
  };
  code: {
    participantCode: string;
    preparing: string;
    saveOrShare: string;
    download: string;
    imageFailed: string;
    showAtDesk: string;
    qrAlt: (code: string) => string;
  };
};

export const DAFTAR_UI: Record<LandingLang, DaftarUiText> = {
  id: {
    registration: "Pendaftaran peserta",
    eventPage: "Halaman acara",
    backToEvent: "Kembali ke halaman acara",
    navAria: "Halaman acara",
    signIn: "Masuk",
    signInMemberArea: "Masuk area peserta",
    managedBy: "Dikelola dengan Tally",
    personalData: "Data diri",
    optionalNote: "Kolom bertanda (opsional) boleh dikosongkan.",
    alreadyRegistered: "Sudah terdaftar?",
    optional: "(opsional)",
    fullName: "Nama lengkap",
    email: "Email",
    emailHelpRequired: "Dipakai panitia untuk menghubungi Anda. Satu email hanya bisa mendaftar sekali.",
    emailHelpOptional: "Dikosongkan berarti kode peserta TIDAK dikirim ke mana pun. Potret layar setelah mendaftar.",
    phone: "Nomor telepon",
    company: "Perusahaan",
    jobTitle: "Jabatan",
    deviceUsed: "Perangkat ini pernah dipakai mendaftar di acara ini.",
    openCode: "Buka kode pendaftarannya",
    registerNow: "Daftar sekarang",
    sending: "Mengirim",
    consent: "Dengan mendaftar, Anda setuju data ini dipakai panitia untuk keperluan acara.",
    connectionLost: "Koneksi terputus. Pendaftaran Anda mungkin sudah tersimpan. Jangan mengisi ulang. Hubungi panitia untuk memastikan.",
    failed: "Pendaftaran gagal. Coba lagi.",
    successApproved: "Pendaftaran berhasil",
    successPending: "Pendaftaran diterima",
    messageApproved: "Simpan kode peserta Anda. Tunjukkan kode itu di meja registrasi saat hari acara.",
    messagePending: "Panitia akan memeriksa pendaftaran Anda, lalu menghubungi Anda lewat kontak yang diisi di atas.",
    emailSent: "Kode ini juga sudah dikirim ke email Anda, lengkap dengan QR-nya. Email bisa masuk folder spam, jadi simpan juga gambarnya.",
    emailNotSent: "Kode tidak dikirim lewat email. Simpan gambarnya sekarang, atau simpan tautan di bawah.",
    yourLink: "Tautan pendaftaran Anda",
    linkHelp: "Simpan atau kirim ke diri sendiri lewat WhatsApp. Alamat ini bisa dibuka kapan saja.",
    linkHelpPending: " Kode peserta muncul di sana begitu pendaftaran Anda disetujui.",
    notFoundTitle: "Acara tidak ditemukan",
    notFoundBody: "Tautan pendaftaran ini tidak menunjuk ke acara mana pun. Periksa kembali alamat yang Anda terima dari panitia.",
    closedTitle: "Pendaftaran ditutup",
    closedBody: (eventName) => `Pendaftaran untuk "${eventName}" sedang tidak dibuka. Hubungi panitia bila Anda merasa ini keliru.`,
    errors: {},
    field: {
      choose: "Pilih…",
      fileHelp: "PNG, JPG, WebP, atau PDF. Maksimal 5 MB.",
      fileTooLarge: "Ukuran berkas maksimal 5 MB.",
      fileFormat: "Format harus PNG, JPG, WebP, atau PDF.",
      uploadLost: "Koneksi terputus saat mengunggah. Coba lagi.",
      uploadRejected: "Berkas ditolak. Coba berkas lain.",
      uploading: "Mengunggah…",
      replaceFile: "Ganti berkas",
      chooseFile: "Pilih berkas",
    },
    code: {
      participantCode: "Kode peserta",
      preparing: "Menyiapkan…",
      saveOrShare: "Simpan atau bagikan kode",
      download: "Unduh kode",
      imageFailed: "Gambar gagal dibuat. Potret layar ini sebagai gantinya.",
      showAtDesk: "Tunjukkan kode ini di meja registrasi",
      qrAlt: (code) => `Kode QR peserta ${code}`,
    },
  },
  en: {
    registration: "Registration",
    eventPage: "Event page",
    backToEvent: "Back to the event page",
    navAria: "Event page",
    signIn: "Sign in",
    signInMemberArea: "Participant sign-in",
    managedBy: "Managed with Tally",
    personalData: "Your details",
    optionalNote: "Fields marked (optional) can be left empty.",
    alreadyRegistered: "Already registered?",
    optional: "(optional)",
    fullName: "Full name",
    email: "Email",
    emailHelpRequired: "The organisers use it to contact you. Each email can register only once.",
    emailHelpOptional: "Leave it empty and your participant code is NOT sent anywhere. Take a screenshot after registering.",
    phone: "Phone number",
    company: "Organisation",
    jobTitle: "Job title",
    deviceUsed: "This device has already been used to register for this event.",
    openCode: "Open that registration code",
    registerNow: "Register now",
    sending: "Sending",
    consent: "By registering, you agree that the organisers may use these details for this event.",
    connectionLost: "The connection dropped. Your registration may already be saved. Do not fill in the form again; contact the organisers to check.",
    failed: "Registration failed. Please try again.",
    successApproved: "You are registered",
    successPending: "Registration received",
    messageApproved: "Keep your participant code. Show it at the registration desk on the day of the event.",
    messagePending: "The organisers will review your registration and contact you using the details above.",
    emailSent: "We have also emailed you this code with its QR. It may land in your spam folder, so save the image as well.",
    emailNotSent: "The code was not sent by email. Save the image now, or save the link below.",
    yourLink: "Your registration link",
    linkHelp: "Save it, or send it to yourself on WhatsApp. You can open this address at any time.",
    linkHelpPending: " Your participant code appears there once your registration is approved.",
    notFoundTitle: "Event not found",
    notFoundBody: "This registration link does not point to any event. Check the address you received from the organisers.",
    closedTitle: "Registration is closed",
    closedBody: (eventName) => `Registration for "${eventName}" is not open. Contact the organisers if you think this is a mistake.`,
    errors: {
      REGISTRATION_DUPLICATE_EMAIL: "This email is already registered for this event. Contact the organisers if you have not received your participant code.",
      REGISTRATION_CLOSED: "Registration for this event has just closed.",
      RATE_LIMITED: "Too many registrations from this device. Wait 10 minutes, then try again.",
      VALIDATION_ERROR: "Some details are not valid. Check the form and try again.",
      INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
    },
    field: {
      choose: "Choose…",
      fileHelp: "PNG, JPG, WebP or PDF. Max 5 MB.",
      fileTooLarge: "The file must be 5 MB or smaller.",
      fileFormat: "The file must be PNG, JPG, WebP or PDF.",
      uploadLost: "The connection dropped while uploading. Please try again.",
      uploadRejected: "The file was rejected. Try another file.",
      uploading: "Uploading…",
      replaceFile: "Replace file",
      chooseFile: "Choose file",
    },
    code: {
      participantCode: "Participant code",
      preparing: "Preparing…",
      saveOrShare: "Save or share the code",
      download: "Download code",
      imageFailed: "The image could not be created. Take a screenshot of this screen instead.",
      showAtDesk: "Show this code at the registration desk",
      qrAlt: (code) => `Participant QR code ${code}`,
    },
  },
};
