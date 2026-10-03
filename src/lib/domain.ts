import type { EventTimeZone } from "./timezone";
import type { RegistrationFormTheme } from "./registration-theme";

// super_admin = pemilik sistem. Memegang operasi yang tidak dapat dibalik (reset
// data, kelola user/role) yang tidak dibutuhkan klien untuk menjalankan acara.
// scanner = petugas pemindai kehadiran. Akun paling sempit di sistem: hanya bisa
// membuka layar /scan. Ada karena HP di pintu masuk sering dipegang bergantian,
// dan akun yang juga membuka transaksi serta data peserta adalah risiko yang
// tidak dibutuhkan di sana.
export type UserRole = "booth" | "cashier" | "admin" | "super_admin" | "scanner";

/**
 * Nama peran yang boleh dilihat orang. SATU sumber.
 *
 * Sebelumnya ada empat peta terpisah di empat berkas, dan tiga di antaranya
 * tidak lengkap — `super_admin` dan `scanner` tidak ada di sana. Konsekuensinya
 * bukan sekadar teori: pola `LABEL[role] ?? role` di layar masuk jatuh ke nilai
 * cadangan dan menampilkan "Masuk sebagai super_admin" kepada panitia. Nilai
 * kolom database, lengkap dengan garis bawahnya, di dalam kalimat sambutan.
 *
 * `Record<UserRole, string>`, bukan `Record<string, string>`: menambah peran
 * baru tanpa menamainya di sini sekarang gagal di typecheck, bukan di layar.
 */
export const ROLE_LABEL: Record<UserRole, string> = {
  booth: "Admin Booth",
  cashier: "Kasir",
  admin: "Panitia / Admin",
  super_admin: "Super Admin",
  scanner: "Petugas Scan",
};
export type OrderStatus = "pending" | "paid" | "void" | "handed_over";
export type PickupMode = "after_payment" | "immediate";

// ============================================================================
// Multi-Event Types
// ============================================================================

export type EventStatus = "draft" | "active" | "completed" | "archived";

/**
 * SATU peta label status untuk seluruh antarmuka.
 *
 * Sebelumnya daftar acara menulis "Aktif", halaman workspace menulis "ACTIVE",
 * dan dashboard menulis "active" — tiga kosakata untuk satu status, di tiga
 * layar yang dibuka berurutan dalam hitungan detik. Nilai mentah kolom tidak
 * pernah boleh sampai ke layar.
 */
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Draft",
  active: "Aktif",
  completed: "Selesai",
  archived: "Arsip",
};

export type ParticipantSource =
  | "scanner_api"  // Tarik dari API eksternal
  | "manual"       // Entri atau impor di CMS
  | "public_form"  // Peserta mendaftar sendiri
  | "hybrid";      // Gabungan

// Dinamai EventRow, bukan Event: `Event` adalah tipe bawaan DOM (lib.dom.d.ts).
// Menimpanya membuat setiap handler yang memakai Event DOM di berkas yang sama
// menerima tipe yang salah tanpa selalu gagal compile.
export type EventRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  event_date: string | null;
  status: EventStatus;
  participant_source: ParticipantSource;
  scanner_api_event_slug: string | null;
  registration_enabled: boolean;
  registration_form_config: RegistrationFormConfig;
  /**
   * Boleh tidaknya petugas /scan mendaftarkan tamu yang belum terdaftar.
   * Default false — lihat migrasi 202609070001 untuk alasannya.
   */
  attendance_allow_walk_in: boolean;
  time_zone: EventTimeZoneCode;

  // ---- Fakta acara untuk halaman publik ------------------------------------
  // Kolom, bukan bagian dari landing_config: email konfirmasi, rundown, dan
  // berkas kalender membacanya juga. Jam disimpan terpisah dari tanggal supaya
  // `event_date` tetap satu-satunya sumber kebenaran tanggal acara.
  /** Hanya untuk acara lebih dari satu hari. */
  end_date: string | null;
  /** "HH:MM:SS". Digabung dengan event_date dan time_zone saat ditampilkan. */
  start_time: string | null;
  end_time: string | null;
  tagline: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_map_url: string | null;
  landing_config: EventLandingConfig;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

// ID IANA, bukan singkatan. Sengaja mengacu ke EVENT_TIME_ZONES di
// src/lib/timezone.ts agar menambah zona hanya perlu satu perubahan; menulis
// ulang unionnya di sini membuat kedua daftar bisa berbeda tanpa gagal compile.
// "WIB"/"WITA"/"WIT" hanyalah label tampilan (timeZoneAbbr).
export type EventTimeZoneCode = EventTimeZone;

// Nama TIDAK ada di sini: ia satu-satunya kolom yang tetap NOT NULL di tabel
// pendaftaran, karena pendaftaran tanpa nama tidak dapat dimoderasi maupun
// dicocokkan dengan siapa pun di meja registrasi.
//
// Email dan telepon dapat dimatikan admin (require_email/require_phone), dan
// akibatnya nyata: tanpa email, kode peserta hanya muncul sekali di layar.
export type RegistrationFormConfig = {
  fields?: RegistrationField[];
  welcome_text?: string;
  success_text?: string;
  /**
   * Email wajib. Bawaan WAJIB — dimatikan hanya dengan keputusan sadar.
   *
   * Kode peserta dikirim lewat email. Tanpa email, kode hanya muncul di layar
   * satu kali dan pendaftar yang menutup halaman kehilangannya. Indeks unik
   * pendaftaran juga memakai email, jadi mematikannya ikut mematikan pencegahan
   * pendaftaran ganda.
   */
  require_email?: boolean;
  /** Telepon wajib. Bawaan wajib. */
  require_phone?: boolean;
  /** Jadikan perusahaan wajib. Bawaan opsional. */
  require_company?: boolean;
  /** Jadikan jabatan wajib. Bawaan opsional. */
  require_job_title?: boolean;
  /** Warna dan gambar form publik. Lihat src/lib/registration-theme.ts. */
  theme?: RegistrationFormTheme;
};

/**
 * Bagian landing page publik.
 *
 * Urutan DAN keaktifan disimpan dalam satu daftar, bukan dua. Dua daftar
 * terpisah akan menyimpang begitu ada bagian baru ditambahkan di kode: yang satu
 * mengenalnya, yang lain tidak.
 *
 * `hero` sengaja TIDAK ada di sini. Ia selalu tampil dan selalu pertama —
 * halaman acara tanpa nama acara di bagian atas bukan pilihan gaya.
 */
export type LandingSectionId = "about" | "highlights" | "agenda" | "speakers" | "venue" | "faq" | "sponsors" | "contact";

/**
 * Satu entri susunan halaman: bagian bawaan, atau blok dari pustaka blok
 * (`blk_...`, isinya di `landing_config.blocks`). Blok hanya dirender tata letak
 * Modern; Editorial melewatinya.
 */
export type LandingSection = { id: LandingSectionId | LandingBlockId; enabled: boolean };

export type LandingBlockId = `blk_${string}`;

export function isLandingBlockId(id: string): id is LandingBlockId {
  return id.startsWith("blk_");
}

