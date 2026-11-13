import type { LandingCardTone } from "@/lib/landing-card-icons";
import { JENIS_BLOK, petaJenisBlok, type JenisBlok } from "../blok/jenis.ts";

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
/** Kartu: tiap pertanyaan berkartu (bawaan). Daftar: baris bergaris, bisa dikelompokkan per topik. */
export const LANDING_FAQ_LAYOUTS = ["cards", "list"] as const;
export type LandingFaqLayout = (typeof LANDING_FAQ_LAYOUTS)[number];
export const LANDING_FAQ_LAYOUT_LABELS: Record<LandingFaqLayout, string> = { cards: "Cards", list: "List" };
/** Panjang nama topik FAQ ("Perjalanan & hotel"). */
export const FAQ_GROUP_MAX = 40;

export type LandingSectionId = "about" | "highlights" | "agenda" | "speakers" | "venue" | "faq" | "sponsors" | "contact";

/**
 * Satu entri susunan halaman: bagian bawaan, atau blok dari pustaka blok
 * (`blk_...`, isinya di `landing_config.blocks`). Blok hanya dirender tata letak
 * Modern; Editorial melewatinya.
 */
export type LandingSection = { id: LandingSectionId | LandingBlockId; enabled: boolean };

/**
 * Tempat bagian otomatis "Portal peserta" (gaya gathering) di susunan halaman.
 * Hanya posisinya yang disimpan di `sections`; tampil atau tidaknya tetap
 * `portal_section`, jadi `enabled` di entri ini tidak dibaca. Tanpa entri ini
 * portal berada di akhir halaman, tepat di atas kaki, seperti sebelum bisa digeser.
 */
export const PORTAL_SECTION_ID = "portal";
export type LandingPortalEntry = { id: typeof PORTAL_SECTION_ID; enabled: boolean };
export type LandingSectionEntry = LandingSection | LandingPortalEntry;

export function isPortalEntry(section: LandingSectionEntry): section is LandingPortalEntry {
  return section.id === PORTAL_SECTION_ID;
}

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
/** Jenisnya didaftar sekali di src/lib/blok/jenis.ts. */
export type LandingBlockType = JenisBlok;

/**
 * Tempat blok tampil. `public` = halaman acara (bawaan, perilaku sebelum pilihan
 * ini ada), `member` = halaman peserta setelah masuk saja, `both` = keduanya.
 */
export const LANDING_BLOCK_SHOW_ON = ["public", "member", "both"] as const;
export type LandingBlockShowOn = (typeof LANDING_BLOCK_SHOW_ON)[number];
export const LANDING_BLOCK_SHOW_ON_LABELS: Record<LandingBlockShowOn, string> = { public: "Event page", member: "Participant page", both: "Both" };

/**
 * Jenis blok yang punya tampilan di halaman peserta, jadi boleh memilih
 * `show_on`. Sejak PR 2 semua jenis: di halaman peserta tiap jenis dirender
 * sebagai kartu ringkas (components/member/kartu-blok.tsx). Jenis baru yang
 * belum punya kartu tidak masuk daftar ini, supaya "Participant page" tidak
 * sama dengan menghapusnya.
 */
export const LANDING_BLOCK_MEMBER_TYPES: readonly LandingBlockType[] = JENIS_BLOK.filter((jenis) => jenis.peserta).map((jenis) => jenis.type);

/** Apakah blok tampil di halaman ini. Jenis tanpa tampilan peserta selalu halaman acara saja. */
export function landingBlockShownOn(block: Pick<LandingBlock, "type" | "show_on" | "audience">, page: "public" | "member"): boolean {
  const on = LANDING_BLOCK_MEMBER_TYPES.includes(block.type) ? block.show_on ?? "public" : "public";
  // Blok untuk satu kelompok (Who sees it) butuh peserta yang masuk: tidak
  // pernah di halaman publik, juga bila tersimpan sebagai Both.
  if (page === "public" && block.audience) return false;
  return on === "both" || on === page;
}

/**
 * Blok Kolom: pola multicolumn Shopify Dawn (columns_desktop 1 sampai 6,
 * image_ratio, column_alignment). Di sini dibatasi 1 sampai 4 kolom dan tiga
 * bentuk gambar bernama. Ukuran piksel, posisi bebas, dan warna per teks
 * sengaja tidak ada: halaman yang diisi siapa pun harus tetap rapi.
 */
