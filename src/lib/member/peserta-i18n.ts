import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Teks area peserta (Dashboard saya, halaman kode, pita konfirmasi email).
 *
 * Versi English ada di `/e/<slug>/en/peserta` dan `/e/<slug>/en/kode/<token>`,
 * hanya untuk acara yang versi English-nya menyala (tata letak Modern). Teks
 * Indonesia di sini sama persis dengan yang sebelumnya ditulis langsung di
 * halamannya: halaman Indonesia tidak berubah satu piksel pun.
 *
 * Isian panitia (judul pengumuman, nama kursi, nama sesi) tidak diterjemahkan:
 * ditulis panitia dalam satu bahasa.
 */
export type PesertaUiText = {
  dashboardEyebrow: string;
  hello: (namaDepan: string) => string;
  status: { approved: string; rejected: string; pending: string };
  emailConfirmed: string;
  confirmLinkUsed: string;
  confirmEmail: (email: string) => string;
  resend: string;
  resending: string;
  resent: string;
  resendFailed: string;
  resendRateLimited: string;
  resendNotConfigured: string;
  rejectedTitle: string;
  rejectedBody: string;
  pendingTitle: string;
  pendingBody: string;
  ticketEyebrow: string;
  showAtDesk: string;
  yourSeat: string;
  seat: string;
  seatPending: string;
  viewSeatingPlan: string;
  quickLinksAria: string;
  vote: { judul: string; isi: string };
  feedback: { judul: string; isi: string };
  map: { judul: string; isiCadangan: string };
  seatingPlan: { judul: string; isi: string };
  fromOrganisers: string;
  noAnnouncements: string;
  newPrefix: string;
  agendaEyebrow: string;
  fullScreen: string;
  backToEventPage: string;
  /** Halaman kode (/kode/<token>). */
  kode: {
    title: string;
    eventPage: string;
    registered: string;
    keepLink: string;
    rejectedTitle: string;
    rejectedBody: string;
    pendingTitle: string;
    pendingBody: { sebelum: string; sesudah: string };
  };
};