/**
 * Pustaka blok halaman acara (tata letak Modern).
 *
 * Admin memilih jenis blok, mengurutkannya bersama bagian bawaan, lalu mengisi
 * teks dan gambarnya. Susunan, jarak, dan versi ponsel tiap blok dikunci di
 * kode: kebebasannya ada di isi, bukan di tata letak, supaya halaman yang diisi
 * siapa pun tetap rapi. Rancangan: Figma "Pustaka blok (usulan)".
 *
 * Satu bentuk data untuk semua jenis, dengan kolom opsional. Tiap jenis hanya
 * membaca kolom miliknya; editor CMS hanya menampilkan kolom itu.
 */
export type LandingBlockType = "text_image" | "cards" | "points" | "gallery" | "stats" | "quote" | "logos" | "download" | "cta" | "multicolumn";

/**
 * Blok Kolom: pola multicolumn Shopify Dawn (columns_desktop 1 sampai 6,
 * image_ratio, column_alignment). Di sini dibatasi 1 sampai 4 kolom dan tiga
 * bentuk gambar bernama. Ukuran piksel, posisi bebas, dan warna per teks
 * sengaja tidak ada: halaman yang diisi siapa pun harus tetap rapi.
 */
export type LandingColumnCount = 1 | 2 | 3 | 4;
export type LandingImageShape = "wide" | "square" | "circle";
export const LANDING_IMAGE_SHAPE_LABELS: Record<LandingImageShape, string> = { wide: "Lebar", square: "Persegi", circle: "Bulat" };
export const LANDING_COLUMNS_DEFAULT: LandingColumnCount = 3;

/** Latar blok. `dark` = warna merek dicampur hitam, teks putih. */
export type LandingBlockTone = "light" | "panel" | "dark";

/**
 * Tata letak di dalam satu jenis blok. Hanya Kartu bergambar dan Kartu poin
 * yang punya pilihan; jenis lain mengabaikannya.
 *
 * - Kartu bergambar: `featured` (kartu pertama besar), `overlay` (teks di atas
 *   foto), `columns` (tiga kolom setara, teks di bawah foto).
 * - Kartu poin: `cards` (kartu bernomor sebaris), `numbered` (daftar bernomor
 *   di samping judul), `list` (daftar dua kolom tanpa nomor).
 */
export type LandingBlockLayout = "featured" | "overlay" | "columns" | "cards" | "numbered" | "list";

export type LandingBlockItem = {
  image_url?: string | null;
  /**
   * Label kecil di atas judul kartu, chip pertama di kartu foto, nama mitra pada
   * logo, atau teks tautan di bawah satu kolom blok Kolom.
   */
  label?: string;
  title?: string;
  body?: string;
  /** Angka pada Pita angka, atau chip kedua (mis. jam) di kartu foto. */
  value?: string;
  href?: string;
  /** Teks English butir ini. Lihat src/lib/landing-i18n.ts. */
  en?: LandingItemEn;
};

export type LandingBlock = {
  id: LandingBlockId;
  type: LandingBlockType;
  tone?: LandingBlockTone;
  layout?: LandingBlockLayout;
  eyebrow?: string;
  heading?: string;
  body?: string;
  /** Teks + gambar: gambar samping. Pita ajakan: foto latar. Unduhan: sampul. Kutipan: foto. */
  image_url?: string | null;
  image_side?: "left" | "right";
  items?: LandingBlockItem[];
  quote?: string;
  name?: string;
  role?: string;
  link_url?: string;
  link_label?: string;
  /** Tombol kedua (garis) di Teks + gambar. */
  link2_url?: string;
  link2_label?: string;
  /** Kartu fakta di atas gambar Teks + gambar, mis. "15 Okt 2026" / nama tempat. */
  fact_title?: string;
  fact_body?: string;
  /** Sumber data di bawah Pita angka. Wajib bila ada angka. */
  source?: string;
  /** Bila diisi, blok ini muncul di menu atas dengan label ini. */
  nav_label?: string;
  /** Kolom: jumlah kolom di layar lebar. Tablet paling banyak 2, ponsel selalu 1. */
  columns?: LandingColumnCount;
  /** Kolom: bentuk gambar tiap kolom. */
  image_shape?: LandingImageShape;
  /** Kolom: perataan teks dan gambar di dalam kolom. */
  align?: "left" | "center";
  /** Teks English blok ini. Lihat src/lib/landing-i18n.ts. */
  en?: LandingBlockEn;
};

// ---- Teks English (halaman dwibahasa) -------------------------------------------
//
// Setiap objek yang punya teks mendapat satu kunci `en` dengan nama kolom yang
// SAMA dengan kolom Indonesianya. Kolom Indonesia tidak berubah dan tetap bahasa
// utama; gambar, warna, urutan, dan tampil/sembunyi tidak punya versi English.
// Kolom English yang kosong jatuh ke teks Indonesia kolom itu. Penumpukannya ada
// di satu tempat: resolveLanding() di src/lib/landing-i18n.ts.

/** Kolom teks blok yang punya versi English. */
export const LANDING_BLOCK_EN_KEYS = [
  "eyebrow", "heading", "body", "link_label", "link2_label", "fact_title", "fact_body", "source", "quote", "name", "role", "nav_label",
] as const;
export type LandingBlockEn = Partial<Record<(typeof LANDING_BLOCK_EN_KEYS)[number], string>>;

/** Kolom teks butir blok yang punya versi English. */
export const LANDING_ITEM_EN_KEYS = ["label", "title", "body", "value"] as const;
export type LandingItemEn = Partial<Record<(typeof LANDING_ITEM_EN_KEYS)[number], string>>;

/** Kolom teks pembicara yang punya versi English. Nama orang tidak diterjemahkan. */
export const LANDING_SPEAKER_EN_KEYS = ["title", "company", "role", "session"] as const;
export type LandingSpeakerEn = Partial<Record<(typeof LANDING_SPEAKER_EN_KEYS)[number], string>>;

/**
 * Teks English tingkat halaman. Empat kolom terakhir (`tagline`, `description`,
 * `venue_name`, `venue_address`) versi English dari kolom tabel `events`:
 * kolom itu tetap satu sumber untuk email, kalender, dan ekspor, jadi
 * terjemahannya tinggal di sini.
 */
export const LANDING_CONFIG_EN_KEYS = [
  "public_name", "cta_label", "about_heading", "program_heading", "program_intro", "agenda_note", "footer_note", "cta_heading", "cta_note", "contact_name",
  "about_eyebrow", "agenda_eyebrow", "speakers_eyebrow", "venue_eyebrow", "faq_eyebrow",
  "agenda_heading", "speakers_heading", "venue_heading", "faq_heading", "faq_intro",
] as const;
export const LANDING_EVENT_EN_KEYS = ["tagline", "description", "venue_name", "venue_address"] as const;
export type LandingConfigEn = Partial<Record<(typeof LANDING_CONFIG_EN_KEYS)[number] | (typeof LANDING_EVENT_EN_KEYS)[number], string>> & {
  /** Urut sesuai `program_notes`. */
  program_notes?: string[];
};