export type LandingColumnCount = 1 | 2 | 3 | 4;
export type LandingImageShape = "wide" | "square" | "circle";
export const LANDING_IMAGE_SHAPE_LABELS: Record<LandingImageShape, string> = { wide: "Wide", square: "Square", circle: "Circle" };
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
/**
 * Blok Rute: satu ujung perjalanan. `hotel_id` = hotel di Logistik (nama dan
 * alamat selalu ikut data Logistik); tanpa itu, tempat ditulis bebas
 * (mis. stasiun). Hotel yang sudah dihapus membuat blok tidak tampil.
 */
export type LandingRouteStop = { hotel_id?: number; name?: string; address?: string };

/** Cara Google Maps menggambar rute (parameter `travelmode`). */
export const LANDING_ROUTE_MAPS_MODES = ["walking", "driving", "transit"] as const;
export type LandingRouteMapsMode = (typeof LANDING_ROUTE_MAPS_MODES)[number];
export const LANDING_ROUTE_MAPS_MODE_LABELS: Record<LandingRouteMapsMode, string> = { walking: "Walking", driving: "Driving", transit: "Public transport" };

export type LandingBlockLayout = "featured" | "overlay" | "columns" | "cards" | "numbered" | "list" | LandingCountdownStyle | "tiles";

/**
 * Jenis butir blok Do's and Don'ts: yang dianjurkan atau yang dihindari.
 * Kosong = dianjurkan.
 */
export type LandingDoKind = "do" | "dont";

/**
 * Gaya blok Hitung mundur. Tiap gaya punya kontrolnya sendiri di CMS; kolom
 * yang tidak dipakai gaya terpilih tetap tersimpan tetapi tidak dibaca.
 */
export type LandingCountdownStyle = "numbers" | "board" | "ticket" | "strip" | "photo" | "journey";

/**
 * Warna sorot blok Hitung mundur: warna tema (merek, aksen gathering, tinta)
 * atau heksadesimal sendiri "#RRGGBB". Bila kontrasnya terhadap latar kurang
 * dari 3:1 (angka besar), halaman memakai warna teks; CMS memperingatkan.
 */
export type LandingHighlight = "brand" | "accent" | "ink" | `#${string}`;

