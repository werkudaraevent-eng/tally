import type { LandingSpeakerEn } from "./landing-blok.ts";

/**
 * Perlakuan gambar banner di hero.
 *
 * `theme` melebur banner ke warna halaman lewat lapisan surface — hasilnya satu
 * bidang yang senada dengan seluruh halaman, tetapi gambar berwarna pekat pun
 * menjadi pucat. `photo` membiarkan warna gambar apa adanya dan hanya menaruh
 * bayangan gelap di sudut tempat teks hero berdiri.
 *
 * Pilihannya ada karena keduanya benar untuk banner yang berbeda: latar bertekstur
 * lembut memang lebih baik dilebur, sementara poster acara yang sudah dirancang
 * grafis akan rusak kalau dipucatkan. Yang TIDAK disediakan adalah "tanpa lapisan
 * sama sekali" — di atas gambar tanpa lapisan, nama acara bisa jatuh di area
 * terang dan menjadi tidak terbaca, dan itu tidak akan ketahuan sampai tamu
 * membukanya di ponselnya sendiri.
 */
export type LandingBannerStyle = "theme" | "photo";

export const LANDING_BANNER_STYLE_LABELS: Record<LandingBannerStyle, string> = {
  theme: "Match theme",
  photo: "Original colours",
};

/**
 * Tinggi hero halaman publik.
 *
 * Tiga patokan, bukan angka bebas. Angka bebas berarti admin bisa mengetik 900
 * dan membuat halaman yang tamunya harus menggulir sebelum melihat satu kalimat
 * pun tentang acaranya; ketiga nilai di bawah semuanya sudah dipastikan
 * menyisakan bagian bawah hero terlihat di layar laptop 768px.
 */
export type LandingHeroHeight = "compact" | "standard" | "tall";

export const LANDING_HERO_HEIGHT_LABELS: Record<LandingHeroHeight, string> = {
  compact: "Ringkas",
  standard: "Standar",
  tall: "Tinggi",
};

/**
 * Huruf judul halaman acara: nama acara dan judul bagian. Isi halaman tetap
 * memakai huruf antarmuka supaya mudah dibaca.
 *
 * Pilihannya huruf yang SUDAH dimuat aplikasi (lihat layout.tsx), bukan huruf
 * bebas: huruf yang diambil dari server luar bisa gagal dimuat di jaringan tamu,
 * dan tiap huruf tambahan adalah berkas yang diunduh setiap tamu. Source Sans 3
 * ditambahkan untuk tata letak Modern; admin tetap bebas memilih.
 */
export type LandingHeadingFont =
  | "serif"
  | "sans"
  | "geometric"
  | "condensed"
  | "grotesk"
  | "source"
  | "ubuntu"
  | "jakarta"
  | "fraunces"
  | "sourceserif"
  | "archivo"
  | "nunito";

/** Kategori huruf di pemilih CMS. Urutan di sini = urutan grup di daftarnya. */
export const LANDING_FONT_CATEGORIES = ["Sans", "Geometric", "Grotesque", "Rounded", "Serif", "Display"] as const;
export type LandingFontCategory = (typeof LANDING_FONT_CATEGORIES)[number];

/**
 * Registri huruf halaman acara. Berkasnya di public/fonts/v1/, @font-face-nya
 * di src/app/fonts/landing.css. `weight` = bobot judul yang benar-benar tampil,
 * untuk contoh di pemilih: Ubuntu dan Space Grotesk tidak punya 600, jadi judul
 * 600 tampil di 700. `preload` = berkas subset latin di bobot judul itu, yang
 * di-preload halaman acara yang memilih huruf ini (landing-font-preload.ts).
 * Urutan di sini = urutan di daftar pemilih dalam satu kategori.
 */
export const LANDING_HEADING_FONTS: Record<
  LandingHeadingFont,
  { label: string; note: string; cssVar: string; category: LandingFontCategory; weight: number; preload: string }
