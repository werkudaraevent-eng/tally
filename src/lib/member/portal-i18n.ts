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
    /** Ponsel: Profil menjadi "Menu" (Perjalanan, kontak, bahasa, keluar), dan
     * "Susunan acara" menjadi "Acara" supaya satu baris di layar 360 px. */
    tabsShort: { beranda: string; jadwal: string; perjalanan: string; info: string; profil: string };
    /** Halaman Perjalanan: hotel dan kamar, bus, tiket kereta. */
    travel: {
      /** Dengan zona waktu jam check-in, bus, dan kereta (U-24). */
      note: (zona: string) => string;
      empty: string;
      backToMenu: string;
      hotelTitle: string;
      floor: string;
      roomType: string;
      checkIn: string;
      checkOut: string;
      busTitle: string;
      meetingPoint: string;
      /** Label bus di kartu Bus (judul kartunya sudah "Bus"). "Bus utama" hanya bila ada perjalanan dengan bus lain (U-33). */
      mainBus: string;
      onlyBus: string;
      plate: string;
      crew: string;
      trips: string;
      /** Peta titik kumpul (E-12). */
      openMeetingMap: string;
      /** Berkas kalender per tiket kereta (E-07). */
      addToCalendar: string;
      call: string;
      whatsapp: string;
      /** Label aksesibel tombol kontak kru, mis. "Telepon kru Bus 3". */
      contactLabel: (aksi: string, bus: string) => string;
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
    /** Nama aksesibel inisial di bilah atas, memuat teks yang terlihat ("HS, Profil"). */
    profileAriaWith: (inisial: string) => string;
    /** Lencana angka di tab Pengumuman. */
    unread: (jumlah: number) => string;
    /** Garis kemajuan saat pindah tab. */
    loading: string;
    /** Kartu Berlangsung dan Berikutnya di Beranda (U-05, E-06). */
    agenda: {
      now: string;
      until: (jam: string) => string;
      next: string;
      inTime: (menit: number) => string;
      seeSchedule: (label: string | null) => string;
      seeDay: (hari: string) => string;
      tripLink: string;
    };
    /** Pengumuman di Beranda: yang belum dibaca dulu (U-03). */
    pinnedMore: (jumlah: number) => string;
    /** Baris Simpan QR ke galeri menjelang keberangkatan (U-02). */
    saveQrRow: { eyebrow: string; title: string; note: string; failed: string };
    /** Kartu Hubungi panitia (U-07). */
    helpCard: { eyebrow: string; title: string; note: string; noteEmail: string; noteTravel: string; noteProfile: string; email: string };
    /** Judul kartu darurat bila blok panitia tanpa judul (E-03). */
    emergency: string;
    /** Tombol peta pada kontak darurat (E-03). */
    emergencyMap: string;
    /** Fakta pass sebagai tautan ke Perjalanan (U-16): "Detail perjalanan: hotel, bus, kereta". */
    travelDetails: (isi: string) => string;
    travelParts: { hotel: string; bus: string; train: string };
    subtitleDates: (tanggal: string, adaKamar: boolean) => string;
    /** Layar QR (U-20, U-28, U-02). */
    qr: {
      codeLabel: string;
      save: string;
      showNote: string;
      showNoteCheckpoint: string;
      saved: string;
      savedAt: (waktu: string) => string;
      awake: string;
      offline: string;
      offlineNote: string;
      showQr: string;
      retry: string;
    };
    /** Jadwal (U-06, U-01, U-24). */
    schedule: { timeNote: (zona: string) => string; part: (n: number) => string; partsAria: string };
    /** Halaman Profil Horizon: kartu tiket, data diri, bantuan dan pengaturan. */
    profile: {
      note: string;
      ticketHint: string;
      enlarge: string;
      details: string;
      name: string;
      email: string;
      company: string;
      jobTitle: string;
      wrong: string;
      contact: string;
      help: string;
      language: string;
      menu: string;
    };
  };
};