/** Blok Rute: satu langkah satu cara, dengan foto patokan opsional (mis. pintu lift). */
export type LandingRouteStep = { text?: string; image_url?: string | null; en?: { text?: string } };
/** Batas langkah per cara dan panjang satu langkah. Sama di CMS dan validasi server. */
export const LANDING_ROUTE_STEPS_MAX = 12;
export const LANDING_ROUTE_STEP_TEXT_MAX = 120;

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
  /** Rute: nama ikon Phosphor tiap cara ke sana (landing-card-icons.ts). Kosong = mobil. */
  icon?: string;
  /** Rute: warna ubin ikon dari tema. Kosong = Brand. */
  tone?: LandingCardTone;
  /** Rute: gambar ikon sendiri. Diisi = menggantikan ikon dan ubinnya. */
  icon_url?: string | null;
  /**
   * Rute: langkah cara ini, masing-masing boleh berfoto. Diisi = menggantikan
   * `body`; cara lama tanpa `steps` tetap membaca `body` (satu langkah per baris).
   */
  steps?: LandingRouteStep[];
  /** Do's and Don'ts: anjuran atau larangan. Kosong = anjuran. */
  kind?: LandingDoKind;
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
  /** Kolom: perataan teks dan gambar di dalam kolom (kiri, tengah). Logo: perataan judul dan deret logo. */
  align?: LandingBlockAlign;
  /**
   * Rute: titik berangkat dan tujuan. Butir = cara ke sana (`icon`, `label`
   * nama, `value` waktu, `steps` langkah berfoto; cara lama: `body` satu
   * langkah per baris, `image_url` satu foto patokan). Satu langkah tanpa foto
   * tampil sebagai catatan pendek. `body` blok = langkah untuk semua cara,
   * bentuk lama: CMS hanya menampilkannya bila terisi.
   */
  route_from?: LandingRouteStop;
  route_to?: LandingRouteStop;
  /** Rute: kosong = mengemudi. */
  maps_mode?: LandingRouteMapsMode;
  /** Rute: false = tanpa tombol Google Maps, untuk rute di dalam satu gedung. Kosong = tombol tampil. */
  maps_button?: false;
  /** Rute: denah atau peta jalan ke sana, tampil utuh di bawah cara; ketuk untuk layar penuh. */
  map_image_url?: string | null;
  /**
   * Rute: siapa yang melihatnya di halaman peserta (src/lib/sasaran-blok.ts).
   * Kosong = semua peserta yang masuk. Halaman acara publik tidak terpengaruh.
   */
  audience?: { field: string; values: string[] };
  /** Rute: baris Agenda (rundown_items.id) yang diberi tautan "Cara ke sana" di Horizon. */
  agenda_item_ids?: number[];
  /**
   * Dress code: tab Agenda (rundown_sections.id) yang ditampilkan. Kosong =
   * semua tab terbit yang punya dress code. Isinya dibaca dari Agenda >
   * Dress code, tidak disimpan di blok (src/lib/dress-code-publik.ts).
   */
  section_ids?: number[];
  /** Halaman tempat blok tampil (LANDING_BLOCK_MEMBER_TYPES saja). Kosong = halaman acara. */
  show_on?: LandingBlockShowOn;
  /** Hitung mundur: label asal dan tujuan di gaya Tiket (bawaan "Hari ini" dan nama tempat acara). */
  countdown_from?: string;
  countdown_to?: string;
  /** Hitung mundur: ikon Phosphor penanda rute (mis. "Airplane", "Train"), atau gambar sendiri. Kosong = tanpa ikon. */
  icon?: string;
  icon_url?: string | null;
  /** Hitung mundur: warna sorot. Kosong = merek. */
  highlight?: LandingHighlight;
  /** Background › Custom: latar warna sendiri "#RRGGBB", menggantikan `tone`. Warna teks dipilih otomatis. */
  bg_color?: string;
  /** Hitung mundur: tampilkan detik. Bawaan menyala di Papan, mati di gaya lain. */
  seconds?: boolean;
  /** Do's and Don'ts: judul kelompok anjuran dan larangan. Kosong = "Lakukan" / "Hindari" (atau "Do" / "Don't"). */
  do_label?: string;
  dont_label?: string;
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
  "eyebrow", "heading", "body", "link_label", "link2_label", "fact_title", "fact_body", "source", "quote", "name", "role", "nav_label", "countdown_from", "countdown_to", "do_label", "dont_label",
] as const;
export type LandingBlockEn = Partial<Record<(typeof LANDING_BLOCK_EN_KEYS)[number], string>>;

/** Kolom teks butir blok yang punya versi English. */
export const LANDING_ITEM_EN_KEYS = ["label", "title", "body", "value"] as const;
export type LandingItemEn = Partial<Record<(typeof LANDING_ITEM_EN_KEYS)[number], string>>;

/** Kolom teks pembicara yang punya versi English. Nama orang tidak diterjemahkan. */
export const LANDING_SPEAKER_EN_KEYS = ["title", "company", "role", "session", "bio"] as const;
export type LandingSpeakerEn = Partial<Record<(typeof LANDING_SPEAKER_EN_KEYS)[number], string>>;

/**
 * Teks English tingkat halaman. Empat kolom terakhir (`tagline`, `description`,
 * `venue_name`, `venue_address`) versi English dari kolom tabel `events`:
 * kolom itu tetap satu sumber untuk email, kalender, dan ekspor, jadi
 * terjemahannya tinggal di sini.
 */
