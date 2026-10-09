import {
  ArmchairIcon, Browsers, CalendarDots, ChartBar, ChartBarHorizontal, GearSix, Gift, HandWaving, IdentificationCard,
  ListChecks, Megaphone, MicrophoneStage, MonitorPlay, Printer, QrCode, Receipt, ShieldCheck, Storefront, SuitcaseRolling, UserPlus, UsersThree,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";

/**
 * Definisi menu ruang kerja. SATU array, empat pemakai.
 *
 * Sebelumnya array ini tinggal di dalam `admin-shell.tsx`, dan itu cukup selama
 * pemakainya cuma sidebar. Sekarang ada empat: daftar menu, rel ikon saat
 * terlipat, palet perintah (Ctrl K), dan pencarian judul halaman yang mengisi
 * `PageHeader`. Empat salinan yang "seharusnya sama" akan berpisah pada
 * perubahan pertama yang hanya menyentuh sebagiannya, dan yang terlihat panitia
 * adalah menu yang tersorot tidak cocok dengan judul di layar.
 *
 * ---- Kenapa dikelompokkan begini ------------------------------------------
 *
 * Menurut KAPAN PANITIA MENGERJAKANNYA untuk satu acara: siapkan, kelola orang,
 * jalankan hari-H. Dulu menurut siapa yang menatap hasilnya (tamu di ponsel,
 * seruangan di proyektor), dan akibatnya panitia meloncat: kelompok "Peserta"
 * ikut berisi kehadiran dan label (hari-H), Layar sapa terpisah jauh di
 * kelompok lain, sementara halaman acara, rundown, dan denah yang diisi paling
 * awal duduk di kelompok kedua, di bawah lipatan layar laptop 1280x588.
 *
 * Penjualan dan Papan peringkat hanya tampil bila acara punya booth (lihat
 * `HREF_BOOTH`), aturan yang sama dengan Dashboard. Halamannya tetap ada dan
 * tetap ditemukan lewat palet perintah.
 *
 * Kelompok pertama sengaja tanpa judul. Satu item di bawah judul "Ringkasan"
 * menambah baris tanpa menambah keterangan apa pun.
 */

export type NavIcon = ComponentType<{ size?: number; weight?: "fill" | "regular" | "duotone"; className?: string }>;

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Satu kalimat: apa yang dikerjakan di layar ini. Muncul di kepala halaman. */
  description: string;
  ownerOnly?: boolean;
  /**
   * Halaman tingkat workspace, bukan milik satu acara. Tautannya tidak diberi
   * awalan `/e/<slug>`: User & role berlaku untuk semua acara sekaligus.
   */
  global?: boolean;
  /**
   * Sub-halaman yang benar-benar ada.
   *
   * Hanya dua induk yang punya, dan keduanya punya alasan yang sama: aturan
   * kelayakan dan panel operator dipisah dari CMS-nya supaya menyimpan setelan
   * tampilan tidak ikut menerbitkan daftar diskualifikasi yang belum selesai.
   * Tidak ada sub-halaman yang dikarang hanya untuk mengisi chevron.
   */
  children?: NavItem[];
  /**
   * Nama lain yang tetap ditemukan palet perintah (Ctrl K). Isinya nama menu
   * lama dalam Bahasa Indonesia sebelum admin berbahasa Inggris, supaya panitia
   * yang terbiasa mengetik "undian" tetap sampai ke Lucky draw.
   */
  alias?: string[];
};

export type NavGroup = {
  section: string | null;
  items: NavItem[];
  /** Nama kelompok lama untuk Ctrl K: mengetik "hari-h" tetap menampilkan isi kelompoknya. */
  alias?: string[];
};

/**
 * Menu yang hanya berarti bila acara punya booth: papan peringkat menghitung
 * transaksi booth, dan seluruh kelompok Penjualan adalah booth. Di acara tanpa
 * booth (forum, seminar) keempatnya hanya menambah baris yang tidak pernah
 * ditekan dan mendorong menu hari-H ke bawah lipatan.
 */