export const PORTAL_UI: Record<LandingLang, PortalUiText> = {
  id: {
    portal: "Dashboard saya",
    greeting: (jam) => (jam < 11 ? "Selamat pagi," : jam < 15 ? "Selamat siang," : jam < 18 ? "Selamat sore," : "Selamat malam,"),
    tabs: { beranda: "Beranda", jadwal: "Susunan acara", info: "Info", profil: "Profil" },
    tabsAria: "Menu portal",
    quick: { tiket: "QR", peta: "Peta", panitia: "Panitia" },
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
    todayRundown: "Susunan acara hari ini",
    dayRundown: (hari) => `Susunan acara hari ${hari}`,
    seeSchedule: "Lihat semua",
    schedule: "Susunan acara",
    day: (hari) => `Hari ${hari}`,
    daysAria: "Pilih hari",
    noSchedule: "Susunan acara belum diterbitkan panitia.",
    info: "Info & pengumuman",
    infoNote: "Info terbaru dari panitia",
    ticket: "QR kehadiran",
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
      tabs: { beranda: "Beranda", jadwal: "Susunan acara", perjalanan: "Perjalanan", info: "Pengumuman", profil: "Profil" },
      tabsShort: { beranda: "Beranda", jadwal: "Acara", perjalanan: "Perjalanan", info: "Pengumuman", profil: "Menu" },
      travel: {
        note: (zona) => `Hotel, kamar, bus, dan kereta kamu. Semua jam ${zona}.`,
        empty: "Info perjalanan belum dibagikan panitia.",
        backToMenu: "Menu",
        hotelTitle: "Hotel & kamar",
        floor: "Lantai",
        roomType: "Tipe kamar",
        checkIn: "Check-in",
        checkOut: "Check-out",
        busTitle: "Bus",
        meetingPoint: "Titik kumpul",
        mainBus: "Bus utama",
        onlyBus: "Bus",
        plate: "Pelat nomor",
        crew: "Kru bus",
        trips: "Perjalanan bus",
        openMeetingMap: "Buka peta",
        addToCalendar: "Simpan ke kalender",
        call: "Telepon",
        whatsapp: "WhatsApp",
        contactLabel: (aksi, bus) => `${aksi} kru ${bus}`,
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
          ? `Teman perjalanan dan ${["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh"][hari] ?? hari} hari yang menunggumu.`
          : "Teman perjalanan dan susunan acara yang menunggumu.",
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
      profileAriaWith: (inisial) => `${inisial}, Profil dan menu`,
      unread: (jumlah) => `${jumlah} belum dibaca`,
      loading: "Memuat halaman",
      agenda: {
        now: "Berlangsung",
        until: (jam) => `sampai ${jam}`,
        next: "Berikutnya",
        inTime: (menit) => {
          if (menit < 60) return `${menit} menit lagi`;
          const jam = Math.floor(menit / 60);
          return menit % 60 ? `${jam} jam ${menit % 60} menit lagi` : `${jam} jam lagi`;
        },
        seeSchedule: (label) => (label ? `Lihat susunan acara ${label}` : "Lihat susunan acara"),
        seeDay: (hari) => `Lihat susunan acara ${hari}`,
        tripLink: "Bus dan titik kumpul ada di Perjalanan",
      },
      pinnedMore: (jumlah) => `+${jumlah} disematkan`,
      saveQrRow: { eyebrow: "Sebelum berangkat", title: "Simpan QR ke galeri", note: "Tetap bisa ditunjukkan tanpa sinyal.", failed: "Gambar QR gagal dibuat. Buka QR lalu coba lagi." },
      helpCard: {
        eyebrow: "Butuh bantuan?",
        title: "Hubungi panitia",
        note: "Langsung ke panitia lewat telepon atau WhatsApp.",
        noteEmail: "Kirim email ke panitia.",
        noteTravel: "Tertinggal rombongan atau ada kendala di perjalanan.",
        noteProfile: "Ada data yang salah atau butuh bantuan?",
        email: "Email",
      },
      emergency: "Darurat dan bantuan",
      emergencyMap: "Peta",
      travelDetails: (isi) => (isi ? `Detail perjalanan: ${isi}` : "Detail perjalanan"),
      travelParts: { hotel: "hotel", bus: "bus", train: "kereta" },
      subtitleDates: (tanggal, adaKamar) => (adaKamar ? `Kamar dan susunan acaramu untuk ${tanggal}.` : `Susunan acaramu untuk ${tanggal}.`),
      qr: {
        codeLabel: "Kode, bila QR tidak terbaca",
        save: "Simpan QR ke galeri",
        showNote: "saat registrasi",
        showNoteCheckpoint: "saat registrasi dan di setiap checkpoint",
        saved: "Tersimpan di ponsel ini, bisa dibuka tanpa sinyal",
        savedAt: (waktu) => `Tersimpan ${waktu} di ponsel ini`,
        awake: "Layar tetap menyala selama QR terbuka.",
        offline: "Kamu sedang offline.",
        offlineNote: "QR yang tersimpan tetap bisa ditunjukkan ke panitia.",
        showQr: "Tampilkan QR",
        retry: "Coba lagi",
      },
      schedule: { timeNote: (zona) => `semua jam ${zona}`, part: (n) => `Bagian ${n}`, partsAria: "Pilih bagian" },
      profile: {
        note: "QR kehadiran, data diri, dan bantuan acara.",
        // Tanda hubung tak terputus (U+2011): "check-in" tidak terpotong di akhir baris (U-33).
        ticketHint: "Tunjukkan QR ini saat check‑in.",
        enlarge: "Tampilkan QR",
        details: "Data diri",
        name: "Nama lengkap",
        email: "Email",
        company: "Instansi",
        jobTitle: "Jabatan",
        wrong: "Ada data yang salah?",
        contact: "Hubungi panitia",
        help: "Bantuan dan pengaturan",
        language: "Bahasa",
        menu: "Menu",
      },
    },
  },
  en: {
    portal: "My dashboard",
    greeting: (jam) => (jam < 12 ? "Good morning," : jam < 18 ? "Good afternoon," : "Good evening,"),
    tabs: { beranda: "Home", jadwal: "Schedule", info: "Info", profil: "Profile" },
    tabsAria: "Portal menu",
    quick: { tiket: "QR", peta: "Map", panitia: "Organisers" },
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
    todayRundown: "Today's schedule",
    dayRundown: (hari) => `Day ${hari} schedule`,
    seeSchedule: "See all",
    schedule: "Schedule",
    day: (hari) => `Day ${hari}`,
    daysAria: "Choose a day",
    noSchedule: "The organisers have not published the schedule yet.",
    info: "Info & announcements",
    infoNote: "The latest from the organisers",
    ticket: "Attendance QR",
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
        note: (zona) => `Your hotel, room, bus, and train. All times ${zona}.`,
        empty: "The organisers haven't shared travel details yet.",
        backToMenu: "Menu",
        hotelTitle: "Hotel & room",
        floor: "Floor",
        roomType: "Room type",
        checkIn: "Check-in",
        checkOut: "Check-out",
        busTitle: "Bus",
        meetingPoint: "Meeting point",
        mainBus: "Main bus",
        onlyBus: "Bus",
        plate: "Plate number",
        crew: "Bus crew",
        trips: "Bus trips",
        openMeetingMap: "Open map",
        addToCalendar: "Add to calendar",
        call: "Call",
        whatsapp: "WhatsApp",
        contactLabel: (aksi, bus) => `${aksi} the ${bus} crew`,
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
          ? `Your travel mates and ${["", "one day", "two days", "three days", "four days", "five days", "six days", "seven days"][hari] ?? `${hari} days`} ahead.`
          : "Your travel mates and the schedule ahead.",
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
      profileAriaWith: (inisial) => `${inisial}, Profile and menu`,
      unread: (jumlah) => `${jumlah} unread`,
      loading: "Loading page",
      agenda: {
        now: "Happening now",
        until: (jam) => `until ${jam}`,
        next: "Next up",
        inTime: (menit) => {
          if (menit < 60) return `in ${menit} min`;
          const jam = Math.floor(menit / 60);
          return menit % 60 ? `in ${jam} h ${menit % 60} min` : `in ${jam} h`;
        },
        seeSchedule: (label) => (label ? `See the ${label} schedule` : "See the schedule"),
        seeDay: (hari) => `See ${hari}`,
        tripLink: "Your bus and meeting point are in Travel",
      },
      pinnedMore: (jumlah) => `+${jumlah} pinned`,
      saveQrRow: { eyebrow: "Before you leave", title: "Save QR to your photos", note: "You can show it without signal.", failed: "Couldn't create the QR image. Open the QR and try again." },
      helpCard: {
        eyebrow: "Need help?",
        title: "Contact the organisers",
        note: "Reach the organisers by phone or WhatsApp.",
        noteEmail: "Email the organisers.",
        noteTravel: "Left behind or having trouble on the way?",
        noteProfile: "Wrong details or need help?",
        email: "Email",
      },
      emergency: "Emergency and help",
      emergencyMap: "Map",
      travelDetails: (isi) => (isi ? `Travel details: ${isi}` : "Travel details"),
      travelParts: { hotel: "hotel", bus: "bus", train: "train" },
      subtitleDates: (tanggal, adaKamar) => (adaKamar ? `Your room and schedule for ${tanggal}.` : `Your schedule for ${tanggal}.`),
      qr: {
        codeLabel: "Code, if the QR won't scan",
        save: "Save QR to your photos",
        showNote: "at registration",
        showNoteCheckpoint: "at registration and at every checkpoint",
        saved: "Saved on this phone, opens without signal",
        savedAt: (waktu) => `Saved on this phone ${waktu}`,
        awake: "Your screen stays on while the QR is open.",
        offline: "You're offline.",
        offlineNote: "The saved QR can still be shown to the organisers.",
        showQr: "Show QR",
        retry: "Try again",
      },
      schedule: { timeNote: (zona) => `all times ${zona}`, part: (n) => `Part ${n}`, partsAria: "Choose a part" },
      profile: {
        note: "Attendance QR, details and event help.",
        ticketHint: "Show this QR at check‑in.",
        enlarge: "Show QR",
        details: "Your details",
        name: "Full name",
        email: "Email",
        company: "Organisation",
        jobTitle: "Job title",
        wrong: "Something wrong?",
        contact: "Contact the organisers",
        help: "Help and settings",
        language: "Language",
        menu: "Menu",
      },
    },
  },
};
