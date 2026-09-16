import {
  ArmchairIcon, Browsers, CalendarDots, ChartBar, ChartBarHorizontal, GearSix, Gift, HandWaving,
  ListChecks, MonitorPlay, Printer, QrCode, Receipt, ShieldCheck, Storefront, UserPlus, UsersThree,
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
 * Menurut SIAPA YANG MENATAP hasilnya, bukan menurut kemiripan kata:
 *
 *   * Halaman publik, dibuka tamu di ponselnya sendiri, sebelum hari-H.
 *   * Layar panggung, ditonton seruangan dari proyektor, saat acara berjalan.
 *
 * Itu sebabnya Denah kursi masuk kelompok publik meski terasa "peserta": yang
 * membukanya adalah tamu yang mencari mejanya, lewat /denah. Dan Kehadiran
 * justru TIDAK masuk Layar panggung, karena yang dikelola di sana orang dan
 * catatan hadirnya, bukan sesuatu yang ditayangkan.
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

export const navigation: NavGroup[] = [
  {
    section: null,
    items: [{ href: "/admin", label: "Dashboard", icon: ChartBar, description: "Ringkasan acara dan pintasan ke layar hari-H." }],
  },
  // Urutan kelompok mengikuti urutan pekerjaan sebuah acara: orangnya dulu, lalu
  // apa yang dilihat tamu sebelum hari-H, lalu apa yang ditonton saat acara
  // berjalan, dan Penjualan terakhir. Dulu Penjualan berdiri paling atas,
  // warisan masa platform ini hanya sistem kasir, dan banyak acara sama sekali
  // tidak memakai booth.
  {
    section: "Peserta",
    items: [
      { href: "/admin/participants", label: "Daftar peserta", icon: UsersThree, description: "Daftar hadirin, sumber datanya, dan penyuntingan per baris." },
      { href: "/admin/registrasi", label: "Pendaftaran publik", icon: UserPlus, description: "Formulir pendaftaran publik dan moderasi pendaftar yang masuk." },
      { href: "/admin/attendance", label: "Kehadiran", icon: QrCode, description: "Catatan kehadiran per jalur registrasi dan per sesi." },
      // Label duduk di sini, bukan di kelompok tersendiri: yang dicetak adalah
      // badge tamu walk-in, dan walk-in hanya ada karena layar kehadiran.
      { href: "/admin/label", label: "Label & printer", icon: Printer, description: "Cetak label nama lewat printer NIIMBOT." },
    ],
  },
  {
    section: "Halaman publik",
    items: [
      { href: "/admin/landing", label: "Halaman acara", icon: Browsers, description: "Isi dan tampilan halaman acara yang dibuka tamu." },
      { href: "/admin/rundown", label: "Rundown acara", icon: CalendarDots, description: "Susunan acara yang dipakai halaman acara dan layar rundown." },
      { href: "/admin/seat-map", label: "Denah kursi", icon: ArmchairIcon, description: "Denah meja dan kursi yang dicari tamu sebelum duduk." },
    ],
  },
  {
    section: "Layar panggung",
    items: [
      {
        // Dulu "Live Display". Namanya menjanjikan seluruh layar acara, isinya
        // papan peringkat transaksi, dan panitia yang mencari "di mana atur
        // ranking" tidak punya alasan menekan menu itu.
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
    ],
  },
  {
    section: "Penjualan",
    items: [
      { href: "/admin/orders", label: "Transaksi", icon: ListChecks, description: "Seluruh transaksi booth beserta status pembayarannya." },
      // Item spesial dulu menu tersendiri. Ia katalog barang yang dijual booth
      // yang sama, dan dua menu untuk satu katalog membuat admin mencari harga
      // di tempat yang salah lebih dulu. Sekarang tab di dalam Booth & item.
      { href: "/admin/booths", label: "Booth & item", icon: Storefront, description: "Booth, item spesial, dan metode pembayaran." },
      { href: "/admin/reports", label: "Laporan", icon: Receipt, description: "Angka rekonsiliasi acara untuk dicocokkan dengan kasir." },
    ],
  },
];

/**
 * Halaman yang TIDAK ada di sidebar, tetapi tetap butuh judul dan tetap harus
 * bisa ditemukan lewat palet perintah.
 *
 * Pengaturan dicapai lewat menu akun di pojok kanan. Keduanya dibuka sekali saat
 * menyiapkan sistem lalu nyaris tidak disentuh lagi selama acara berjalan;
 * sidebar disisakan untuk tujuan yang benar-benar ditekan panitia sepanjang hari.
 */
export const halamanSistem: NavItem[] = [
  { href: "/admin/settings", label: "Pengaturan", icon: GearSix, description: "Zona waktu, alur order, akun panitia, dan jejak audit." },
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
