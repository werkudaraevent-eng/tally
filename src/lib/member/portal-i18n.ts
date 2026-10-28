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
  /** Hotel sudah, nomor kamar belum (Logistics > Hotel only). */
  roomPending: string;
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
      /** Kepala kartu hotel pertama; jumlah malam tampil di kanan kepala. */
      hotelCard: string;
      nights: (jumlah: number) => string;
      /** Kepala kartu hotel berikutnya bagi peserta yang pindah hotel. */
      moveTitle: string;
      floor: string;
      roomType: string;
      checkIn: string;
      checkOut: string;
      busTitle: string;
      meetingPoint: string;
      /** Label bus di kartu Bus (judul kartunya sudah "Bus"). "Bus utama" hanya bila ada perjalanan dengan bus lain (U-33). */
      mainBus: string;
      /** Di kanan kepala kartu Bus, mis. "4 perjalanan". */
      tripCount: (jumlah: number) => string;
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
      seatLine: (gerbong: string | null, kursi: string | null) => string | null;
      /** Chip lompat di atas Perjalanan (3 bagian atau lebih). */
      jump: { aria: string; hotel: string; bus: string; train: string; luggage: string; routes: string };
      /** Yang sudah lewat dilipat jadi satu baris. */
      done: string;
      stayDone: (dari: string, sampai: string) => string;
      tripsDone: (jumlah: number) => string;
      /** Kartu Bagasi: jumlah dan foto yang dicatat petugas di meja bagasi (Record luggage). */
      luggage: {
        title: string;
        count: (jumlah: number) => string;
        none: string;
        countLabel: string;
        droppedAt: string;
        place: string;
        check: string;
        /** Sesudah diserahkan di meja ambil (migrasi 202610240001). */
        received: string;
        /** Di kanan kepala kartu sebelum diambil. */
        stored: string;
        pickedUpAt: string;
        checkAfter: string;
        openPhoto: string;
        enlarge: string;
        close: string;
      };
    };
    /**
     * Halaman Outfit (dress code per hari dari Agenda), bagian dari Susunan
     * acara. Labelnya per acara (`member.outfit_label`, bawaan "Outfit"), jadi
     * kalimat yang memuatnya berupa fungsi. Alis baris Beranda ditampilkan
     * huruf besar.
     */
    outfit: {
      note: string;
      empty: string;
      dayEmpty: string;
      /** Baris Menu bila Jadwal disembunyikan (Outfit tidak di bawah Susunan acara). */
      menuRow: string;
      /** Chip di judul hari yang sedang berlangsung. */
      today: string;
      /** Bagian milik peserta (Agenda > Who it's for): "Untuk Batch 2, sesuai jadwalmu." */
      yours: (kelompok: string) => string;
      /** Bagian kelompok lain: "Ini untuk Batch 1. Kamu terdaftar di Batch 2." */
      notYours: (bagian: string, kelompok: string) => string;
      /** Tautan ke bagian milik peserta: "Lihat Outfit Batch 2". */
      seeYours: (label: string, bagian: string) => string;
      /** Foto contoh: label pembuka layar penuh, teks tombolnya (desktop), dan tombol tutup. */
      openPhoto: (apa: string) => string;
      viewPhoto: string;
      /** Pilihan gaya: label di atas kartu pilihan ("Pilih salah satu · 4 gaya") dan ringkasannya ("4 pilihan"). */
      options: (jumlah: number) => string;
      optionsShort: (jumlah: number) => string;
      /** Tombol penampil layar penuh di antara pilihan. */
      prevPhoto: string;
      nextPhoto: string;
      /** Pil di pojok foto (ponsel dan tablet). */
      enlarge: string;
      closePhoto: string;
      /** Label waktu isian seharian (tanpa baris agenda dan tanpa waktu). */
      allDay: string;
      /** Aksi di kepala kartu outfit Susunan acara: "Lihat". */
      see: string;
      /** Label baris Setiap hari (Participant area) di depan baris tiap hari: "Setiap hari · Kaos KSO". */
      everyDay: string;
      /** Label baris hari berikutnya di bawah kartu: "Berikutnya · Min, 8 Nov". */
      next: string;
      row: {
        hariIni: (label: string) => string;
        besok: (label: string) => string;
        pertama: (label: string) => string;
        terakhir: (label: string) => string;
        nanti: (label: string, hari: string) => string;
      };
    };
    participant: string;
    hotel: string;
    /** Kartu tiket kereta (tabel train_tickets). */
    /** count dan done: di kanan kepala kartu Tiket kereta. */
    train: { title: string; outbound: string; return: string; carriage: string; seat: string; booking: string; count: (jumlah: number) => string; done: string; to: string };
    /** Tema Gathering Trip (keputusan Mas 28 Okt 2026): teks yang hanya dipakai tema itu. */
    trip: {
      plan: string;
      /** Lama perjalanan kereta dari jam berangkat dan tiba, mis. "5j 40m". */
      duration: (menit: number) => string;
      hotelN: (urut: number) => string;
      hotels: (jumlah: number) => string;
      trainLeg: (dari: string, ke: string) => string;
      checkInAt: (hotel: string) => string;
      moveTo: (hotel: string) => string;
      checkOutAt: (hotel: string) => string;
      copy: string;
      copied: string;
      next: string;
      /** Kartu peserta di Beranda dengan sobekan QR. */
      pass: string;
      show: string;
      seeAll: string;
      /** Jumlah kegiatan di kartu hari Susunan acara ("9 kegiatan"). */
      activities: (jumlah: number) => string;
      noNewsTitle: string;
      noNewsBody: string;
      pinned: string;
      qrNote: string;
    };
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
    roomNo: (nomor: string) => string;
    /** Nilai Kamar bila nomornya belum ada. */
    roomPending: string;
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
      tripLink: string;
      /** Tautan baris Agenda ke rute yang menautkannya, di Perjalanan. */
      routeLink: string;
    };
    /** Pengumuman di Beranda: yang belum dibaca dulu (U-03). */
    pinnedMore: (jumlah: number) => string;
    /** Baris Simpan QR ke galeri menjelang keberangkatan (U-02). */
    saveQrRow: { eyebrow: string; title: string; note: string; failed: string };
    /** Kartu Hubungi panitia (U-07). */
    helpCard: { eyebrow: string; title: string; emergencyRow: string; note: string; noteEmail: string; noteTravel: string; noteProfile: string; email: string };
    /** Judul kartu darurat bila blok panitia tanpa judul (E-03). */
    emergency: string;
    /** Tombol peta pada kontak darurat (E-03). */
    emergencyMap: string;
    /**
     * Beranda "Hari ini" (keputusan Mas 20 Okt): satu judul di ponsel dan
     * desktop (U-09), dan isi yang berganti sebelum, saat, dan sesudah acara.
     */
    home: {
      heading: (namaDepan: string) => string;
      /** Fase sesudah tanggal hari ini di atas judul: "Sabtu, 7 November · hari ke-2 dari 3". */
      dayOf: (hariKe: number, lama: number) => string;
      inDays: (hari: number) => string;
      /** `berangkat`: peserta punya info perjalanan (hotel, bus, atau kereta). */
      tomorrow: (berangkat: boolean) => string;
      today: (berangkat: boolean) => string;
      ended: string;
      timeNote: (zona: string) => string;
      /** Kartu Sekarang dan berikutnya: tautan ke susunan acara hari itu. */
      scheduleToday: string;
      scheduleDay: (hari: string) => string;
      /** Kartu dresscode: "Lihat semua", dan batch peserta hari ini ("Untuk Batch 2"). */
      seeAll: string;
      forGroup: (kelompok: string) => string;
      /** Kartu Perjalananmu, pengganti kartu perjalanan selama acara. */
      travelTitle: string;
      travelLink: string;
      roommates: (nama: string, jumlah: number) => string;
      trainNext: (pulang: boolean) => string;
      /** Fakta kartu perjalanan sebelum berangkat: jam kereta berangkat. */
      departs: string;
      /** Kartu perjalanan: tanggal acara di samping tanggal perjalanan peserta bila berbeda ("Acara 6–8 Nov"). */
      eventDates: (tanggal: string) => string;
      /** Kartu pengumuman: label di samping waktunya, dan tautan ke tab Pengumuman. */
      announcement: string;
      allAnnouncements: string;
    };
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
    schedule: {
      part: (n: number) => string;
      partsAria: string;
      /** Bagian milik peserta (Agenda > Who it's for), mis. "Batch 2". */
      yours: (kelompok: string) => string;
      notYours: (kelompok: string) => string;
      seeYours: (label: string) => string;
    };
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
      /** Tautan di bawah nama ke halaman Data diri. */
      seeDetails: string;
      /** Keterangan baris Data diri; `instansi`: peserta punya instansi. */
      detailsRow: (instansi: boolean) => string;
      back: string;
      /** Ujung kanan kartu QR satu baris. */
      show: string;
      helpTitle: string;
      /** Kartu kontak panitia (Event settings) di Bantuan profil. */
      organisersTitle: string;
      checkpoints: string;
      room: (nomor: string) => string;
      whatsappRow: string;
      callRow: string;
      emailRow: string;
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
    yourBus: "Kendaraan",
    meetAt: (tempat) => `Titik kumpul: ${tempat}`,
    yourRoom: "Kamar",
    withRoommate: (nama) => `dengan ${nama}`,
    floor: (lantai) => `Lantai ${lantai}`,
    roommates: "Teman sekamar",
    room: (nomor) => `Kamar ${nomor}`,
    roomPending: "Nomor kamar menyusul",
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
    busRow: "Jadwal kendaraan",
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
        note: (zona) => `Hotel, kamar, kendaraan, dan kereta kamu. Waktu tercantum dalam ${zona}.`,
        empty: "Info perjalanan belum dibagikan panitia.",
        backToMenu: "Menu",
        hotelTitle: "Hotel & kamar",
        hotelCard: "Hotel",
        nights: (jumlah) => `${jumlah} malam`,
        moveTitle: "Pindah hotel",
        floor: "Lantai",
        roomType: "Tipe kamar",
        checkIn: "Check-in",
        checkOut: "Check-out",
        busTitle: "Kendaraan",
        meetingPoint: "Titik kumpul",
        mainBus: "Kendaraan utama",
        tripCount: (jumlah) => `${jumlah} perjalanan`,
        plate: "Pelat nomor",
        crew: "Kru kendaraan",
        trips: "Jadwal kendaraan",
        openMeetingMap: "Buka peta",
        addToCalendar: "Simpan ke kalender",
        call: "Telepon",
        whatsapp: "WhatsApp",
        contactLabel: (aksi, bus) => `${aksi} kru ${bus}`,
        seatLine: (gerbong, kursi) => [gerbong ? `Gerbong ${gerbong}` : null, kursi ? `kursi ${kursi}` : null].filter(Boolean).join(", ") || null,
        jump: { aria: "Lompat ke bagian", hotel: "Hotel", bus: "Kendaraan", train: "Kereta", luggage: "Bagasi", routes: "Rute" },
        done: "selesai",
        stayDone: (dari, sampai) => `Selesai · ${dari} – ${sampai}`,
        tripsDone: (jumlah) => `${jumlah} perjalanan selesai`,
        luggage: {
          title: "Bagasi",
          count: (jumlah) => `${jumlah} bagasi`,
          none: "Tidak menitip bagasi",
          countLabel: "Jumlah",
          droppedAt: "Dititipkan",
          place: "Tempat",
          check: "Jumlahnya tidak sesuai? Beri tahu panitia di meja bagasi sebelum berangkat.",
          received: "Sudah kamu terima",
          stored: "Dititipkan",
          pickedUpAt: "Diambil",
          checkAfter: "Ada yang kurang? Segera beri tahu panitia.",
          openPhoto: "Buka foto bagasi layar penuh",
          enlarge: "Perbesar",
          close: "Tutup",
        },
      },
      outfit: {
        note: "Pakaian tiap hari, dari panitia.",
        empty: "Belum ada info pakaian dari panitia.",
        dayEmpty: "Belum ada info pakaian dari panitia untuk hari ini.",
        menuRow: "Pakaian tiap hari",
        today: "Hari ini",
        yours: (kelompok) => `Untuk ${kelompok}, sesuai jadwalmu.`,
        notYours: (bagian, kelompok) => `Ini untuk ${bagian}. Kamu terdaftar di ${kelompok}.`,
        seeYours: (label, bagian) => `Lihat ${label} ${bagian}`,
        openPhoto: (apa) => `Buka foto ${apa} layar penuh`,
        viewPhoto: "Lihat gambar penuh",
        options: (jumlah) => `Pilih salah satu · ${jumlah} gaya`,
        optionsShort: (jumlah) => `${jumlah} pilihan`,
        prevPhoto: "Foto sebelumnya",
        nextPhoto: "Foto berikutnya",
        enlarge: "Perbesar",
        closePhoto: "Tutup",
        allDay: "Sepanjang hari",
        see: "Lihat",
        everyDay: "Setiap hari",
        next: "Berikutnya",
        row: {
          hariIni: (label) => `${label} hari ini`,
          besok: (label) => `${label} besok`,
          pertama: (label) => `${label} hari pertama`,
          terakhir: (label) => `${label} hari terakhir`,
          nanti: (label, hari) => `${label} · ${hari}`,
        },
      },
      participant: "Peserta",
      hotel: "Hotel",
      train: { title: "Tiket kereta", outbound: "Berangkat", return: "Pulang", carriage: "Gerbong", seat: "Kursi", booking: "Kode booking", count: (jumlah) => `${jumlah} tiket`, done: "Selesai", to: "ke" },
      trip: {
        plan: "Rencana perjalananmu",
        duration: (menit) => (menit % 60 ? `${Math.floor(menit / 60)}j ${menit % 60}m` : `${menit / 60}j`),
        hotelN: (urut) => `Hotel ${urut}`,
        hotels: (jumlah) => `${jumlah} hotel`,
        trainLeg: (dari, ke) => `Kereta ${dari} → ${ke}`,
        checkInAt: (hotel) => `Check-in ${hotel}`,
        moveTo: (hotel) => `Pindah ke ${hotel}`,
        checkOutAt: (hotel) => `Check-out ${hotel}`,
        copy: "Salin kode booking",
        copied: "Kode booking disalin",
        next: "Berikutnya",
        pass: "Kartu peserta",
        show: "Tampilkan",
        seeAll: "Lihat semua",
        activities: (jumlah) => `${jumlah} kegiatan`,
        noNewsTitle: "Belum ada pengumuman",
        noNewsBody: "Info dari panitia muncul di sini, dan kami beri tanda di ikon Pengumuman.",
        pinned: "Disematkan",
        qrNote: "Tunjukkan ke panitia saat registrasi, makan, dan checkpoint",
      },
      bus: "Kendaraan",
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
      roomNo: (nomor) => `Kamar ${nomor}`,
      roomPending: "Menyusul",
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
        tripLink: "Kendaraan dan titik kumpul ada di Perjalanan",
        routeLink: "Cara ke sana",
      },
      pinnedMore: (jumlah) => `+${jumlah} disematkan`,
      saveQrRow: { eyebrow: "Sebelum berangkat", title: "Simpan QR ke galeri", note: "Tetap bisa ditunjukkan tanpa sinyal.", failed: "Gambar QR gagal dibuat. Buka QR lalu coba lagi." },
      helpCard: {
        eyebrow: "Butuh bantuan?",
        title: "Hubungi panitia",
        emergencyRow: "Rumah sakit, polisi, dan nomor penting lain",
        note: "Langsung ke panitia lewat telepon atau WhatsApp.",
        noteEmail: "Kirim email ke panitia.",
        noteTravel: "Tertinggal rombongan atau ada kendala di perjalanan.",
        noteProfile: "Ada data yang salah atau butuh bantuan?",
        email: "Email",
      },
      emergency: "Kontak darurat",
      emergencyMap: "Peta",
      home: {
        heading: (nama) => `Halo, ${nama}`,
        dayOf: (hariKe, lama) => `hari ke-${hariKe} dari ${lama}`,
        inDays: (hari) => `${hari} hari lagi`,
        tomorrow: (berangkat) => (berangkat ? "besok berangkat" : "acara mulai besok"),
        today: (berangkat) => (berangkat ? "hari ini berangkat" : "acara mulai hari ini"),
        ended: "acara sudah selesai",
        timeNote: (zona) => `Waktu tercantum dalam ${zona}.`,
        scheduleToday: "Susunan acara hari ini",
        scheduleDay: (hari) => `Susunan acara ${hari}`,
        seeAll: "Lihat semua",
        forGroup: (kelompok) => `Untuk ${kelompok}`,
        travelTitle: "Perjalananmu",
        travelLink: "Detail perjalanan",
        roommates: (nama, jumlah) => `${jumlah > 1 ? "teman-teman sekamar" : "teman sekamar"} ${nama}`,
        trainNext: (pulang) => (pulang ? "Kereta pulang" : "Kereta berangkat"),
        departs: "Berangkat",
        eventDates: (tanggal) => `Acara ${tanggal}`,
        announcement: "Pengumuman",
        allAnnouncements: "Semua pengumuman",
      },
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
      schedule: {
        part: (n) => `Bagian ${n}`,
        partsAria: "Pilih bagian",
        yours: (kelompok) => `Ini jadwalmu. Kamu terdaftar di ${kelompok}.`,
        notYours: (kelompok) => `Ini bukan jadwalmu. Kamu terdaftar di ${kelompok}.`,
        seeYours: (label) => `Lihat jadwal ${label}`,
      },
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
        seeDetails: "Lihat data diri",
        detailsRow: (instansi) => (instansi ? "Nama, email, instansi" : "Nama dan email"),
        back: "Profil",
        show: "Tampilkan",
        helpTitle: "Bantuan",
        organisersTitle: "Kontak panitia",
        checkpoints: "Checkpoint selesai",
        room: (nomor) => `Kamar ${nomor}`,
        whatsappRow: "WhatsApp panitia",
        callRow: "Telepon panitia",
        emailRow: "Email panitia",
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
    yourBus: "Your vehicle",
    meetAt: (tempat) => `Meeting point: ${tempat}`,
    yourRoom: "Your room",
    withRoommate: (nama) => `with ${nama}`,
    floor: (lantai) => `Floor ${lantai}`,
    roommates: "Roommates",
    room: (nomor) => `Room ${nomor}`,
    roomPending: "Room number to follow",
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
    busRow: "Vehicle schedule",
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
        note: (zona) => `Your hotel, room, vehicle, and train. Times shown in ${zona}.`,
        empty: "The organisers haven't shared travel details yet.",
        backToMenu: "Menu",
        hotelTitle: "Hotel & room",
        hotelCard: "Hotel",
        nights: (jumlah) => `${jumlah} ${jumlah === 1 ? "night" : "nights"}`,
        moveTitle: "Moving hotels",
        floor: "Floor",
        roomType: "Room type",
        checkIn: "Check-in",
        checkOut: "Check-out",
        busTitle: "Vehicle",
        meetingPoint: "Meeting point",
        mainBus: "Main vehicle",
        tripCount: (jumlah) => `${jumlah} ${jumlah === 1 ? "trip" : "trips"}`,
        plate: "Plate number",
        crew: "Vehicle crew",
        trips: "Vehicle trips",
        openMeetingMap: "Open map",
        addToCalendar: "Add to calendar",
        call: "Call",
        whatsapp: "WhatsApp",
        contactLabel: (aksi, bus) => `${aksi} the ${bus} crew`,
        seatLine: (gerbong, kursi) => [gerbong ? `Carriage ${gerbong}` : null, kursi ? `seat ${kursi}` : null].filter(Boolean).join(", ") || null,
        jump: { aria: "Jump to section", hotel: "Hotel", bus: "Vehicle", train: "Train", luggage: "Luggage", routes: "Directions" },
        done: "done",
        stayDone: (dari, sampai) => `Done · ${dari} – ${sampai}`,
        tripsDone: (jumlah) => `${jumlah} ${jumlah === 1 ? "trip" : "trips"} done`,
        luggage: {
          title: "Luggage",
          count: (jumlah) => `${jumlah} ${jumlah === 1 ? "bag" : "bags"}`,
          none: "No luggage dropped off",
          countLabel: "Bags",
          droppedAt: "Dropped off",
          place: "Where",
          check: "Count not right? Tell the luggage desk before you leave.",
          received: "Back with you",
          stored: "Dropped off",
          pickedUpAt: "Picked up",
          checkAfter: "Something missing? Tell the committee straight away.",
          openPhoto: "Open the luggage photo full screen",
          enlarge: "Enlarge",
          close: "Close",
        },
      },
      outfit: {
        note: "What to wear each day, from the organisers.",
        empty: "The organisers haven't shared what to wear yet.",
        dayEmpty: "The organisers haven't shared what to wear for this day yet.",
        menuRow: "What to wear each day",
        today: "Today",
        yours: (kelompok) => `For ${kelompok}, as in your schedule.`,
        notYours: (bagian, kelompok) => `This is for ${bagian}. You are in ${kelompok}.`,
        seeYours: (label, bagian) => `See the ${bagian} ${label}`,
        openPhoto: (apa) => `Open the ${apa} photo full screen`,
        viewPhoto: "View full image",
        options: (jumlah) => `Pick one · ${jumlah} styles`,
        optionsShort: (jumlah) => `${jumlah} options`,
        prevPhoto: "Previous photo",
        nextPhoto: "Next photo",
        enlarge: "Enlarge",
        closePhoto: "Close",
        allDay: "All day",
        see: "View",
        everyDay: "Every day",
        next: "Next",
        row: {
          hariIni: (label) => `Today's ${label}`,
          besok: (label) => `Tomorrow's ${label}`,
          pertama: (label) => `Day one ${label}`,
          terakhir: (label) => `Last day ${label}`,
          nanti: (label, hari) => `${label} · ${hari}`,
        },
      },
      participant: "Participant",
      hotel: "Hotel",
      train: { title: "Train tickets", outbound: "Outbound", return: "Return", carriage: "Carriage", seat: "Seat", booking: "Booking code", count: (jumlah) => `${jumlah} ${jumlah === 1 ? "ticket" : "tickets"}`, done: "Done", to: "to" },
      trip: {
        plan: "Your trip plan",
        duration: (menit) => (menit % 60 ? `${Math.floor(menit / 60)}h ${menit % 60}m` : `${menit / 60}h`),
        hotelN: (urut) => `Hotel ${urut}`,
        hotels: (jumlah) => `${jumlah} ${jumlah === 1 ? "hotel" : "hotels"}`,
        trainLeg: (dari, ke) => `Train ${dari} → ${ke}`,
        checkInAt: (hotel) => `Check in at ${hotel}`,
        moveTo: (hotel) => `Move to ${hotel}`,
        checkOutAt: (hotel) => `Check out of ${hotel}`,
        copy: "Copy booking code",
        copied: "Booking code copied",
        next: "Next",
        pass: "Participant pass",
        show: "Show",
        seeAll: "See all",
        activities: (jumlah) => `${jumlah} ${jumlah === 1 ? "activity" : "activities"}`,
        noNewsTitle: "No announcements yet",
        noNewsBody: "News from the organisers shows up here, and we mark the Announcements icon.",
        pinned: "Pinned",
        qrNote: "Show it to the organisers at registration, meals and checkpoints",
      },
      bus: "Vehicle",
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
      roomNo: (nomor) => `Room ${nomor}`,
      roomPending: "To follow",
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
        tripLink: "Your vehicle and meeting point are in Travel",
        routeLink: "Getting there",
      },
      pinnedMore: (jumlah) => `+${jumlah} pinned`,
      saveQrRow: { eyebrow: "Before you leave", title: "Save QR to your photos", note: "You can show it without signal.", failed: "Couldn't create the QR image. Open the QR and try again." },
      helpCard: {
        eyebrow: "Need help?",
        title: "Contact the organisers",
        emergencyRow: "Hospital, police and other key numbers",
        note: "Reach the organisers by phone or WhatsApp.",
        noteEmail: "Email the organisers.",
        noteTravel: "Left behind or having trouble on the way?",
        noteProfile: "Wrong details or need help?",
        email: "Email",
      },
      emergency: "Emergency contacts",
      emergencyMap: "Map",
      home: {
        heading: (nama) => `Hi, ${nama}`,
        dayOf: (hariKe, lama) => `day ${hariKe} of ${lama}`,
        inDays: (hari) => `in ${hari} days`,
        tomorrow: (berangkat) => (berangkat ? "you travel tomorrow" : "starts tomorrow"),
        today: (berangkat) => (berangkat ? "you travel today" : "starts today"),
        ended: "the event has ended",
        timeNote: (zona) => `Times shown in ${zona}.`,
        scheduleToday: "Today's schedule",
        scheduleDay: (hari) => `Schedule for ${hari}`,
        seeAll: "See all",
        forGroup: (kelompok) => `For ${kelompok}`,
        travelTitle: "Your trip",
        travelLink: "Travel details",
        roommates: (nama, jumlah) => `${jumlah > 1 ? "roommates" : "roommate"} ${nama}`,
        trainNext: (pulang) => (pulang ? "Return train" : "Outbound train"),
        departs: "Departs",
        eventDates: (tanggal) => `Event ${tanggal}`,
        announcement: "Announcement",
        allAnnouncements: "All announcements",
      },
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
      schedule: {
        part: (n) => `Part ${n}`,
        partsAria: "Choose a part",
        yours: (kelompok) => `This is your schedule. You are in ${kelompok}.`,
        notYours: (kelompok) => `This is not your schedule. You are in ${kelompok}.`,
        seeYours: (label) => `See the ${label} schedule`,
      },
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
        seeDetails: "View your details",
        detailsRow: (instansi) => (instansi ? "Name, email, organisation" : "Name and email"),
        back: "Profile",
        show: "Show",
        helpTitle: "Help",
        organisersTitle: "Organiser contacts",
        checkpoints: "Checkpoints done",
        room: (nomor) => `Room ${nomor}`,
        whatsappRow: "WhatsApp the organisers",
        callRow: "Call the organisers",
        emailRow: "Email the organisers",
      },
    },
  },
};