export const LANDING_CONFIG_EN_KEYS = [
  "public_name", "cta_label", "about_heading", "about_image_alt", "program_heading", "program_intro", "agenda_note", "footer_note", "cta_heading", "cta_note", "contact_name",
  "about_eyebrow", "agenda_eyebrow", "speakers_eyebrow", "venue_eyebrow", "faq_eyebrow",
  "agenda_heading", "speakers_heading", "venue_heading", "faq_heading", "faq_intro", "hero_note", "hero_eyebrow",
  "hero_button_label", "hero_index", "portal_eyebrow", "portal_heading", "portal_note", "portal_button_label",
] as const;
export const LANDING_EVENT_EN_KEYS = ["tagline", "description", "venue_name", "venue_address"] as const;
export type LandingConfigEn = Partial<Record<(typeof LANDING_CONFIG_EN_KEYS)[number] | (typeof LANDING_EVENT_EN_KEYS)[number], string>> & {
  /** Urut sesuai `program_notes`. */
  program_notes?: string[];
  /** Urut sesuai `about_cards`; kolom kosong memakai teks Indonesia. */
  about_cards?: { title?: string; body?: string }[];
};

/**
 * Bingkai foto kartu pembicara (Modern), setelan bagian Pembicara, bukan Tema:
 * bentuk yang cocok bergantung pada foto-fotonya, bukan pada merek. `portrait`
 * (bawaan): 4:5, sudut dari Corners. `circle`: bulat 1:1, tanpa Corners.
 * `arch`: 4:5, atas setengah lingkaran, sudut bawah dari Corners. Forum dan
 * Editorial tetap memakai bentuk rancangannya sendiri.
 */
export const LANDING_SPEAKER_FRAMES = ["portrait", "circle", "arch"] as const;
export type LandingSpeakerFrame = (typeof LANDING_SPEAKER_FRAMES)[number];
export const LANDING_SPEAKER_FRAME_LABELS: Record<LandingSpeakerFrame, string> = { portrait: "Portrait", circle: "Circle", arch: "Arch" };

/**
 * Pembicara di Susunan acara (Modern). `text`: Details apa adanya, foto bertumpuk
 * di kolom kanan selama bagian Pembicara menyala (bawaan, perilaku lama).
 * `names` dan `photos`: daftar pembicara tertaut di bawah judul sesi, satu
 * orang satu baris, diambil dari data Pembicara walau bagiannya dimatikan.
 */
export const LANDING_AGENDA_SPEAKERS = ["text", "names", "photos"] as const;
export type LandingAgendaSpeakers = (typeof LANDING_AGENDA_SPEAKERS)[number];
export const LANDING_AGENDA_SPEAKERS_LABELS: Record<LandingAgendaSpeakers, string> = { text: "Text", names: "Names", photos: "Names with photos" };

/** Perataan blok. Kolom memakai kiri dan tengah; Logo juga kanan. */
export type LandingBlockAlign = "left" | "center" | "right";
export const LANDING_BLOCK_ALIGN_LABELS: Record<LandingBlockAlign, string> = { left: "Left", center: "Centre", right: "Right" };

export const LANDING_ABOUT_MEDIA = ["auto", "image", "none"] as const;
export type LandingAboutMedia = (typeof LANDING_ABOUT_MEDIA)[number];
export const LANDING_ABOUT_MEDIA_LABELS: Record<LandingAboutMedia, string> = { auto: "Automatic", image: "Own image", none: "No image" };
/** Batas teks alternatif gambar Tentang acara. */
export const LANDING_IMAGE_ALT_MAX = 160;

/** Bagian bawaan yang judulnya bisa disunting, dan label kecilnya menyala atau tidak bila belum diatur. */
export const LANDING_EYEBROW_DEFAULT = { about: false, agenda: true, speakers: false, venue: true, faq: false } as const satisfies Partial<Record<LandingSectionId, boolean>>;
export type LandingHeadedSection = keyof typeof LANDING_EYEBROW_DEFAULT;
/**
 * Batas judul bagian (label 36, judul 60, pengantar 140). Label 36 supaya
 * label rancangan Gathering Horizon "KEBERSAMAAN, TANPA TERBURU-BURU" (31) muat.
 */
export const LANDING_SECTION_TEXT_MAX = { eyebrow: 36, heading: 60, headingIdeal: 48, intro: 140 } as const;

/** Batas teks Gathering Horizon yang bisa disunting (tombol hero, label sudut, ajakan Portal peserta). */
export const HORIZON_TEXT_MAX = { hero_button_label: 40, hero_index: 40, portal_eyebrow: 60, portal_heading: 80, portal_note: 240, portal_button_label: 40 } as const;

/** Panjang label menu atas: satu atau dua kata pendek, supaya menu muat satu baris. */
export const LANDING_NAV_LABEL_MAX = 16;