export const HREF_BOOTH: ReadonlySet<string> = new Set(["/admin/display", "/admin/orders", "/admin/booths", "/admin/reports"]);

export const navigation: NavGroup[] = [
  {
    section: null,
    items: [{ href: "/admin", label: "Dashboard", icon: ChartBar, description: "Event summary and shortcuts to the event-day screens.", alias: ["ringkasan"] }],
  },
  {
    section: "Setup",
    alias: ["persiapan"],
    items: [
      { href: "/admin/landing", label: "Event page", icon: Browsers, description: "Content and look of the event page participants open.", alias: ["halaman acara", "landing"] },
      { href: "/admin/rundown", label: "Agenda", icon: CalendarDots, description: "The programme shown on the event page and the agenda screen.", alias: ["rundown", "rundown acara", "susunan acara"] },
      // Data acara, bukan tata letak halaman: orangnya, foto, jabatan, sesi, dan
      // urutannya per tab. Dulu disunting di panel Halaman acara.
      { href: "/admin/speakers", label: "Speakers", icon: MicrophoneStage, description: "Speakers, their photos and sessions, and their order on the event page.", alias: ["pembicara", "narasumber", "moderator"] },
      // Di Persiapan: denah disusun sebelum pendaftaran dibuka, bersama halaman
      // acara dan rundown, meski yang mencarinya nanti tamu.
      { href: "/admin/seat-map", label: "Seating plan", icon: ArmchairIcon, description: "Table and seat plan participants look up before they sit down.", alias: ["denah kursi", "denah"] },
    ],
  },
  {
    section: "Participants",
    alias: ["peserta"],
    items: [
      { href: "/admin/participants", label: "Participant list", icon: UsersThree, description: "Everyone on the list, where they came from, and row-by-row editing.", alias: ["daftar peserta", "peserta"] },
      // Di Peserta, bukan Persiapan: halaman ini terbuka di antrean moderasi,
      // dan peringatan "menunggu moderasi" di Dashboard menuju ke sini. Ia
      // juga satu rumah untuk formulir, buka/tutup, dan mode persetujuan. "publik" dibuang dari namanya karena tidak
      // ada pendaftaran lain yang perlu dibedakan di menu.
      { href: "/admin/registrasi", label: "Registration", icon: UserPlus, description: "The public registration form and approval of new registrants.", alias: ["pendaftaran", "registrasi", "formulir"] },
      // Di antara Pendaftaran dan Pesan peserta: kamar dan bus dibagi setelah
      // pendaftar masuk, dan pemberitahuannya dikirim lewat Pesan peserta.
      // Selalu tampil: hotel, bus, dan barang diisi di halaman ini sendiri,
      // jadi menu yang menunggu data pertama tidak akan pernah muncul.
      { href: "/admin/logistik", label: "Logistics", icon: SuitcaseRolling, description: "Hotel rooms, buses for each agenda item, and kit items handed out to participants.", alias: ["logistik", "hotel", "kamar", "bus"] },
      // Satu baris untuk dua tab: Kiriman (email ke kotak masuk peserta) dan
      // Pengumuman (lonceng dan Dashboard saya). Alamatnya tetap
      // /admin/pengumuman supaya Terakhir dibuka dan Ctrl K lama tetap sampai.
      { href: "/admin/pengumuman", label: "Messages", icon: Megaphone, description: "Email blasts, announcements on the event page bell, and automated emails.", alias: ["pesan peserta", "blast", "pengumuman", "undangan"] },
      // Paling bawah di Peserta: diatur sekali (siapa yang bisa masuk, apa yang
      // tampil), sedangkan Pesan peserta ditekan berkali-kali. Urutan ini menjaga
      // Pesan peserta tetap di atas lipatan layar 1280x588.
      { href: "/admin/area-peserta", label: "Participant area", icon: IdentificationCard, description: "Who can sign in to the participant area and what they see there.", alias: ["area peserta", "dashboard saya"] },
    ],
  },
  {
    // Semua yang dipegang saat pintu dibuka, dalam satu blok: tidak ada lagi
    // loncatan dari Kehadiran di atas ke Layar sapa jauh di bawah.
    section: "Event day",
    alias: ["hari-h", "hari h"],
    items: [
      { href: "/admin/attendance", label: "Check-in", icon: QrCode, description: "Check-ins per desk lane and per check-in point.", alias: ["kehadiran", "hadir", "absensi", "scan", "scanner"] },
      // Label tepat di bawah Kehadiran: yang dicetak adalah badge tamu walk-in,
      // dan walk-in hanya ada karena layar kehadiran.
      { href: "/admin/label", label: "Badges & labels", icon: Printer, description: "Paper badge and sticker label designs, plus printer settings.", alias: ["badge & label", "label", "printer", "cetak"] },
      { href: "/admin/sapa", label: "Welcome screen", icon: HandWaving, description: "A greeting screen that shows each participant's name when they are scanned.", alias: ["layar sapa", "sapa"] },
      {
        href: "/admin/undian", label: "Lucky draw", icon: Gift,
        description: "Prizes, eligibility rules, and the operator panel for the draw.",
        alias: ["undian", "doorprize", "hadiah", "lucky draw"],
        children: [
          { href: "/admin/undian", label: "Prizes & rules", icon: Gift, description: "Prize list, participant groups, and draw eligibility rules.", alias: ["hadiah & aturan", "hadiah"] },
          { href: "/admin/undian/kontrol", label: "Operator panel", icon: Gift, description: "The panel the operator runs while the draw is on stage.", alias: ["panel operator"] },
        ],
      },
      { href: "/admin/vote", label: "Live voting", icon: ChartBarHorizontal, description: "Live voting questions and their results on the stage screen.", alias: ["voting langsung", "voting"] },
      {
        // Dulu "Live Display". Namanya menjanjikan seluruh layar acara, isinya
        // papan peringkat transaksi, dan panitia yang mencari "di mana atur
        // ranking" tidak punya alasan menekan menu itu. Paling bawah di Hari-H
        // karena ia ikut hilang di acara tanpa booth: yang hilang tidak
        // menggeser menu di atasnya.
        href: "/admin/display", label: "Leaderboard", icon: MonitorPlay,
        description: "Spending leaderboard for the projector.",
        alias: ["papan peringkat", "ranking", "top spender"],
        children: [
          // Induk ikut menjadi anak pertama, seperti "Overview" di bawah
          // "Domains". Tanpa itu, membuka kelompok justru menyembunyikan halaman
          // induknya: satu-satunya jalan kembali ke sana adalah menutup lagi
          // chevron yang barusan dibuka.
          { href: "/admin/display", label: "Display settings", icon: MonitorPlay, description: "Spending leaderboard for the projector.", alias: ["setelan tampilan"] },
          { href: "/admin/display/reveal", label: "Staged reveal", icon: MonitorPlay, description: "Reveal the ranking bit by bit on the projector.", alias: ["reveal bertahap"] },
          { href: "/admin/display/exclusions", label: "Exclusions", icon: MonitorPlay, description: "Participants and organisations not counted as top spenders.", alias: ["pengecualian"] },
        ],
      },
    ],
  },
  {
    section: "Sales",
    alias: ["penjualan"],
    items: [
      { href: "/admin/orders", label: "Orders", icon: ListChecks, description: "Every booth order and its payment status.", alias: ["transaksi", "transactions", "order"] },
      // Item spesial dulu menu tersendiri. Ia katalog barang yang dijual booth
      // yang sama, dan dua menu untuk satu katalog membuat admin mencari harga
      // di tempat yang salah lebih dulu. Sekarang tab di dalam Booth & item.
      // Metode pembayaran tidak di sini: ia tab Pembayaran di Pengaturan.
      { href: "/admin/booths", label: "Booths & items", icon: Storefront, description: "Booths and the special items each booth sells.", alias: ["booth & item", "booth"] },
      { href: "/admin/reports", label: "Reports", icon: Receipt, description: "Event reconciliation figures to check against the cashiers.", alias: ["laporan", "rekonsiliasi"] },
    ],
  },
];

