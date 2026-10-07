import type { LandingLang } from "@/lib/landing-i18n";

/**
 * Teks portal peserta gaya gathering (DashboardGathering, rancangan pen.dev
 * Hanung 2026-10-07). Acara non-gathering memakai PESERTA_UI seperti biasa.
 */
export type PortalUiText = {
  portal: string;
  greeting: (jam: number) => string;
  tabs: { beranda: string; jadwal: string; info: string; profil: string };
  tabsAria: string;
  quick: { tiket: string; peta: string; panitia: string };
  quickAria: string;
  announcementsTitle: string;
  announcementsNote: string;
  isNew: string;
  pinned: string;
  noAnnouncements: string;
  seeAllInfo: string;
  nextUp: string;
  tomorrow: string;
  inMinutes: (menit: number) => string;
  now: string;
  next: string;
  yourBus: string;
  meetAt: (tempat: string) => string;
  yourRoom: string;
  withRoommate: (nama: string) => string;
  floor: (lantai: string) => string;
  roommates: string;
  room: (nomor: string) => string;
  todayRundown: string;
  dayRundown: (hari: number) => string;
  seeDays: (jumlah: number) => string;
  schedule: string;
  day: (hari: number) => string;
  daysAria: string;
  noSchedule: string;
  info: string;
  infoNote: string;
  ticket: string;
  ticketNote: string;
  roomRow: string;
  busRow: string;
  contactRow: string;
  languageRow: string;
  eventPageRow: string;
  signOut: string;
  qrTitle: string;
  qrClose: string;
  qrShow: string;
  qrShowNote: string;
  qrBrightness: string;
};

export const PORTAL_UI: Record<LandingLang, PortalUiText> = {
  id: {
    portal: "Portal peserta",
    greeting: (jam) => (jam < 11 ? "Selamat pagi," : jam < 15 ? "Selamat siang," : jam < 18 ? "Selamat sore," : "Selamat malam,"),
    tabs: { beranda: "Beranda", jadwal: "Jadwal", info: "Info", profil: "Profil" },
    tabsAria: "Menu portal",
    quick: { tiket: "Tiket", peta: "Peta", panitia: "Panitia" },
    quickAria: "Akses cepat",
    announcementsTitle: "Pengumuman panitia",
    announcementsNote: "Info terbaru dari panitia",
    isNew: "Baru",
    pinned: "Disematkan",
    noAnnouncements: "Belum ada pengumuman. Info dari panitia akan muncul di sini.",
    seeAllInfo: "Lihat semua",
    nextUp: "Agenda selanjutnya",
    tomorrow: "Besok",
    inMinutes: (menit) => (menit < 60 ? `${menit} menit lagi` : `${Math.round(menit / 60)} jam lagi`),
    now: "Berlangsung",
    next: "Berikutnya",
    yourBus: "Bus Anda",
    meetAt: (tempat) => `Titik kumpul: ${tempat}`,
    yourRoom: "Kamar Anda",
    withRoommate: (nama) => `dengan ${nama}`,
    floor: (lantai) => `Lantai ${lantai}`,
    roommates: "Teman sekamar",
    room: (nomor) => `Kamar ${nomor}`,
    todayRundown: "Rundown hari ini",
    dayRundown: (hari) => `Rundown hari ${hari}`,
    seeDays: (jumlah) => `Lihat ${jumlah} hari`,
    schedule: "Jadwal acara",
    day: (hari) => `Hari ${hari}`,
    daysAria: "Pilih hari",
    noSchedule: "Jadwal belum diterbitkan panitia.",
    info: "Info & pengumuman",
    infoNote: "Info terbaru dari panitia",
    ticket: "Tiket masuk",
    ticketNote: "Tunjukkan QR ke panitia saat check-in",
    roomRow: "Kamar & teman sekamar",
    busRow: "Jadwal bus",
    contactRow: "Hubungi panitia",
    languageRow: "English",
    eventPageRow: "Halaman acara",
    signOut: "Keluar",
    qrTitle: "QR kehadiran",
    qrClose: "Tutup",
    qrShow: "Tunjukkan QR ini ke panitia",
    qrShowNote: "untuk absen kehadiran dan check-in",
    qrBrightness: "Naikkan kecerahan layar supaya mudah dipindai.",
  },
  en: {
    portal: "Participant portal",
    greeting: (jam) => (jam < 12 ? "Good morning," : jam < 18 ? "Good afternoon," : "Good evening,"),
    tabs: { beranda: "Home", jadwal: "Schedule", info: "Info", profil: "Profile" },
    tabsAria: "Portal menu",
    quick: { tiket: "Ticket", peta: "Map", panitia: "Organisers" },
    quickAria: "Quick access",
    announcementsTitle: "Announcements",
    announcementsNote: "The latest from the organisers",
    isNew: "New",
    pinned: "Pinned",
    noAnnouncements: "No announcements yet. News from the organisers will appear here.",
    seeAllInfo: "See all",
    nextUp: "Up next",
    tomorrow: "Tomorrow",
    inMinutes: (menit) => (menit < 60 ? `in ${menit} min` : `in ${Math.round(menit / 60)} h`),
    now: "Happening now",
    next: "Next",
    yourBus: "Your bus",
    meetAt: (tempat) => `Meeting point: ${tempat}`,
    yourRoom: "Your room",
    withRoommate: (nama) => `with ${nama}`,
    floor: (lantai) => `Floor ${lantai}`,
    roommates: "Roommates",
    room: (nomor) => `Room ${nomor}`,
    todayRundown: "Today's rundown",
    dayRundown: (hari) => `Day ${hari} rundown`,
    seeDays: (jumlah) => `See ${jumlah} days`,
    schedule: "Schedule",
    day: (hari) => `Day ${hari}`,
    daysAria: "Choose a day",
    noSchedule: "The organisers have not published the schedule yet.",
    info: "Info & announcements",
    infoNote: "The latest from the organisers",
    ticket: "Entry ticket",
    ticketNote: "Show the QR to the organisers at check-in",
    roomRow: "Room & roommates",
    busRow: "Bus schedule",
    contactRow: "Contact the organisers",
    languageRow: "Bahasa Indonesia",
    eventPageRow: "Event page",
    signOut: "Sign out",
    qrTitle: "Attendance QR",
    qrClose: "Close",
    qrShow: "Show this QR to the organisers",
    qrShowNote: "for attendance and check-in",
    qrBrightness: "Turn up your screen brightness so it scans easily.",
  },
};