> = {
  serif: { label: "Playfair Display", note: "Classic, suits formal invitations", cssVar: "var(--font-serif)", category: "Serif", weight: 600, preload: "playfair-display/playfair-display-latin.woff2" },
  sans: { label: "Inter", note: "Neutral and modern", cssVar: "var(--font-sans)", category: "Sans", weight: 600, preload: "" },
  jakarta: { label: "Plus Jakarta Sans", note: "Crisp and contemporary", cssVar: "var(--font-jakarta)", category: "Sans", weight: 600, preload: "plus-jakarta-sans/plus-jakarta-sans-latin.woff2" },
  geometric: { label: "Montserrat", note: "Bold and wide", cssVar: "var(--font-geometric)", category: "Geometric", weight: 600, preload: "montserrat/montserrat-latin.woff2" },
  condensed: { label: "Oswald", note: "Condensed, suits long titles", cssVar: "var(--font-condensed)", category: "Display", weight: 600, preload: "oswald/oswald-latin.woff2" },
  grotesk: { label: "Space Grotesk", note: "Technical, for tech events", cssVar: "var(--font-grotesk)", category: "Grotesque", weight: 700, preload: "space-grotesk/space-grotesk-latin.woff2" },
  source: { label: "Source Sans 3", note: "Humanist and airy, the Modern default", cssVar: "var(--font-source)", category: "Sans", weight: 600, preload: "source-sans-3/source-sans-3-latin.woff2" },
  ubuntu: { label: "Ubuntu", note: "Friendly humanist, the Forum default", cssVar: "var(--font-ubuntu)", category: "Sans", weight: 700, preload: "ubuntu/ubuntu-latin-700.woff2" },
  fraunces: { label: "Fraunces", note: "Warm editorial serif with character", cssVar: "var(--font-fraunces)", category: "Serif", weight: 600, preload: "fraunces/fraunces-latin.woff2" },
  sourceserif: { label: "Source Serif 4", note: "Book serif, pairs with Source Sans 3", cssVar: "var(--font-source-serif)", category: "Serif", weight: 600, preload: "source-serif-4/source-serif-4-latin.woff2" },
  archivo: { label: "Archivo Narrow", note: "Narrow and sturdy, for posters", cssVar: "var(--font-archivo)", category: "Display", weight: 600, preload: "archivo-narrow/archivo-narrow-latin.woff2" },
  nunito: { label: "Nunito", note: "Rounded and friendly, for gatherings", cssVar: "var(--font-nunito)", category: "Rounded", weight: 600, preload: "nunito/nunito-latin.woff2" },
};

/** Huruf yang boleh jadi huruf isi: terbaca di 14-16 px. */
export const LANDING_BODY_FONTS = ["sans", "jakarta", "source", "ubuntu", "nunito", "sourceserif"] as const satisfies readonly LandingHeadingFont[];
export type LandingBodyFont = (typeof LANDING_BODY_FONTS)[number];

/** Sudut halaman acara: siku, lembut (skala M3), atau bulat. */
export const LANDING_CORNERS = ["square", "soft", "round"] as const;
export type LandingCorners = (typeof LANDING_CORNERS)[number];

export type LandingHeroAlign = "left" | "center";
export type LandingHeroPosition = "bottom" | "middle";

/** Kunci huruf judul, untuk validasi di API. Urutannya urutan pilihan di CMS. */
export const LANDING_HEADING_FONT_KEYS = Object.keys(LANDING_HEADING_FONTS) as [LandingHeadingFont, ...LandingHeadingFont[]];

/**
 * Tata letak halaman acara.
 *
 * `editorial` (bawaan): tipografi dan garis rambut, judul bagian di rel kiri.
 * `modern`: hero KV selebar layar dengan nav gelap di atasnya, kartu program,
 * kartu pembicara tinggi, dan banner ajakan. Keduanya membaca data yang sama;
 * yang berbeda hanya susunannya. Di Modern urutan bagian tetap (mengikuti
 * rancangannya), tetapi saklar tampil/sembunyi tetap berlaku.
 */
export type LandingLayout = "editorial" | "modern" | "forum";