/**
 * Halaman yang TIDAK ada di sidebar, tetapi tetap butuh judul dan tetap harus
 * bisa ditemukan lewat palet perintah.
 *
 * Event settings tinggal di kaki sidebar (satu baris dengan tombol sematan),
 * bukan di daftar menu: ia dibuka sekali saat menyiapkan acara, dan memasukkannya
 * ke daftar akan mendorong Participant area ke bawah lipatan 1280x588.
 * Users & roles berada di tingkat workspace (`/users`), dibuka dari pemilih
 * acara, kepala halaman Events, dan tautan di Event settings.
 */
export const halamanSistem: NavItem[] = [
  { href: "/admin/settings", label: "Event settings", icon: GearSix, description: "Time zone, order flow, payment methods, integrations, and the audit trail.", alias: ["pengaturan", "setelan"] },
  { href: "/users", global: true, label: "Users & roles", icon: ShieldCheck, description: "Staff accounts, their roles, and PIN resets.", alias: ["user & role", "pengguna", "panitia"] },
];

/**
 * Nama kelompok induk per href. Palet perintah dan Recents memakainya sebagai
 * baris kecil di bawah judul, supaya "Pengecualian" tidak berdiri tanpa
 * keterangan ia bagian dari apa.
 */
export const grupDari: ReadonlyMap<string, string> = new Map<string, string>([
  ...navigation.flatMap((group) =>
    group.items.flatMap((item): [string, string][] => [
      [item.href, group.section ?? "Overview"],
      ...(item.children ?? []).map((child): [string, string] => [child.href, item.label]),
    ]),
  ),
  ...halamanSistem.map((item): [string, string] => [item.href, "System"]),
]);

