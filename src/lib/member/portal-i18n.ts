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
  /** Tautan dari kartu rundown beranda ke seluruh jadwal. */
  seeSchedule: string;
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
  /** Gathering Horizon (rancangan V5, frame f13sV, pgOAT, eY05h). */
  horizon: {
    tabs: { beranda: string; jadwal: string; perjalanan: string; info: string; profil: string };
    /** Ponsel: Profil menjadi "Menu" (Perjalanan, kontak, bahasa, keluar). */
    tabsShort: { beranda: string; jadwal: string; perjalanan: string; info: string; profil: string };
    /** Halaman Perjalanan: hotel dan kamar, bus, tiket kereta. */
    travel: {
      note: string;
      empty: string;
      backToMenu: string;
      menuRow: string;
      hotelTitle: string;
      openMap: string;
      floor: string;
      roomType: string;
      checkIn: string;
      checkOut: string;
      busTitle: string;
      meetingPoint: string;
      /** Label bus di kartu Bus (judul kartunya sudah "Bus"). */
      mainBus: string;
      /** Baris tiket kereta di Beranda: "Kereta • Kam, 5 Nov". */
      trainRow: string;
      seatLine: (gerbong: string | null, kursi: string | null) => string | null;
    };
    /**
     * Halaman Outfit (dress code per hari dari Agenda). Labelnya per acara
     * (`member.outfit_label`, bawaan "Outfit"), jadi kalimat yang memuatnya
     * berupa fungsi. Alis baris Beranda ditampilkan huruf besar.
     */
    outfit: {
      note: string;
      empty: string;
      dayEmpty: string;
      menuRow: string;
      row: {
        hariIni: (label: string) => string;
        besok: (label: string) => string;
        pertama: (label: string) => string;
        terakhir: (label: string) => string;
        nanti: (label: string, hari: string) => string;
      };
    };
    welcome: string;
    heading: (namaDepan: string) => string;
    headingMobile: (namaDepan: string) => string;
    subtitle: (hari: number) => string;
    participant: string;
    hotel: string;
    /** Kartu tiket kereta (tabel train_tickets). */
    train: { title: string; outbound: string; return: string; carriage: string; seat: string; booking: string };
    bus: string;
    room: string;
    roommate: (jumlah: number) => string;
    nextUp: string;
    nextUpMobile: string;
    today: string;
    tomorrow: string;
    dayOrdinal: (hari: number) => string;
    showQr: string;
    enlargeQr: string;
    help: string;
    roommateTitle: (jumlah: number) => string;
    roomNo: (nomor: string) => string;
    profileAria: string;
  };
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
    seeSchedule: "Lihat semua jadwal",
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
    horizon: {
      tabs: { beranda: "Beranda", jadwal: "Jadwal", perjalanan: "Perjalanan", info: "Pengumuman", profil: "Profil" },
      tabsShort: { beranda: "Beranda", jadwal: "Jadwal", perjalanan: "Perjalanan", info: "Pengumuman", profil: "Menu" },
      travel: {
        note: "Hotel, kamar, bus, dan kereta kamu.",
        empty: "Info perjalanan belum dibagikan panitia.",
        backToMenu: "Menu",
        menuRow: "Hotel, kamar, bus, kereta",
        hotelTitle: "Hotel & kamar",
        openMap: "Buka di Google Maps",
        floor: "Lantai",
        roomType: "Tipe kamar",
        checkIn: "Check-in",
        checkOut: "Check-out",
        busTitle: "Bus",
        meetingPoint: "Titik kumpul",
        mainBus: "Bus utama",
        trainRow: "Kereta",
        seatLine: (gerbong, kursi) => [gerbong ? `Gerbong ${gerbong}` : null, kursi ? `kursi ${kursi}` : null].filter(Boolean).join(", ") || null,
      },
      outfit: {
        note: "Pakaian tiap hari, dari panitia.",
        empty: "Panitia belum membagikan pakaian untuk acara ini.",
        dayEmpty: "Tidak ada ketentuan pakaian khusus.",
        menuRow: "Pakaian tiap hari",
        row: {
          hariIni: (label) => `${label} hari ini`,
          besok: (label) => `${label} besok`,
          pertama: (label) => `${label} hari pertama`,
          terakhir: (label) => `${label} hari terakhir`,
          nanti: (label, hari) => `${label} • ${hari}`,
        },
      },
      welcome: "Perjalananmu dimulai di sini",
      heading: (nama) => `${nama}, siap bikin cerita baru?`,
      headingMobile: (nama) => `${nama},\nini perjalananmu.`,
      subtitle: (hari) =>
        hari > 0
          ? `Tiket, teman perjalanan, dan ${["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh"][hari] ?? hari} hari yang menunggumu.`
          : "Tiket, teman perjalanan, dan agenda yang menunggumu.",
      participant: "Peserta",
      hotel: "Hotel",
      train: { title: "Tiket kereta", outbound: "Berangkat", return: "Pulang", carriage: "Gerbong", seat: "Kursi", booking: "Kode booking" },
      bus: "Bus",
      room: "Kamar",
      roommate: (jumlah) => (jumlah > 1 ? "Teman-teman sekamar" : "Teman sekamar"),
      nextUp: "Selanjutnya",
      nextUpMobile: "Agenda berikutnya",
      today: "Hari ini",
      tomorrow: "Besok",
      dayOrdinal: (hari) => `Hari ${["pertama", "kedua", "ketiga", "keempat", "kelima", "keenam", "ketujuh"][hari - 1] ?? `ke-${hari}`}`,
      showQr: "Tampilkan QR kehadiran",
      enlargeQr: "Perbesar",
      help: "Butuh bantuan? Hubungi panitia",
      roommateTitle: (jumlah) => (jumlah > 1 ? "Teman-teman sekamarmu" : "Teman sekamarmu"),
      roomNo: (nomor) => `Kamar ${nomor}`,
      profileAria: "Profil",
    },
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
    seeSchedule: "See full schedule",
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
    horizon: {
      tabs: { beranda: "Home", jadwal: "Schedule", perjalanan: "Travel", info: "Updates", profil: "Profile" },
      tabsShort: { beranda: "Home", jadwal: "Schedule", perjalanan: "Travel", info: "Updates", profil: "Menu" },
      travel: {
        note: "Your hotel, room, bus, and train.",
        empty: "The organisers haven't shared travel details yet.",
        backToMenu: "Menu",
        menuRow: "Hotel, room, bus, train",
        hotelTitle: "Hotel & room",
        openMap: "Open in Google Maps",
        floor: "Floor",
        roomType: "Room type",
        checkIn: "Check-in",
        checkOut: "Check-out",
        busTitle: "Bus",
        meetingPoint: "Meeting point",
        mainBus: "Main bus",
        trainRow: "Train",
        seatLine: (gerbong, kursi) => [gerbong ? `Carriage ${gerbong}` : null, kursi ? `seat ${kursi}` : null].filter(Boolean).join(", ") || null,
      },
      outfit: {
        note: "What to wear each day, from the organisers.",
        empty: "The organisers haven't shared what to wear yet.",
        dayEmpty: "No set dress code.",
        menuRow: "What to wear each day",
        row: {
          hariIni: (label) => `Today's ${label}`,
          besok: (label) => `Tomorrow's ${label}`,
          pertama: (label) => `Day one ${label}`,
          terakhir: (label) => `Last day ${label}`,
          nanti: (label, hari) => `${label} • ${hari}`,
        },
      },
      welcome: "Your journey starts here",
      heading: (nama) => `${nama}, ready for a new story?`,
      headingMobile: (nama) => `${nama},\nthis is your trip.`,
      subtitle: (hari) =>
        hari > 0
          ? `Your ticket, travel mates, and ${["", "one day", "two days", "three days", "four days", "five days", "six days", "seven days"][hari] ?? `${hari} days`} ahead.`
          : "Your ticket, travel mates, and the agenda ahead.",
      participant: "Participant",
      hotel: "Hotel",
      train: { title: "Train tickets", outbound: "Outbound", return: "Return", carriage: "Carriage", seat: "Seat", booking: "Booking code" },
      bus: "Bus",
      room: "Room",
      roommate: (jumlah) => (jumlah > 1 ? "Roommates" : "Roommate"),
      nextUp: "Next up",
      nextUpMobile: "Next on the agenda",
      today: "Today",
      tomorrow: "Tomorrow",
      dayOrdinal: (hari) => `Day ${["one", "two", "three", "four", "five", "six", "seven"][hari - 1] ?? hari}`,
      showQr: "Show attendance QR",
      enlargeQr: "Enlarge",
      help: "Need help? Contact the organisers",
      roommateTitle: (jumlah) => (jumlah > 1 ? "Your roommates" : "Your roommate"),
      roomNo: (nomor) => `Room ${nomor}`,
      profileAria: "Profile",
    },
  },
};