/** Bagian bawaan yang judulnya bisa disunting, dan label kecilnya menyala atau tidak bila belum diatur. */
export const LANDING_EYEBROW_DEFAULT = { about: false, agenda: true, speakers: false, venue: true, faq: false } as const satisfies Partial<Record<LandingSectionId, boolean>>;
export type LandingHeadedSection = keyof typeof LANDING_EYEBROW_DEFAULT;
/** Batas judul bagian: sama dengan blok tambahan (label 24, judul 60, pengantar 140). */
export const LANDING_SECTION_TEXT_MAX = { eyebrow: 24, heading: 60, headingIdeal: 48, intro: 140 } as const;

/** Panjang label menu atas: satu atau dua kata pendek, supaya menu muat satu baris. */
export const LANDING_NAV_LABEL_MAX = 16;

export const LANDING_BLOCK_LABELS: Record<LandingBlockType, string> = {
  text_image: "Teks + gambar",
  cards: "Kartu bergambar",
  points: "Kartu poin",
  gallery: "Galeri foto",
  stats: "Pita angka",
  quote: "Kutipan",
  logos: "Logo mitra",
  download: "Unduhan materi",
  cta: "Pita ajakan",
  multicolumn: "Kolom",
};

export const LANDING_BLOCK_DESCRIPTIONS: Record<LandingBlockType, string> = {
  text_image: "Cerita singkat dengan satu foto di kiri atau kanan.",
  cards: "Sesi, topik, atau bacaan, masing-masing dengan foto.",
  points: "Poin tanpa foto: pengertian, tujuan, atau daftar peserta.",
  gallery: "3 sampai 12 foto suasana acara.",
  stats: "2 sampai 4 angka asli dengan sumbernya, latar gelap.",
  quote: "Satu kutipan asli dengan nama dan jabatan.",
  logos: "Logo penyelenggara, mitra, atau sponsor.",
  download: "Tautan ke kerangka acuan, brosur, atau materi PDF.",
  cta: "Ajakan mendaftar, dengan atau tanpa foto latar.",
  multicolumn: "1 sampai 4 kolom, masing-masing dengan gambar, judul, teks, dan tautan.",
};

export const LANDING_BLOCK_TONE_LABELS: Record<LandingBlockTone, string> = {
  light: "Terang",
  panel: "Abu-abu",
  dark: "Merek gelap",
};

/** Latar bawaan tiap jenis blok saat baru ditambahkan. */
export const LANDING_BLOCK_DEFAULT_TONE: Record<LandingBlockType, LandingBlockTone> = {
  text_image: "light",
  cards: "light",
  points: "light",
  gallery: "panel",
  stats: "dark",
  quote: "light",
  logos: "light",
  download: "panel",
  cta: "light",
  multicolumn: "light",
};

export const LANDING_BLOCK_LAYOUTS: Partial<Record<LandingBlockType, { value: LandingBlockLayout; label: string; hint: string }[]>> = {
  cards: [
    { value: "overlay", label: "Foto bertulisan", hint: "Judul di atas foto, 2 atau 3 kartu sebaris. Cocok untuk sesi utama." },
    { value: "columns", label: "Tiga kolom", hint: "Foto di atas, teks di bawah, 3 atau 6 kartu. Cocok untuk diskusi kelompok atau bacaan." },
    { value: "featured", label: "Utama besar", hint: "Kartu pertama besar, dua kartu kecil di sampingnya." },
  ],
  points: [
    { value: "cards", label: "Kartu", hint: "3 atau 4 kartu bernomor sebaris." },
    { value: "numbered", label: "Daftar bernomor", hint: "Judul di kiri, 3 sampai 7 baris bernomor di kanan." },
    { value: "list", label: "Daftar dua kolom", hint: "Judul di kiri, butir pendek dalam dua kolom." },
  ],
};

export function landingBlockLayout(block: Pick<LandingBlock, "type" | "layout">): LandingBlockLayout | null {
  const pilihan = LANDING_BLOCK_LAYOUTS[block.type];
  if (!pilihan) return null;
  return pilihan.some((item) => item.value === block.layout) ? block.layout! : pilihan[0].value;
}

/**
 * Batas isi tiap kolom blok, per jenis dan tata letak. Rancangan: Figma
 * "Halaman acara FHF (desain dulu)", kartu "ISI DI CMS".
 *
 * `max` adalah batas keras (kolom berhenti menerima ketikan, server menolak).
 * `ideal` hanya saran: penghitung di CMS berubah kuning.
 *
 * Angkanya dihitung dari lebar kolom di layar lebar (60 sampai 75 karakter per
 * baris untuk paragraf) dan dari tinggi pasangannya: isi Teks + gambar dibatasi
 * supaya kolom teksnya tidak pernah lebih tinggi dari gambar 14:13 di
 * sampingnya. Judul dan tombol tidak pernah dipotong dengan titik-titik di
 * halaman, jadi batas inilah yang menjaga panjangnya.
 */
export type LandingTextLimit = { max: number; ideal?: number };

export type LandingBlockLimits = {
  eyebrow?: LandingTextLimit;
  heading?: LandingTextLimit;
  body?: LandingTextLimit;
  link_label?: LandingTextLimit;
  link2_label?: LandingTextLimit;
  fact_title?: LandingTextLimit;
  fact_body?: LandingTextLimit;
  source?: LandingTextLimit;
  quote?: LandingTextLimit;
  name?: LandingTextLimit;
  role?: LandingTextLimit;
  item?: { label?: LandingTextLimit; title?: LandingTextLimit; body?: LandingTextLimit; value?: LandingTextLimit };
  /** Jumlah butir. `full` = jumlah yang membuat baris penuh; selain itu CMS memberi peringatan. */
  items?: { max: number; full?: number[] };
};

const ALIS_BATAS: LandingTextLimit = { max: 24 };
const PENGANTAR_BATAS: LandingTextLimit = { max: 140 };
const TOMBOL_BATAS: LandingTextLimit = { max: 24 };

