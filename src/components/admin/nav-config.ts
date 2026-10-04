import {
  ArmchairIcon, Browsers, CalendarDots, ChartBar, ChartBarHorizontal, GearSix, Gift, HandWaving, IdentificationCard,
  ListChecks, Megaphone, MonitorPlay, Printer, QrCode, Receipt, ShieldCheck, Storefront, SuitcaseRolling, UserPlus, UsersThree,
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
   * Sub-halaman yang benar-benar ada.
   *
   * Hanya dua induk yang punya, dan keduanya punya alasan yang sama: aturan
   * kelayakan dan panel operator dipisah dari CMS-nya supaya menyimpan setelan
   * tampilan tidak ikut menerbitkan daftar diskualifikasi yang belum selesai.
   * Tidak ada sub-halaman yang dikarang hanya untuk mengisi chevron.
   */
  children?: NavItem[];
};

export type NavGroup = { section: string | null; items: NavItem[] };

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
    items: [{ href: "/admin", label: "Dashboard", icon: ChartBar, description: "Ringkasan acara dan pintasan ke layar hari-H." }],
  },
  {
    section: "Persiapan",
    items: [
      { href: "/admin/landing", label: "Halaman acara", icon: Browsers, description: "Isi dan tampilan halaman acara yang dibuka tamu." },
      { href: "/admin/rundown", label: "Rundown acara", icon: CalendarDots, description: "Susunan acara yang dipakai halaman acara dan layar rundown." },
      // Di Persiapan: denah disusun sebelum pendaftaran dibuka, bersama halaman
      // acara dan rundown, meski yang mencarinya nanti tamu.
      { href: "/admin/seat-map", label: "Denah kursi", icon: ArmchairIcon, description: "Denah meja dan kursi yang dicari tamu sebelum duduk." },
    ],
  },
  {
    section: "Peserta",
    items: [
      { href: "/admin/participants", label: "Daftar peserta", icon: UsersThree, description: "Daftar hadirin, sumber datanya, dan penyuntingan per baris." },
      // Di Peserta, bukan Persiapan: halaman ini terbuka di antrean moderasi,
      // dan peringatan "menunggu moderasi" di Dashboard menuju ke sini. Ia
      // juga satu rumah untuk formulir, buka/tutup, dan mode persetujuan. "publik" dibuang dari namanya karena tidak
      // ada pendaftaran lain yang perlu dibedakan di menu.
      { href: "/admin/registrasi", label: "Pendaftaran", icon: UserPlus, description: "Formulir pendaftaran publik dan moderasi pendaftar yang masuk." },
      // Di antara Pendaftaran dan Pesan peserta: kamar dan bus dibagi setelah
      // pendaftar masuk, dan pemberitahuannya dikirim lewat Pesan peserta.
      // Selalu tampil: hotel, bus, dan barang diisi di halaman ini sendiri,
      // jadi menu yang menunggu data pertama tidak akan pernah muncul.
      { href: "/admin/logistik", label: "Logistik", icon: SuitcaseRolling, description: "Kamar hotel, bus di tiap agenda, dan barang yang dibagikan ke peserta." },
      // Satu baris untuk dua tab: Kiriman (email ke kotak masuk peserta) dan
      // Pengumuman (lonceng dan Dashboard saya). Alamatnya tetap
      // /admin/pengumuman supaya Terakhir dibuka dan Ctrl K lama tetap sampai.
      { href: "/admin/pengumuman", label: "Pesan peserta", icon: Megaphone, description: "Undangan dan kabar lewat email, dan pengumuman di lonceng halaman acara." },
      // Paling bawah di Peserta: diatur sekali (siapa yang bisa masuk, apa yang
      // tampil), sedangkan Pesan peserta ditekan berkali-kali. Urutan ini menjaga
      // Pesan peserta tetap di atas lipatan layar 1280x588.
      { href: "/admin/area-peserta", label: "Area peserta", icon: IdentificationCard, description: "Siapa yang bisa masuk ke Dashboard saya dan apa yang tampil di sana." },
    ],
  },
  {
    // Semua yang dipegang saat pintu dibuka, dalam satu blok: tidak ada lagi
    // loncatan dari Kehadiran di atas ke Layar sapa jauh di bawah.
    section: "Hari-H",
    items: [
      { href: "/admin/attendance", label: "Kehadiran", icon: QrCode, description: "Catatan kehadiran per jalur registrasi dan per sesi." },
      // Label tepat di bawah Kehadiran: yang dicetak adalah badge tamu walk-in,
      // dan walk-in hanya ada karena layar kehadiran.
      { href: "/admin/label", label: "Badge & label", icon: Printer, description: "Cetak label nama lewat printer NIIMBOT." },
      { href: "/admin/sapa", label: "Layar sapa", icon: HandWaving, description: "Layar penyambut yang menyebut nama tamu saat dipindai." },
      {
        href: "/admin/undian", label: "Undian", icon: Gift,
        description: "Hadiah, aturan kelayakan, dan panel operator saat mengundi.",
        children: [
          { href: "/admin/undian", label: "Hadiah & aturan", icon: Gift, description: "Daftar hadiah, kelompok peserta, dan aturan kelayakan undian." },
          { href: "/admin/undian/kontrol", label: "Panel operator", icon: Gift, description: "Panel yang dipegang operator saat undian berjalan di panggung." },
        ],
      },
      { href: "/admin/vote", label: "Voting langsung", icon: ChartBarHorizontal, description: "Pertanyaan voting langsung dan hasilnya di layar panggung." },
      {
        // Dulu "Live Display". Namanya menjanjikan seluruh layar acara, isinya
        // papan peringkat transaksi, dan panitia yang mencari "di mana atur
        // ranking" tidak punya alasan menekan menu itu. Paling bawah di Hari-H
        // karena ia ikut hilang di acara tanpa booth: yang hilang tidak
        // menggeser menu di atasnya.
        href: "/admin/display", label: "Papan peringkat", icon: MonitorPlay,
        description: "Papan peringkat transaksi untuk ditayangkan ke proyektor.",
        children: [
          // Induk ikut menjadi anak pertama, seperti "Overview" di bawah
          // "Domains". Tanpa itu, membuka kelompok justru menyembunyikan halaman
          // induknya: satu-satunya jalan kembali ke sana adalah menutup lagi
          // chevron yang barusan dibuka.
          { href: "/admin/display", label: "Setelan tampilan", icon: MonitorPlay, description: "Papan peringkat transaksi untuk ditayangkan ke proyektor." },
          { href: "/admin/display/reveal", label: "Reveal bertahap", icon: MonitorPlay, description: "Umumkan peringkat sedikit demi sedikit ke layar proyektor." },
          { href: "/admin/display/exclusions", label: "Pengecualian", icon: MonitorPlay, description: "Peserta dan perusahaan yang tidak dihitung sebagai top spender." },
        ],
      },
    ],
  },
  {
    section: "Penjualan",
    items: [
      { href: "/admin/orders", label: "Transaksi", icon: ListChecks, description: "Seluruh transaksi booth beserta status pembayarannya." },
      // Item spesial dulu menu tersendiri. Ia katalog barang yang dijual booth
      // yang sama, dan dua menu untuk satu katalog membuat admin mencari harga
      // di tempat yang salah lebih dulu. Sekarang tab di dalam Booth & item.
      // Metode pembayaran tidak di sini: ia tab Pembayaran di Pengaturan.
      { href: "/admin/booths", label: "Booth & item", icon: Storefront, description: "Booth dan item spesial yang dijual di tiap booth." },
      { href: "/admin/reports", label: "Laporan", icon: Receipt, description: "Angka rekonsiliasi acara untuk dicocokkan dengan kasir." },
    ],
  },
];