export const LANDING_LAYOUT_LABELS: Record<LandingLayout, string> = {
  editorial: "Editorial",
  modern: "Modern",
  forum: "Forum",
};

// ---- Tata letak Forum ---------------------------------------------------------
// Diterjemahkan dari Figma "IFC Website" (file VP08ev7nB80JGumJEngYQU) yang
// dipilih Hanung pada 2026-10-01: tiga halaman (Beranda, Program acara,
// Informasi praktis) dengan susunan tetap. Admin mengisi dan menyalakan atau
// mematikan bagian, tidak menyusun ulang.

/** Bagian tata letak Forum yang bisa disembunyikan dari CMS. */
export type LandingForumPart =
  | "tanggal"
  | "about"
  | "program"
  | "speakers"
  | "sorotan"
  | "info"
  | "venue"
  | "galeri"
  | "dresscode";

/** Halaman tata letak Forum. `beranda` = /e/<slug>. */
export type LandingForumPage = "beranda" | "program" | "info";

export const LANDING_FORUM_PAGE_PATHS: Record<LandingForumPage, string> = {
  beranda: "",
  program: "/program",
  info: "/info",
};

/** Ikon ubin Informasi praktis. Kuncinya disimpan; gambarnya di komponen. */
export const LANDING_FORUM_ICONS = {
  plane: "Plane",
  visa: "ID card",
  tax: "Tax",
  venue: "Venue",
  list: "List",
  health: "Health",
  info: "Information",
  shirt: "Clothing",
  bus: "Transport",
  hotel: "Hotel",
  wifi: "Internet",
  phone: "Phone",
} as const;
export type LandingForumIcon = keyof typeof LANDING_FORUM_ICONS;
export const LANDING_FORUM_ICON_KEYS = Object.keys(LANDING_FORUM_ICONS) as [LandingForumIcon, ...LandingForumIcon[]];

/** Tujuan tautan baris Sorotan di Beranda. */
export type LandingForumLink = "program" | "info" | "daftar" | "url";

export type LandingForumConfig = {
  /** Bahasa label bawaan (menu, judul bagian, tombol). Isi dari CMS tidak diterjemahkan. */
  language?: "id" | "en";
  /** Warna lencana hero dan tombol "Selengkapnya". Bawaan kuning #FFC72C. */
  accent?: string;
  /** Warna tombol Masuk dan latar panel Susunan acara (diencerkan). Bawaan #00AEEF. */
  secondary?: string;
  /** Logo putih untuk bilah atas di atas KV Beranda. Kosong = logo acara (`nav.logo_url`). */
  logo_light_url?: string | null;
  hero_badge?: string;
  /** Gambar di belakang pita tanggal dan tempat. */
  date_banner_url?: string | null;
  /** Kalimat pita, mis. "Bali, Indonesia, 12 - 14 February 2025". Kosong = tempat dan tanggal acara. */
  date_banner_text?: string;
  about_image_url?: string | null;
  program_banner_url?: string | null;
  /** Kalimat di bawah judul banner Program acara. */
  program_subtitle?: string;
  /** Baris teks dan gambar bergantian di Beranda (rancangan: Agenda Event, Dresscode Event). */
  highlights?: {
    title: string;
    body?: string;
    image_url?: string | null;
    link?: LandingForumLink;
    link_url?: string;
    link_label?: string;
  }[];
  venue_note?: string;
  venue_image_url?: string | null;
  gallery?: string[];
  dresscode_intro?: string;
  dresscode?: { title: string; body?: string; image_url?: string | null }[];
  info_title?: string;
  info_intro?: string;
  info?: {
    id: string;
    title: string;
    icon?: LandingForumIcon;
    image_url?: string | null;
    items: { heading?: string; body: string }[];
  }[];
  footer_logo_url?: string | null;
  socials?: Partial<Record<"facebook" | "x" | "linkedin" | "instagram" | "youtube" | "whatsapp", string>>;
  footer_links?: { label: string; url: string }[];
  /** Bagian yang dimatikan admin. Bagian tanpa isi tidak tampil walau tidak ada di sini. */
  hidden?: LandingForumPart[];
};