export function landingBlockLimits(block: Pick<LandingBlock, "type" | "layout" | "columns">): LandingBlockLimits {
  switch (block.type) {
    case "text_image":
      return {
        eyebrow: ALIS_BATAS,
        heading: { max: 50, ideal: 44 },
        body: { max: 480, ideal: 420 },
        link_label: TOMBOL_BATAS,
        link2_label: TOMBOL_BATAS,
        fact_title: { max: 14 },
        fact_body: { max: 40 },
      };
    case "cards": {
      const layout = landingBlockLayout(block);
      if (layout === "overlay") {
        return {
          eyebrow: ALIS_BATAS, heading: { max: 60, ideal: 48 }, body: PENGANTAR_BATAS, link_label: TOMBOL_BATAS,
          item: { label: { max: 16 }, value: { max: 16 }, title: { max: 80, ideal: 64 }, body: { max: 140, ideal: 120 } },
          items: { max: 4, full: [2, 3, 4] },
        };
      }
      if (layout === "columns") {
        return {
          eyebrow: ALIS_BATAS, heading: { max: 60, ideal: 48 }, body: PENGANTAR_BATAS, link_label: TOMBOL_BATAS,
          item: { label: { max: 20 }, title: { max: 72, ideal: 56 }, body: { max: 150, ideal: 120 } },
          items: { max: 6, full: [3, 6] },
        };
      }
      return {
        eyebrow: ALIS_BATAS, heading: { max: 60, ideal: 48 }, body: PENGANTAR_BATAS, link_label: TOMBOL_BATAS,
        item: { label: { max: 20 }, title: { max: 72, ideal: 56 }, body: { max: 150, ideal: 120 } },
        items: { max: 6 },
      };
    }
    case "points": {
      const layout = landingBlockLayout(block);
      if (layout === "numbered") {
        return { eyebrow: ALIS_BATAS, heading: { max: 50 }, body: PENGANTAR_BATAS, item: { body: { max: 160, ideal: 140 } }, items: { max: 7 } };
      }
      if (layout === "list") {
        return { eyebrow: ALIS_BATAS, heading: { max: 40 }, body: PENGANTAR_BATAS, item: { title: { max: 70, ideal: 60 } }, items: { max: 10 } };
      }
      return {
        eyebrow: ALIS_BATAS, heading: { max: 50 }, body: PENGANTAR_BATAS,
        item: { title: { max: 36 }, body: { max: 90, ideal: 75 } },
        items: { max: 4, full: [2, 3, 4] },
      };
    }
    case "gallery":
      return { eyebrow: ALIS_BATAS, heading: { max: 60 }, body: PENGANTAR_BATAS, item: { label: { max: 125 } }, items: { max: 12 } };
    case "stats":
      return { heading: { max: 60, ideal: 50 }, item: { value: { max: 8 }, label: { max: 70, ideal: 60 } }, source: { max: 160 }, items: { max: 4 } };
    case "quote":
      return { quote: { max: 280, ideal: 200 }, name: { max: 60 }, role: { max: 80 } };
    case "logos":
      return { heading: { max: 32 }, item: { label: { max: 80 } }, items: { max: 8 } };
    case "download":
      return { eyebrow: ALIS_BATAS, heading: { max: 50 }, body: { max: 200, ideal: 160 }, link_label: { max: 40 } };
    case "cta":
      return { heading: { max: 44, ideal: 36 }, body: { max: 140 }, link_label: TOMBOL_BATAS };
    case "multicolumn": {
      // Kolom makin sempit, teks makin pendek: 4 kolom di grid 1280 tinggal
      // ~280px, 180 karakter di sana sudah tujuh baris.
      const kolom = landingColumnCount(block);
      const isi = kolom >= 4 ? { max: 180, ideal: 140 } : kolom === 3 ? { max: 240, ideal: 200 } : { max: 360, ideal: 300 };
      return {
        eyebrow: ALIS_BATAS, heading: { max: 60, ideal: 48 }, body: PENGANTAR_BATAS, link_label: TOMBOL_BATAS,
        item: { title: { max: 60, ideal: 48 }, body: isi, label: TOMBOL_BATAS },
        items: { max: 8, full: kolom === 1 ? undefined : [kolom, kolom * 2].filter((n) => n <= 8) },
      };
    }
  }
}

/** Jumlah kolom blok Kolom, dengan bawaan untuk data lama atau rusak. */
export function landingColumnCount(block: Pick<LandingBlock, "columns">): LandingColumnCount {
  return block.columns && [1, 2, 3, 4].includes(block.columns) ? block.columns : LANDING_COLUMNS_DEFAULT;
}

/** Batas jumlah butir per jenis blok. Sama di CMS dan validasi server. */
export function landingBlockMaxItems(block: Pick<LandingBlock, "type" | "layout" | "columns">): number {
  return landingBlockLimits(block).items?.max ?? 0;
}

/**
 * Apakah blok punya isi untuk dirender. Sama di halaman publik dan CMS: blok
 * kosong tidak tampil, dan CMS menandainya "Belum ada isinya".
 */
export function landingBlockHasContent(block: LandingBlock): boolean {
  const items = block.items ?? [];
  switch (block.type) {
    case "text_image": return Boolean(block.heading?.trim() || block.body?.trim());
    case "cards": return items.some((item) => item.title?.trim());
    case "points": return items.some((item) => item.title?.trim() || item.body?.trim());
    case "gallery": return items.some((item) => item.image_url);
    // Angka tanpa sumber tidak tampil: angka yang disajikan sebagai fakta harus
    // bisa diperiksa (antislop C-5).
    case "stats": return Boolean(block.source?.trim()) && items.some((item) => item.value?.trim() && item.label?.trim());
    case "quote": return Boolean(block.quote?.trim() && block.name?.trim());
    case "logos": return items.some((item) => item.image_url);
    case "download": return Boolean(block.heading?.trim() && block.link_url?.trim());
    case "cta": return Boolean(block.heading?.trim());
    // Gambar saja tidak cukup: kolomnya kosong bagi pembaca layar.
    case "multicolumn": return items.some((item) => item.title?.trim() || item.body?.trim());
  }
}

export const LANDING_SECTION_LABELS: Record<LandingSectionId, string> = {
  about: "Tentang acara",
  highlights: "Angka penting",
  agenda: "Susunan acara",
  speakers: "Pembicara",
  venue: "Lokasi",
  faq: "Pertanyaan umum",
  sponsors: "Sponsor & mitra",
  contact: "Kontak panitia",
};

/**
 * Dari mana isi tiap bagian datang.
 *
 * Ada karena tanpa ini saklar bagian adalah tombol yang tidak bisa dipercaya:
 * admin menyalakan "Susunan acara", tidak terjadi apa-apa, dan tidak ada apa pun
 * di layar yang memberi tahu bahwa isinya diambil dari modul lain yang masih
 * kosong. `href` diisi hanya untuk bagian yang isinya dikelola DI MODUL LAIN;
 * bagian yang diisi di halaman ini sendiri tidak perlu tautan ke mana-mana.
 */
export type LandingSectionSource = { text: string; href?: string; linkLabel?: string };

export const LANDING_SECTION_SOURCES: Record<LandingSectionId, LandingSectionSource> = {
  about: { text: "Deskripsi acara, diisi di halaman ini" },
  highlights: { text: "Diisi di halaman ini" },
  agenda: {
    text: "Ditarik otomatis dari modul Rundown acara",
    href: "/admin/rundown",
    linkLabel: "Buka Rundown",
  },
  speakers: { text: "Diisi di halaman ini" },
  venue: {
    text: "Nama, alamat, dan peta diisi di halaman ini. Tombol denah menuju modul Denah kursi",
    href: "/admin/seat-map",
    linkLabel: "Buka Denah kursi",
  },
  faq: { text: "Diisi di halaman ini" },
  sponsors: { text: "Logo diunggah di halaman ini" },
  contact: { text: "Diisi di halaman ini" },
};

/** Susunan bawaan, dipakai saat event belum pernah menyimpan konfigurasi. */
export const DEFAULT_LANDING_SECTIONS: LandingSection[] = [
  { id: "about", enabled: true },
  { id: "highlights", enabled: false },
  { id: "agenda", enabled: true },
  { id: "speakers", enabled: true },
  { id: "venue", enabled: true },
  { id: "faq", enabled: false },
  { id: "sponsors", enabled: true },
  { id: "contact", enabled: false },
];