/**
 * Halaman yang TIDAK ada di sidebar, tetapi tetap butuh judul dan tetap harus
 * bisa ditemukan lewat palet perintah.
 *
 * Pengaturan dicapai lewat menu akun di pojok kanan; User & role lewat palet
 * perintah dan tautan di kepala halaman Pengaturan. Keduanya dibuka sekali saat
 * menyiapkan sistem lalu nyaris tidak disentuh lagi selama acara berjalan;
 * sidebar disisakan untuk tujuan yang benar-benar ditekan panitia sepanjang hari.
 */
export const halamanSistem: NavItem[] = [
  { href: "/admin/settings", label: "Pengaturan", icon: GearSix, description: "Zona waktu, alur order, metode pembayaran, integrasi, dan jejak audit." },
  { href: "/admin/users", label: "User & role", icon: ShieldCheck, description: "Akun panitia, perannya, dan reset PIN." },
];

/**
 * Nama kelompok induk per href. Palet perintah dan Recents memakainya sebagai
 * baris kecil di bawah judul, supaya "Pengecualian" tidak berdiri tanpa
 * keterangan ia bagian dari apa.
 */
export const grupDari: ReadonlyMap<string, string> = new Map<string, string>([
  ...navigation.flatMap((group) =>
    group.items.flatMap((item): [string, string][] => [
      [item.href, group.section ?? "Ringkasan"],
      ...(item.children ?? []).map((child): [string, string] => [child.href, item.label]),
    ]),
  ),
  ...halamanSistem.map((item): [string, string] => [item.href, "Sistem"]),
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