export const LANDING_BLOCK_LABELS: Record<LandingBlockType, string> = petaJenisBlok("label");

export const LANDING_BLOCK_DESCRIPTIONS: Record<LandingBlockType, string> = petaJenisBlok("description");

export const LANDING_BLOCK_TONE_LABELS: Record<LandingBlockTone, string> = {
  light: "Light",
  panel: "Grey",
  dark: "Dark brand",
};

/** Latar bawaan tiap jenis blok saat baru ditambahkan. */
export const LANDING_BLOCK_DEFAULT_TONE: Record<LandingBlockType, LandingBlockTone> = petaJenisBlok("latar");

export const LANDING_BLOCK_LAYOUTS: Partial<Record<LandingBlockType, { value: LandingBlockLayout; label: string; hint: string }[]>> = {
  cards: [
    { value: "overlay", label: "Text on photo", hint: "Title over the photo, 2 or 3 cards per row. Good for main sessions." },
    { value: "columns", label: "Three columns", hint: "Photo on top, text below, 3 or 6 cards. Good for group discussions or reading." },
    { value: "featured", label: "Large feature", hint: "A large first card with two small cards beside it." },
  ],
  points: [
    { value: "cards", label: "Cards", hint: "3 or 4 numbered cards in a row." },
    { value: "numbered", label: "Numbered list", hint: "Title on the left, 3 to 7 numbered rows on the right." },
    { value: "list", label: "Two-column list", hint: "Title on the left, short points in two columns." },
  ],
  countdown: [
    { value: "numbers", label: "Numbers", hint: "Heading on the left, large days, hours and minutes on the right. Calm and fits any event." },
    { value: "board", label: "Flip board", hint: "Each digit on its own tile, like an airport departure board. The digits flip as they change." },
    { value: "ticket", label: "Ticket", hint: "A ticket with a route from today to the event, an icon that moves closer each day, and the days left on the stub." },
    { value: "strip", label: "Slim strip", hint: "One slim line: days left, a progress route and the time. Good right under the hero." },
    { value: "photo", label: "Photo", hint: "Large numbers over your own photo, with a dark layer so they stay readable." },
    { value: "journey", label: "Journey", hint: "Days left and a rail route to the destination. On first view the icon travels to today's position and the destination glows; all motion ends within 5 seconds. Good right under the hero." },
  ],
  dos_donts: [
    { value: "tiles", label: "Icon grid", hint: "Each item in its own tile with a large icon and a tick or cross badge. The most visual, and the longest on phones." },
    { value: "cards", label: "Two cards", hint: "One card for Do and one for Don't, side by side on wide screens. Reads like a checklist." },
    { value: "list", label: "Compact list", hint: "Icons and text without cards, two columns on wide screens. More than 6 Do items fold behind a Show more button; Don't items always show in full." },
  ],
};

/** Detik tampil? Bawaan menyala di Papan saja. */
export function countdownSeconds(block: Pick<LandingBlock, "type" | "layout" | "seconds">): boolean {
  return block.seconds ?? landingBlockLayout(block) === "board";
}

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
  countdown_from?: LandingTextLimit;
  countdown_to?: LandingTextLimit;
  do_label?: LandingTextLimit;
  dont_label?: LandingTextLimit;
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
    case "route":
      return { eyebrow: ALIS_BATAS, heading: { max: 60, ideal: 48 }, body: { max: 600 }, item: { label: { max: 40 }, value: { max: 20 }, body: { max: 160, ideal: 120 } }, items: { max: 4 } };
    case "countdown":
      return { eyebrow: ALIS_BATAS, heading: { max: 44, ideal: 36 }, countdown_from: { max: 16 }, countdown_to: { max: 28, ideal: 20 } };
    case "dos_donts":
      // Satu kalimat per butir: di kisi ikon lima kolom (~210px) 60 karakter sudah tiga baris.
      return {
        eyebrow: ALIS_BATAS, heading: { max: 60, ideal: 48 }, body: PENGANTAR_BATAS, do_label: { max: 24 }, dont_label: { max: 24 },
        item: { title: { max: 60, ideal: 44 }, body: { max: 120, ideal: 90 } },
        items: { max: DOS_DONTS_MAX },
      };
    case "dress_code":
      return { eyebrow: ALIS_BATAS, heading: { max: 60, ideal: 48 }, body: PENGANTAR_BATAS };
  }
}