/**
 * Susunan tersimpan, dilengkapi bagian yang ditambahkan SETELAH acara menyimpan
 * susunannya (mis. Pembicara). Tanpa ini, bagian baru tidak pernah muncul di
 * acara lama: ia tidak ada di daftar tersimpan, jadi tidak bisa dinyalakan.
 * Bagian yang tertinggal ditambahkan di posisi bawaannya dengan keadaan
 * bawaannya; susunan yang sudah diatur admin tidak diubah.
 */
export function normalizeLandingSections(saved: LandingSection[] | undefined, blocks: LandingBlock[] = []): LandingSection[] {
  const ids = new Set(blocks.map((block) => block.id));
  // Blok yang tersimpan di `blocks` tapi belum ada di susunan masuk di akhir;
  // entri susunan yang bloknya sudah dihapus dibuang.
  const yatim = blocks.filter((block) => !saved?.some((section) => section.id === block.id)).map((block) => ({ id: block.id, enabled: true }));
  if (!saved?.length) return [...DEFAULT_LANDING_SECTIONS, ...yatim];
  const next = saved.filter((section) =>
    isLandingBlockId(section.id) ? ids.has(section.id) : DEFAULT_LANDING_SECTIONS.some((item) => item.id === section.id),
  );
  DEFAULT_LANDING_SECTIONS.forEach((item, index) => {
    if (next.some((section) => section.id === item.id)) return;
    next.splice(Math.min(index, next.length), 0, item);
  });
  return [...next, ...yatim];
}

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
  theme: "Menyatu tema",
  photo: "Warna asli",
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
export type LandingHeadingFont = "serif" | "sans" | "geometric" | "condensed" | "grotesk" | "source" | "ubuntu";

export const LANDING_HEADING_FONTS: Record<LandingHeadingFont, { label: string; note: string; cssVar: string }> = {
  serif: { label: "Playfair Display", note: "Klasik, cocok untuk undangan resmi", cssVar: "var(--font-serif)" },
  sans: { label: "Inter", note: "Netral dan modern", cssVar: "var(--font-sans)" },
  geometric: { label: "Montserrat", note: "Geometris, tegas", cssVar: "var(--font-geometric)" },
  condensed: { label: "Oswald", note: "Rapat, cocok untuk judul panjang", cssVar: "var(--font-condensed)" },
  grotesk: { label: "Space Grotesk", note: "Teknis, untuk acara teknologi", cssVar: "var(--font-grotesk)" },
  source: { label: "Source Sans 3", note: "Humanis dan lapang, pasangan tata letak Modern", cssVar: "var(--font-source)" },
  ubuntu: { label: "Ubuntu", note: "Bulat dan ramah, pasangan tata letak Forum", cssVar: "var(--font-ubuntu)" },
};

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
  plane: "Pesawat",
  visa: "Kartu identitas",
  tax: "Pajak",
  venue: "Lokasi",
  list: "Daftar",
  health: "Kesehatan",
  info: "Informasi",
  shirt: "Pakaian",
  bus: "Transportasi",
  hotel: "Hotel",
  wifi: "Internet",
  phone: "Telepon",
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

/** Satu baris rundown yang dipegang pembicara. */
export type LandingSessionRef = { id: number; label: string };

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
   * Baris rundown tempat pembicara tampil, satu atau lebih: id `rundown_items`
   * plus label pendek saat dipilih ("Sesi 1"), supaya baris yang kemudian
   * dihapus dari rundown masih bisa disebut namanya di editor. Pembicara
   * dikelompokkan per baris itu dalam tab bagian Pembicara dan fotonya tampil di
   * baris rundown-nya (lihat landing-speaker-tabs.ts). Bila ada (walau kosong),
   * `session` diabaikan.
   */
  session_refs?: LandingSessionRef[];
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

/**
 * Area peserta: peserta masuk dengan email pendaftaran + kata sandi di halaman
 * acara, lalu melihat kode QR, kursi, susunan acara, dan tautan voting miliknya.
 *
 * `audience`:
 *   - `approved` (bawaan): hanya peserta dari pendaftaran publik yang disetujui.
 *   - `all`: semua baris di Daftar peserta yang punya email, termasuk impor.
 *
 * Tiap `show_*` bawaan menyala; `feedback_url` kosong berarti kartu umpan balik
 * tidak tampil.
 */
export type LandingMemberAudience = "approved" | "all";

export type LandingMemberConfig = {
  enabled: boolean;
  audience?: LandingMemberAudience;
  show_code?: boolean;
  show_seat?: boolean;
  show_schedule?: boolean;
  show_vote?: boolean;
  /**
   * Kamar, bus, dan barang dari Logistik di Dashboard saya. Bawaan MATI, beda
   * dengan sakelar lain: penempatan yang setengah jadi tidak boleh terbaca
   * peserta sebagai kamar finalnya. Panitia menyalakannya saat siap.
   */
  show_logistics?: boolean;
  /** Teman sekamar di kartu Kamar (dibaca member_logistics). Bawaan tampil. */
  show_roommates?: boolean;
  feedback_url?: string | null;
};

export const LANDING_MEMBER_AUDIENCE_LABELS: Record<LandingMemberAudience, string> = {
  approved: "Peserta yang pendaftarannya disetujui",
  all: "Semua peserta di Daftar peserta",
};

/**
 * Bilah atas tata letak Modern. Semua opsional; yang kosong memakai
 * LANDING_NAV_DEFAULTS (bilah hitam 72%, selebar layar, 64px), tampilan
 * sebelum pengaturan ini ada.
 */
export type LandingNavConfig = {
  /** Warna bilah, hex 6 digit. */
  color?: string;
  /** Ketidaktembusan 0-100 (%). 0 = bening, 100 = pekat. */
  opacity?: number;
  /** `full` = selebar layar; `content` = selebar isi halaman, sudut membulat. */
  width?: LandingNavWidth;
  /** Tinggi bilah dalam px. */
  height?: number;
  /** Logo acara di pojok kiri, menggantikan nama acara. Kosong = nama acara. */
  logo_url?: string | null;
};

export type LandingNavWidth = "full" | "content";

export const LANDING_NAV_WIDTH_LABELS: Record<LandingNavWidth, string> = {
  full: "Selebar layar",
  content: "Selebar isi",
};

export const LANDING_NAV_DEFAULTS = { color: "#121212", opacity: 72, width: "full", height: 64 } as const;
/** Batas tinggi bilah. Di bawah 48px tombol Masuk/Daftar tidak muat (target sentuh 44px). */
export const LANDING_NAV_HEIGHT_MIN = 48;
export const LANDING_NAV_HEIGHT_MAX = 120;