/**
 * Daftar rata untuk pencarian dan palet. Sub-halaman ikut.
 *
 * Induk yang anak pertamanya ber-href sama muncul dua kali di sini, dan itu
 * disengaja: yang satu "Papan peringkat" (yang dicari orang), yang satu "Setelan
 * tampilan" (posisinya di dalam kelompok). `cariHalaman` memilih yang paling
 * spesifik, dan palet menyaring href kembar sebelum menampilkannya.
 */
export const semuaMenu: NavItem[] = [
  ...navigation.flatMap((group) => group.items.flatMap((item) => [item, ...(item.children ?? [])])),
  ...halamanSistem,
];

/**
 * Halaman yang sedang dibuka, dari path yang sudah dilepas prefiks `/e/<slug>`.
 *
 * Padanan TERPANJANG menang, dan itu bukan kehalusan: tanpa urutan ini
 * `/admin/undian/kontrol` menjadi "Dashboard" hanya karena `/admin` cocok lebih
 * dulu, dan `/admin/display/exclusions` menjadi "Papan peringkat", dua judul
 * yang memang benar-benar pernah salah di layar.
 *
 * Anak diutamakan atas induk pada href yang sama, karena anak menyebut dirinya
 * lebih tepat: "Setelan tampilan", bukan "Papan peringkat".
 */
export function cariHalaman(path: string): NavItem | undefined {
  const anak = navigation.flatMap((group) => group.items.flatMap((item) => item.children ?? []));
  return [...anak, ...semuaMenu]
    .filter(({ href }) => (href === "/admin" ? path === "/admin" : path.startsWith(href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Apakah href ini yang sedang dibuka. `/admin` cocok persis; sisanya berprefiks. */
export function hrefAktif(href: string, path: string) {
  return href === "/admin" ? path === "/admin" : path.startsWith(href);
}