/** Batas butir blok Do's and Don'ts (gabungan anjuran dan larangan). */
export const DOS_DONTS_MAX = 20;

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
export function landingBlockHasContent(
  block: LandingBlock,
  /** Id hotel di Logistik. Diisi = titik Rute yang hotelnya sudah dihapus dihitung kosong. */
  hotelIds?: ReadonlySet<number>,
): boolean {
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
    // Dua ujung saja sudah berguna: tombol Maps.
    case "route": return routeStopFilled(block.route_from, hotelIds) && routeStopFilled(block.route_to, hotelIds);
    // Isinya tanggal acara, bukan isian blok. Acara tanpa tanggal atau yang sudah
    // selesai disaring saat render (src/lib/landing-hitung-mundur.ts).
    case "countdown": return true;
    case "dos_donts": return items.some((item) => item.title?.trim());
    // Isinya dari Agenda > Dress code, bukan isian blok. Tanpa dress code yang
    // terbit, halaman tidak merender dan tidak menautkannya (bagianModern).
    case "dress_code": return true;
  }
}

function routeStopFilled(stop: LandingRouteStop | undefined, hotelIds?: ReadonlySet<number>): boolean {
  if (stop?.hotel_id) return hotelIds ? hotelIds.has(stop.hotel_id) : true;
  return Boolean(stop?.name?.trim());
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

/** Nama bagian di editor admin (English). `LANDING_SECTION_LABELS` di atas tetap label bawaan halaman publik. */
export const LANDING_SECTION_ADMIN_LABELS: Record<LandingSectionId, string> = {
  about: "About the event",
  highlights: "Key figures",
  agenda: "Agenda",
  speakers: "Speakers",
  venue: "Venue",
  faq: "FAQ",
  sponsors: "Sponsors & partners",
  contact: "Staff contacts",
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
  about: { text: "Event description, filled in on this page" },
  highlights: { text: "Filled in on this page" },
  agenda: {
    text: "Pulled automatically from the Agenda module",
    href: "/admin/rundown",
    linkLabel: "Open Agenda",
  },
  speakers: { text: "Filled in on this page" },
  venue: {
    text: "Name, address and map are filled in on this page. The seating plan button opens the Seating plan module",
    href: "/admin/seat-map",
    linkLabel: "Open Seating plan",
  },
  faq: { text: "Filled in on this page" },
  sponsors: { text: "Logos are uploaded on this page" },
  contact: {
    text: "Filled in once under Event settings, and shared with the registration, invitation and participant pages",
    href: "/admin/settings",
    linkLabel: "Open Event settings",
  },
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
export function normalizeLandingSections(saved: LandingSectionEntry[] | undefined, blocks: LandingBlock[] = []): LandingSection[] {
  const ids = new Set(blocks.map((block) => block.id));
  // Blok yang tersimpan di `blocks` tapi belum ada di susunan masuk di akhir;
  // entri susunan yang bloknya sudah dihapus dibuang.
  const yatim = blocks.filter((block) => !saved?.some((section) => section.id === block.id)).map((block) => ({ id: block.id, enabled: true }));
  if (!saved?.length) return [...DEFAULT_LANDING_SECTIONS, ...yatim];
  const next = saved.filter((section): section is LandingSection =>
    isLandingBlockId(section.id) ? ids.has(section.id) : DEFAULT_LANDING_SECTIONS.some((item) => item.id === section.id),
  );
  DEFAULT_LANDING_SECTIONS.forEach((item, index) => {
    if (next.some((section) => section.id === item.id)) return;
    next.splice(Math.min(index, next.length), 0, item);
  });
  return [...next, ...yatim];
}

/**
 * Blok untuk halaman peserta: yang tampil (mata menyala), dipilih untuk
 * Participant page atau Both, dan berisi; urut seperti di Page sections.
 */
export function landingMemberBlocks(saved: LandingSectionEntry[] | undefined, blocks: LandingBlock[] = [], hotelIds?: ReadonlySet<number>): LandingBlock[] {
  const byId = new Map<string, LandingBlock>(blocks.map((block) => [block.id, block]));
  return normalizeLandingSections(saved, blocks).flatMap((section) => {
    const block = section.enabled ? byId.get(section.id) : undefined;
    return block && landingBlockShownOn(block, "member") && landingBlockHasContent(block, hotelIds) ? [block] : [];
  });
}

/**
 * Blok khusus peserta: Show on = Participant page. Tampil-sembunyinya diatur di
 * Participant area > Participant home (`member.home.hidden`), bukan di Page
 * sections Event page, karena halaman publik memang tidak menampilkannya.
 */
export function landingBlockMemberOnly(block: Pick<LandingBlock, "type" | "show_on">): boolean {
  return landingBlockShownOn(block, "member") && !landingBlockShownOn(block, "public");
}

/**
 * Page sections setelah mata Participant home disimpan: blok khusus peserta di
 * `nyalakan` (mata yang dinyalakan admin di layar itu) dinyalakan lagi di
 * susunan. Blok lama yang dulu dimatikan di Page sections tampil di
 * Participant home sebagai tersembunyi (lihat GET Area peserta), jadi hanya
 * mata yang memang dinyalakan yang mengubah susunan, bukan salinan basi.
 * Tanpa perubahan: susunan yang sama.
 */
export function sectionsDenganBlokPeserta(saved: LandingSectionEntry[] | undefined, blocks: LandingBlock[] = [], nyalakan: readonly string[] = []): LandingSectionEntry[] | undefined {
  if (!saved) return saved;
  const ids = new Set(blocks.filter((block) => landingBlockMemberOnly(block) && nyalakan.includes(block.id)).map((block) => block.id as string));
  if (!saved.some((section) => !section.enabled && ids.has(section.id))) return saved;
  return saved.map((section) => (!section.enabled && ids.has(section.id) ? { ...section, enabled: true } : section));
}

/**
 * Page sections dari editor Event page: saklar blok khusus peserta yang sudah
 * tersimpan diambil dari server, karena editor itu tidak lagi memilikinya
 * (diatur mata Participant home). Salinan editor yang basi tidak
 * menyembunyikan lagi blok yang baru dinyalakan di Participant home.
 */
export function sectionsDariEventPage(kirim: LandingSectionEntry[] | undefined, blocks: LandingBlock[] = [], tersimpan: LandingSectionEntry[] | undefined): LandingSectionEntry[] | undefined {
  if (!kirim || !tersimpan) return kirim;
  const lama = new Map<string, boolean>(tersimpan.map((section) => [section.id, section.enabled]));
  const peserta = new Set(blocks.filter(landingBlockMemberOnly).map((block) => block.id as string));
  return kirim.map((section) => {
    const enabled = lama.get(section.id);
    return peserta.has(section.id) && enabled !== undefined && enabled !== section.enabled ? { ...section, enabled } : section;
  });
}

/**
 * Susunan gaya gathering: `normalizeLandingSections` plus entri Portal peserta
 * di tempat yang disimpan admin. Tempatnya diukur dari bagian sebelum entri itu
 * di susunan tersimpan, jadi bagian yang ditambahkan normalisasi tidak
 * menggesernya. Tanpa entri tersimpan, portal ditaruh di akhir.
 */
export function susunanDenganPortal(saved: LandingSectionEntry[] | undefined, blocks: LandingBlock[] = []): LandingSectionEntry[] {
  const susunan: LandingSectionEntry[] = normalizeLandingSections(saved, blocks);
  const posisi = saved?.findIndex(isPortalEntry) ?? -1;
  if (posisi < 0) return [...susunan, { id: PORTAL_SECTION_ID, enabled: true }];
  // Bagian tersimpan terdekat sebelum portal yang masih ada di susunan.
  for (let i = posisi - 1; i >= 0; i -= 1) {
    const sebelum = susunan.findIndex((section) => section.id === saved![i].id);
    if (sebelum >= 0) return [...susunan.slice(0, sebelum + 1), { id: PORTAL_SECTION_ID, enabled: true }, ...susunan.slice(sebelum + 1)];
  }
  return [{ id: PORTAL_SECTION_ID, enabled: true }, ...susunan];
}