export type EventLandingConfig = {
  /** Bawaan `editorial`. */
  layout?: LandingLayout;
  /**
   * Yang tayang di `/e/<slug>`. Bawaan `halaman` (halaman acara). `formulir`:
   * acara tanpa halaman acara; alamat itu langsung membuka formulir
   * pendaftaran, dan Tema (logo, gambar utama, warna, huruf) tetap dipakai
   * formulir, masuk peserta, dan area peserta. Lihat landingFormOnly.
   */
  tayang?: "halaman" | "formulir";
  /** Isi khusus tata letak Forum. */
  forum?: LandingForumConfig;
  /**
   * Nama acara yang dilihat tamu. Nama di kolom `events.name` dipakai admin
   * untuk membedakan acara di daftar (sering memuat nama klien, mis. "ILO ..."),
   * dan tidak selalu cocok tampil di hero. Kosong = pakai `events.name`.
   */
  public_name?: string;
  /** Bilah atas tata letak Modern: warna, transparansi, lebar, tinggi. */
  nav?: LandingNavConfig;
  // ---- Teks tambahan tata letak Modern --------------------------------------
  // Semuanya opsional; yang kosong jatuh ke judul bawaan atau tidak dirender
  // sama sekali, tidak pernah ke teks contoh.
  /** Judul besar di samping deskripsi (bagian Tentang). */
  about_heading?: string;
  /** Judul bagian Program, mis. "Dua program, satu hari". */
  program_heading?: string;
  /** Kalimat pengantar di kanan judul Program. */
  program_intro?: string;
  /** Keterangan tiap kartu program, urut sesuai bagian di Rundown. */
  program_notes?: string[];
  /** true = kartu Program dari Rundown tidak tampil (mis. sesi sudah ditulis di blok Kartu bergambar). */
  program_hidden?: boolean;
  /** Catatan di kiri Susunan acara, mis. "Registrasi dibuka pukul 08.00 WIB." */
  agenda_note?: string;
  /**
   * Judul bagian bawaan. Kosong = judul otomatis (tanggal, nama tempat,
   * jumlah pembicara) atau teks bawaan per bahasa.
   */
  agenda_heading?: string;
  speakers_heading?: string;
  venue_heading?: string;
  faq_heading?: string;
  /** Kalimat di bawah judul Pertanyaan umum. */
  faq_intro?: string;
  /** Label kecil di atas judul bagian. Kosong = nama bagian. */
  about_eyebrow?: string;
  agenda_eyebrow?: string;
  speakers_eyebrow?: string;
  venue_eyebrow?: string;
  faq_eyebrow?: string;
  /** Label kecil tampil atau tidak per bagian; dipakai bersama oleh ID dan EN. Default di LANDING_EYEBROW_DEFAULT. */
  eyebrow_shown?: Partial<Record<LandingSectionId, boolean>>;
  /** Kalimat penyelenggara di kaki halaman, mis. "Diselenggarakan oleh ...". */
  footer_note?: string;
  /** Judul banner ajakan di bawah halaman. */
  cta_heading?: string;
  /** Kalimat di bawah judul banner ajakan. */
  cta_note?: string;
  /** Area peserta. Tanpa nilai = mati. */
  member?: LandingMemberConfig;
  /** Isi blok dari pustaka blok; urutannya ada di `sections`. */
  blocks?: LandingBlock[];
  banner_url?: string | null;
  /** Bawaan `theme` — perilaku sebelum pilihan ini ada. */
  banner_style?: LandingBannerStyle;
  /** Bawaan `standard`. Diabaikan bila `hero_min_height` diisi. */
  hero_height?: LandingHeroHeight;
  /** Tinggi minimum hero di layar lebar, dalam px. Tidak pernah melebihi tinggi layar. */
  hero_min_height?: number;
  cta_label?: string;
  /** Bawaan `serif`. */
  heading_font?: LandingHeadingFont;
  /** Bawaan `lg`. Diabaikan bila `heading_size` diisi. */
  heading_scale?: LandingHeadingScale;
  /** Ukuran nama acara di layar lebar, dalam px. Di layar sempit mengecil otomatis. */
  heading_size?: number;
  sections?: LandingSection[];
  speakers?: LandingSpeaker[];
  /** Angka yang ingin ditonjolkan: "300+ peserta", "12 booth". */
  highlights?: { label: string; value: string; en?: { label?: string; value?: string } }[];
  faq?: { q: string; a: string; en?: { q?: string; a?: string } }[];
  /** Logo sponsor dan mitra. Diunggah di CMS halaman acara, bukan ditarik dari layar lain. */
  sponsors?: { name?: string; logo_url: string; en?: { name?: string } }[];
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  /**
   * Warna merek halaman. Bentuknya sama dengan tema form pendaftaran, dan
   * memang disengaja: satu acara punya satu warna, dua permukaan.
   */
  theme?: RegistrationFormTheme;
  /**
   * Versi English halaman (`/e/<slug>/en`) dan tombol bahasanya tampil. Bawaan
   * mati: selama mati, alamat English 404 dan halaman Indonesia tidak berubah.
   */
  en_enabled?: boolean;
  /**
   * Khusus undangan (preset Gathering): peserta diimpor panitia, jadi saat
   * pendaftaran tertutup hero dan pita penutup mengajak MASUK, bukan menunggu
   * pendaftaran dibuka. Hanya berlaku di Modern dan bila area peserta aktif;
   * tanpa itu halaman sama persis dengan pendaftaran tertutup biasa.
   */
  invite_only?: boolean;
  /**
   * Gaya gathering (preset Gathering, tata letak Modern saja): hero perjalanan
   * dengan lama menginap, susunan acara per "Hari N", bagian Tempat menginap
   * dari hotel di Logistik menggantikan Lokasi, dan kartu Program serta kotak
   * angka sesi (khas acara rapat) disembunyikan.
   */
  gathering?: boolean;
  /**
   * Bahasa di alamat utama `/e/<slug>` (bawaan "id"). "en" hanya berlaku
   * selama versi English menyala; lihat landingDefaultLang.
   */
  default_lang?: "id" | "en";
  /** Teks English tingkat halaman. Lihat src/lib/landing-i18n.ts. */
  en?: LandingConfigEn;
};

/**
 * Jenis field tambahan.
 *
 * Menambah satu nilai di sini berarti menyentuh TIGA tempat, dan melewatkan
 * salah satunya menghasilkan kegagalan yang tidak terlihat saat build:
 *
 *   1. Perender di src/app/daftar/daftar-client.tsx — kalau terlewat, fieldnya
 *      tidak muncul sama sekali di form.
 *   2. Validasi di src/app/api/registrasi/route.ts — kalau terlewat, isian
 *      apa pun lolos ke database tanpa diperiksa.
 *   3. Penyunting di src/components/admin/registration-form-builder.tsx —
 *      kalau terlewat, admin tidak punya cara membuatnya.
 */
export type RegistrationFieldType =
  | "text"
  | "email"
  | "tel"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "number"
  | "file";

export type RegistrationField = {
  key: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  /** Hanya untuk `select` dan `radio`. Jawaban yang tersimpan adalah teks pilihan ini. */
  options?: string[];
  /**
   * Keterangan per pilihan, sejajar dengan `options` (indeks yang sama; kosong =
   * tanpa keterangan). Tampil di bawah judul pilihan pada `radio`; `select`
   * bawaan peramban tidak bisa menampilkannya. Disimpan terpisah, bukan
   * mengubah `options` menjadi objek, supaya jawaban, ekspor, dan semua
   * pembaca `options` yang sudah ada tidak berubah.
   */
  option_descriptions?: string[];
  placeholder?: string;
  help_text?: string;
  /** Hanya untuk `number`. Dibiarkan kosong berarti tanpa batas. */
  min?: number;
  max?: number;
};