/** Ukuran judul hero. Tiga patokan, alasannya sama dengan tinggi hero. */
export type LandingHeadingScale = "md" | "lg" | "xl";

export const LANDING_HEADING_SCALE_LABELS: Record<LandingHeadingScale, string> = {
  md: "Sedang",
  lg: "Besar",
  xl: "Sangat besar",
};

/**
 * Satu baris rundown yang dipegang pembicara. `role`: peran pembicara di sesi
 * ini saja (mis. Moderator di breakout), teks bebas; kosong berarti peran
 * utamanya (`LandingSpeaker.role`). `en.role` versi English-nya.
 */
export type LandingSessionRef = {
  id: number;
  label: string;
  role?: string;
  en?: { role?: string };
  /**
   * Posisi pembicara di sesi ini, kiri ke kanan, diatur admin (0 = paling
   * kiri). Bila satu pembicara sesi ini punya posisi, urutan ini mengalahkan
   * urutan editor dan aturan moderator lebih dulu; yang belum punya menyusul.
   */
  pos?: number;
  /** Hanya di /en, diisi resolveLanding: `role` Indonesia, untuk urutan moderator. Tidak disimpan. */
  role_id?: string;
};

/** Satu pembicara di bagian Pembicara. `featured` = kartu besar (keynote). */
export type LandingSpeaker = {
  name: string;
  title?: string;
  /** Instansi, tampil sebagai chip di kartu tata letak Modern. Opsional. */
  company?: string;
  role?: string;
  photo_url?: string | null;
  featured?: boolean;
  /**
   * Profil singkat, paragraf dipisah baris kosong. Bila diisi (atau `link`),
   * kartu di halaman acara bisa diketuk untuk membuka profilnya.
   */
  bio?: string;
  /** Tautan profil (LinkedIn, situs instansi), https://. */
  link?: string;
  /**
   * Baris rundown tempat pembicara tampil, satu atau lebih: id `rundown_items`
   * plus label pendek saat dipilih ("Sesi 1"), supaya baris yang kemudian
   * dihapus dari rundown masih bisa disebut namanya di editor. Pembicara
   * dikelompokkan per baris itu dalam tab bagian Pembicara dan fotonya tampil di
   * baris rundown-nya (lihat landing-speaker-tabs.ts). Bila ada (walau kosong),
   * `session` diabaikan.
   */
  session_refs?: LandingSessionRef[];
  /** Hanya di /en, diisi resolveLanding: `role` Indonesia, untuk urutan moderator. Tidak disimpan. */
  role_id?: string;
  /**
   * Sesi teks bebas versi lama ("Sesi 1"), dicocokkan ke awal judul rundown.
   * Dipakai hanya selama `session_refs` belum ada. Editor mengisi
   * `session_refs` saat dibuka bila tepat satu baris cocok; teks lama dan
   * `en.session` tetap disimpan untuk jaga-jaga.
   */
  session?: string;
  /** Teks English pembicara ini. Lihat src/lib/landing-i18n.ts. */
  en?: LandingSpeakerEn;
};


/** Rentang ukuran nama acara (px) yang bisa diisi admin. */
export const LANDING_HEADING_SIZE = { min: 32, max: 96, step: 2 } as const;
/** Rentang tinggi minimum hero (px) yang bisa diisi admin. */
export const LANDING_HERO_HEIGHT_PX = { min: 360, max: 900, step: 20 } as const;

/**
 * `font-size` nama acara untuk ukuran pilihan admin: penuh mulai lebar 1280px,
 * mengecil sebanding lebar layar, dan berhenti di sekitar 60% ukurannya di
 * ponsel supaya nama yang panjang tetap muat.
 */
export function landingHeadingFontSize(px: number): string {
  const kecil = Math.min(px, Math.max(28, Math.round(px * 0.6)));
  return `clamp(${kecil}px, ${((px / 1280) * 100).toFixed(2)}vw, ${px}px)`;
}