export const PESERTA_UI: Record<LandingLang, PesertaUiText> = {
  id: {
    dashboardEyebrow: "Dashboard peserta",
    hello: (namaDepan) => `Halo, ${namaDepan}`,
    status: { approved: "Terdaftar", rejected: "Tidak disetujui", pending: "Menunggu persetujuan" },
    emailConfirmed: "Email Anda terkonfirmasi.",
    confirmLinkUsed: "Tautan konfirmasi itu sudah dipakai atau kedaluwarsa. ",
    confirmEmail: (email) => `Konfirmasi email ${email} lewat tautan yang kami kirim, supaya akun ini bisa dipulihkan bila Anda lupa kata sandi.`,
    resend: "Kirim ulang",
    resending: "Mengirim...",
    resent: " Tautan baru sudah kami kirim.",
    resendFailed: "Belum terkirim. Coba lagi sebentar lagi.",
    resendRateLimited: "Tautan sudah dikirim beberapa kali. Periksa folder spam, atau coba lagi dalam 15 menit.",
    resendNotConfigured: "Pengiriman email belum aktif untuk acara ini.",
    rejectedTitle: "Pendaftaran tidak disetujui",
    rejectedBody: "Panitia tidak menyetujui pendaftaran Anda untuk acara ini. Hubungi panitia bila Anda merasa ini keliru.",
    pendingTitle: "Menunggu persetujuan panitia",
    pendingBody: "Kode QR untuk meja registrasi muncul di sini setelah panitia menyetujui pendaftaran Anda. Kami juga mengabari Anda lewat email.",
    ticketEyebrow: "Tiket masuk",
    showAtDesk: "Tunjukkan di meja registrasi",
    yourSeat: "Kursi Anda",
    seat: "Kursi",
    seatPending: "Kursi belum ditentukan panitia. Halaman ini diperbarui begitu kursinya diatur.",
    viewSeatingPlan: "Lihat denah",
    quickLinksAria: "Tautan acara",
    vote: { judul: "Voting langsung", isi: "Terbuka saat sesi berlangsung. Kode Anda sudah terisi." },
    feedback: { judul: "Umpan balik", isi: "Dibuka di tab baru." },
    map: { judul: "Lokasi & peta", isiCadangan: "Buka peta lokasi acara." },
    seatingPlan: { judul: "Denah kursi", isi: "Cari meja dan kursi Anda." },
    fromOrganisers: "Dari panitia",
    noAnnouncements: "Belum ada pengumuman. Kabar dari panitia muncul di sini.",
    newPrefix: "Baru: ",
    agendaEyebrow: "Susunan acara",
    fullScreen: "Layar penuh",
    backToEventPage: "Kembali ke halaman acara",
    kode: {
      title: "Kode peserta",
      eventPage: "Halaman acara",
      registered: "Terdaftar",
      keepLink: "Simpan alamat halaman ini. Ia bisa dibuka kapan saja sampai acara selesai.",
      rejectedTitle: "Pendaftaran tidak disetujui",
      rejectedBody: "Hubungi panitia bila Anda merasa ini keliru.",
      pendingTitle: "Menunggu persetujuan",
      pendingBody: {
        sebelum: "Pendaftaran atas nama ",
        sesudah: " sudah masuk dan sedang diperiksa panitia. Buka halaman ini lagi nanti — kode peserta muncul di sini begitu pendaftarannya disetujui.",
      },
    },
  },
  en: {
    dashboardEyebrow: "Participant dashboard",
    hello: (namaDepan) => `Hello, ${namaDepan}`,
    status: { approved: "Registered", rejected: "Not approved", pending: "Awaiting approval" },
    emailConfirmed: "Your email is confirmed.",
    confirmLinkUsed: "That confirmation link has already been used or has expired. ",
    confirmEmail: (email) => `Confirm ${email} using the link we sent, so you can recover this account if you forget your password.`,
    resend: "Resend",
    resending: "Sending...",
    resent: " We have sent a new link.",
    resendFailed: "Not sent yet. Please try again shortly.",
    resendRateLimited: "The link has been sent several times. Check your spam folder, or try again in 15 minutes.",
    resendNotConfigured: "Email sending is not set up for this event yet.",
    rejectedTitle: "Registration not approved",
    rejectedBody: "The organisers did not approve your registration for this event. Contact them if you think this is a mistake.",
    pendingTitle: "Awaiting approval from the organisers",
    pendingBody: "Your QR code for the registration desk appears here once the organisers approve your registration. We will also let you know by email.",
    ticketEyebrow: "Entry ticket",
    showAtDesk: "Show this at the registration desk",
    yourSeat: "Your seat",
    seat: "Seat",
    seatPending: "The organisers have not assigned seats yet. This page updates as soon as they do.",
    viewSeatingPlan: "View seating plan",
    quickLinksAria: "Event links",
    vote: { judul: "Live voting", isi: "Opens during the session. Your code is already filled in." },
    feedback: { judul: "Feedback", isi: "Opens in a new tab." },
    map: { judul: "Venue & map", isiCadangan: "Open the venue map." },
    seatingPlan: { judul: "Seating plan", isi: "Find your table and seat." },
    fromOrganisers: "From the organisers",
    noAnnouncements: "No announcements yet. News from the organisers appears here.",
    newPrefix: "New: ",
    agendaEyebrow: "Agenda",
    fullScreen: "Full screen",
    backToEventPage: "Back to the event page",
    kode: {
      title: "Participant code",
      eventPage: "Event page",
      registered: "Registered",
      keepLink: "Keep the address of this page. You can open it any time until the event ends.",
      rejectedTitle: "Registration not approved",
      rejectedBody: "Contact the organisers if you think this is a mistake.",
      pendingTitle: "Awaiting approval",
      pendingBody: {
        sebelum: "The registration for ",
        sesudah: " has been received and is being reviewed by the organisers. Open this page again later. Your participant code appears here as soon as the registration is approved.",
      },
    },
  },
};