/** Jenis yang memerlukan daftar pilihan. Kosongnya membuat field mustahil diisi. */
export const CHOICE_FIELD_TYPES: RegistrationFieldType[] = ["select", "radio"];

export const REGISTRATION_FIELD_TYPE_LABELS: Record<RegistrationFieldType, string> = {
  text: "Teks singkat",
  email: "Email",
  tel: "Nomor telepon",
  textarea: "Teks panjang",
  select: "Dropdown",
  radio: "Pilihan (radio)",
  checkbox: "Kotak centang",
  date: "Tanggal",
  number: "Angka",
  file: "Unggah berkas",
};

// ============================================================================
// Existing Types (now event-scoped)
// ============================================================================

// Metode pembayaran kini data, bukan enum. Admin dapat menambah metode baru
// (QRIS, transfer) dari workspace, jadi tipenya tidak lagi union tetap.
export type PaymentMethod = string;

export type PaymentMethodConfig = {
  code: string;
  label: string;
  requires_reference: boolean;
  reference_label: string | null;
  reference_digits: number | null;
  is_active: boolean;
  sort_order: number;
  is_builtin: boolean;
};

export type EventSettings = {
  pickup_mode: PickupMode;
  name_display_mode: "full" | "initials" | "company_only" | "hidden";
  leaderboard_enabled: boolean;
  pending_auto_void_minutes: number;
  // false = order booth langsung lunas saat dibuat, antrean kasir tidak dipakai.
  cashier_confirmation_required: boolean;
};

export type Participant = {
  id: string;
  qr_code: string;
  name: string;
  company: string | null;
  title: string | null;
  photo_url: string | null;
  allow_name_display: boolean;
};

export type Booth = {
  id: number;
  code: string;
  name: string;
  discount_item_name: string;
  discount_item_price: number;
  discount_item_stock: number | null;
  is_active: boolean;
  discount_enabled: boolean;
  discount_limit_per_participant: number;
};

// Item spesial (diskon per booth, tebus murah, dst). Dikelola admin lewat
// /admin/offers tanpa perlu migrasi baru (BR-16).
export type SpecialOffer = {
  id: number;
  code: string;
  name: string;
  price: number;
  stock: number | null;
  scope: "per_booth" | "global";
  booth_id: number | null;
  max_per_participant: number;
  // Pohon syarat. children kosong = penawaran terbuka tanpa syarat.
  conditions: OfferConditionGroup;
  counts_toward_leaderboard: boolean;
  is_active: boolean;
  sort_order: number;
  is_builtin: boolean;
};

// Cakupan total transaksi. Dipisah eksplisit karena "total transaksi" tanpa
// keterangan cakupan ambigu: peserta bisa punya 1.320.000 lintas booth tapi hanya
// 470.000 di booth tertinggi, sehingga ambang 500.000 memberi hasil berbeda.
export type OfferSpendScope = "all_booths" | "this_booth" | "booth";

export type OfferConditionLeaf =
  | { var: "total_spend"; scope: OfferSpendScope; booth_id?: number | null; cmp: "gte" | "gt" | "lte" | "lt" | "eq"; value: number }
  | { var: "booth_count"; cmp: "gte" | "gt" | "lte" | "lt" | "eq"; value: number }
  | { var: "participant_type"; cmp: "in" | "not_in"; values: string[] };

export type OfferConditionNode = OfferConditionLeaf | OfferConditionGroup;

export type OfferConditionGroup = { op: "and" | "or"; children: OfferConditionNode[] };

// Hasil evaluasi dari server; `failed` menjelaskan syarat mana yang belum
// terpenuhi agar layar booth tidak hanya bilang "tidak tersedia".
export type OfferConditionResult = {
  passed: boolean;
  failed: Array<{ var: string; scope?: string | null; booth_id?: string | null; cmp?: string; value?: number; values?: string[]; actual?: number | string | null; reason?: string }>;
};

// Alasan penawaran tidak dapat diklaim, dihitung di server agar layar booth
// tidak perlu menebak.
export type OfferBlockedReason = "QUOTA_REACHED" | "OUT_OF_STOCK" | "CONDITIONS_NOT_MET" | null;

/**
 * Batas atas nominal item reguler per order.
 *
 * Tanpa batas ini, nominal 12 digit lolos validasi lalu ditolak Postgres dengan
 * SQLSTATE 22003 ("value out of range for type integer") — pesan yang tidak
 * dikenali `mapDatabaseError` sehingga staf booth membaca "Terjadi kesalahan
 * server. Coba lagi." untuk kesalahan yang sepenuhnya ada di kolom isian.
 *
 * Angkanya Rp 2 miliar, bukan int4 max (2.147.483.647). Menyisakan ruang di bawah
 * batas tipe supaya `regular_amount + harga item spesial` tidak dapat melampauinya
 * pada penjumlahan di dalam RPC — nominal yang sah sendiri tetapi menjadi tidak
 * sah setelah item ditambahkan adalah kegagalan yang paling sulit dijelaskan ke
 * staf booth.
 *
 * Tinggal di sini, bukan di route handler, karena kolom nominal di `/booth`
 * menjumlahkan beberapa suku di layar. Penjumlahan itu dapat melampaui batas
 * sebelum apa pun dikirim, dan menahannya di layar jauh lebih baik daripada
 * membiarkan staf menekan tombol untuk mendapat penolakan.
 */
export const MAX_ORDER_AMOUNT = 2_000_000_000;

export type Order = {
  id: string;
  code: string;
  participant_id: string;
  booth_id: number;
  has_discount_item: boolean;
  regular_amount: number;
  total_amount: number;
  status: OrderStatus;
  pickup_mode: PickupMode;
  // Snapshot: true bila order dilunasi otomatis tanpa kasir (BR-14).
  auto_settled: boolean;
  note: string | null;
  created_at: string;
  payment_method: PaymentMethod | null;
  approval_code: string | null;
  paid_at: string | null;
  handed_over_at: string | null;
  void_reason: string | null;
};

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  // Percobaan login terlalu banyak untuk satu username. Bukan kegagalan kredensial
  // dan bukan kesalahan server, jadi butuh kodenya sendiri: pesannya harus
  // menyebutkan lama tunggu, bukan menyuruh memeriksa PIN.
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "PARTICIPANT_NOT_FOUND"
  | "DISCOUNT_ALREADY_TAKEN"
  | "DISCOUNT_OUT_OF_STOCK"
  | "ORDER_CODE_USED"
  | "ORDER_NOT_PENDING"
  | "ORDER_NOT_VOIDABLE"
  | "ORDER_NOT_ELIGIBLE_FOR_HANDOVER"
  | "INVALID_APPROVAL_CODE"
  // Ditolak oleh create_order_transaction. Sebelumnya tidak terdaftar, sehingga
  // mapDatabaseError menjatuhkannya ke INTERNAL_ERROR dan staf booth membaca
  // "Terjadi kesalahan server. Coba lagi." untuk kesalahan yang mengulanginya
  // tidak akan pernah menyelesaikan.
  | "INVALID_ORDER_CODE"
  | "INVALID_AMOUNT"
  | "VOID_REASON_REQUIRED"
  | "PARTICIPANT_REMOVED"
  | "DISCOUNT_QUOTA_REACHED"
  | "DISCOUNT_NOT_OFFERED"
  | "USERNAME_TAKEN"
  | "USER_NOT_FOUND"
  | "BOOTH_NOT_FOUND"
  | "BOOTH_WITHOUT_TRANSACTIONS"
  | "EMPTY_ORDER"
  | "PAYMENT_METHOD_NOT_FOUND"
  | "PAYMENT_METHOD_INACTIVE"
  | "PAYMENT_METHOD_IN_USE"
  | "PAYMENT_METHOD_BUILTIN"
  | "DUPLICATE_PAYMENT_METHOD"
  | "AT_LEAST_ONE_PAYMENT_METHOD_REQUIRED"
  | "OFFER_NOT_FOUND"
  | "OFFER_INACTIVE"
  | "OFFER_WRONG_BOOTH"
  | "OFFER_CONDITIONS_NOT_MET"
  | "OFFER_IN_USE"
  | "OFFER_BUILTIN"
  | "OFFER_SCOPE_LOCKED_BUILTIN"
  | "OFFER_SCOPE_LOCKED_CLAIMED"
  | "DUPLICATE_OFFER_CODE"
  | "ORDER_TOTAL_MISMATCH"
  | "SEAT_MAP_SESSION_NOT_FOUND"
  | "DUPLICATE_SEAT_MAP_SLUG"
  | "SEAT_MAP_SESSION_UNPUBLISHED"
  | "RUNDOWN_SECTION_NOT_FOUND"
  | "RUNDOWN_ITEM_NOT_FOUND"
  | "DUPLICATE_RUNDOWN_SLUG"
  | "UNDIAN_PRIZE_NOT_FOUND"
  | "UNDIAN_PRIZE_IN_USE"
  | "UNDIAN_NO_ACTIVE_PRIZE"
  | "UNDIAN_POOL_EMPTY"
  | "UNDIAN_QUOTA_REACHED"
  | "UNDIAN_ALREADY_SPINNING"
  | "UNDIAN_ENTRY_GROUP_NOT_FOUND"
  | "UNDIAN_WINNER_NOT_FOUND"
  | "UNDIAN_WINNER_DECIDED"
  | "UNDIAN_RULE_NOT_FOUND"
  | "UNDIAN_SESSION_NOT_FOUND"
  | "UNDIAN_SESSION_ACTIVE"
  | "UNDIAN_SESSION_CLOSED"
  | "UNDIAN_NO_ACTIVE_SESSION"
  | "REGISTRATION_CLOSED"
  | "REGISTRATION_DUPLICATE_EMAIL"
  | "REGISTRATION_NOT_FOUND"
  | "REGISTRATION_ALREADY_REVIEWED"
  // Pendaftaran yang belum punya peserta tidak bisa dikirimi kode. Dipisahkan
  // dari REGISTRATION_NOT_FOUND karena tindak lanjutnya berbeda: yang ini
  // menyuruh menyetujui dulu, bukan mencari barisnya.
  | "REGISTRATION_NOT_APPROVED"
  | "ANNOUNCEMENT_NOT_FOUND"
  | "ANNOUNCEMENTS_NOT_READY"
  | "MESSAGES_NOT_READY"
  | "MESSAGE_NOT_FOUND"
  | "MESSAGE_NOT_DRAFT"
  | "MESSAGE_EMPTY"
  | "MESSAGE_COUNT_CHANGED"
  | "MESSAGE_TEST_NOT_ALLOWED"
  | "MESSAGING_BLOCKED"
  | "MESSAGE_SCHEDULE_NOT_ALLOWED"
  | "MESSAGE_RETRY_NOT_ALLOWED"
  | "MESSAGE_WHATSAPP_NOT_READY"
  | "EMAIL_NOT_CONFIGURED"
  | "EMAIL_SEND_FAILED"
  | "EMAIL_TEMPLATE_NOT_READY"
  | "MESSAGING_PREVIEW_BLOCKED"
  // Dua penjaga penghapusan event. Dipisah karena jalan keluarnya berbeda:
  // yang pertama diselesaikan dengan mengubah status, yang kedua tidak dapat
  // diselesaikan sama sekali — event yang pernah bertransaksi diarsipkan.
  | "EVENT_NOT_DELETABLE"
  | "EVENT_HAS_ORDERS"
  // Pengelolaan peserta oleh panitia sendiri. SOURCE_LOCKED berdiri sendiri dan
  // bukan varian FORBIDDEN: yang menolak bukan peran pengguna melainkan asal
  // barisnya, dan tindak lanjutnya adalah membetulkan data di Scanner API —
  // sesuatu yang tidak dilakukan di halaman ini.
  | "PARTICIPANT_SOURCE_LOCKED"
  | "PARTICIPANT_QR_TAKEN"
  | "PARTICIPANT_FIELDS_REQUIRED"
  | "PARTICIPANT_RSVP_INVALID"
  | "PARTICIPANT_EXTRA_INVALID"
  | "PARTICIPANT_IN_USE"
  // Tamu walk-in. Berdiri sendiri dan bukan FORBIDDEN: petugas yang membacanya
  // punya peran yang benar dan sedang berada di layar yang benar — yang mematikan
  // tombolnya adalah setelan acara, dan yang bisa menyalakannya adalah admin.
  | "WALKIN_DISABLED"
  | "IMPORT_EMPTY"
  | "IMPORT_TOO_LARGE"
  | "IMPORT_UNREADABLE"
  | "SCANNER_NOT_CONFIGURED"
  // Voting langsung. VOTE_ALREADY_CAST dipisah dari VALIDATION_ERROR karena
  // pemilih yang membacanya tidak melakukan kesalahan apa pun — suaranya sudah
  // masuk, dan yang perlu ia lihat adalah hasil, bukan perintah mengulang.
  | "VOTE_POLL_NOT_FOUND"
  | "VOTE_CLOSED"
  | "VOTE_ALREADY_CAST"
  | "VOTE_NO_OPTION"
  | "VOTE_OPTION_INVALID"
  | "VOTE_TOO_MANY"
  | "VOTE_INVALID_REQUEST"
  | "VOTE_HAS_BALLOTS"
  | "VOTE_QUESTION_REQUIRED"
  | "VOTE_NEED_TWO_OPTIONS"
  | "VOTE_TOO_MANY_OPTIONS"
  | "VOTE_OPTION_LABEL_REQUIRED"
  | "VOTE_CODE_NOT_FOUND"
  | "VOTE_RATING_INVALID"
  | "VOTE_WORD_TOO_LONG"
  | "VOTE_TEXT_BLOCKED"
  | "VOTE_BALLOT_NOT_FOUND"
  | "INTERNAL_ERROR";

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

/** Nama acara untuk halaman publik: `public_name` dari CMS, atau nama acara. */
export function publicEventName(event: { name: string; landing_config?: unknown }) {
  const nama = (event.landing_config as EventLandingConfig | null | undefined)?.public_name?.trim();
  return nama || event.name;
}

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
