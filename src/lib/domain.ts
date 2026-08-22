import type { EventTimeZone } from "./timezone";
import type { RegistrationFormTheme } from "./registration-theme";

// super_admin = pemilik sistem. Memegang operasi yang tidak dapat dibalik (reset
// data, kelola user/role) yang tidak dibutuhkan klien untuk menjalankan acara.
// scanner = petugas pemindai kehadiran. Akun paling sempit di sistem: hanya bisa
// membuka layar /scan. Ada karena HP di pintu masuk sering dipegang bergantian,
// dan akun yang juga membuka transaksi serta data peserta adalah risiko yang
// tidak dibutuhkan di sana.
export type UserRole = "booth" | "cashier" | "admin" | "super_admin" | "scanner";
export type OrderStatus = "pending" | "paid" | "void" | "handed_over";
export type PickupMode = "after_payment" | "immediate";

// ============================================================================
// Multi-Event Types
// ============================================================================

export type EventStatus = "draft" | "active" | "completed" | "archived";

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
export type LandingSectionId = "about" | "highlights" | "agenda" | "venue" | "faq" | "sponsors" | "contact";

export type LandingSection = { id: LandingSectionId; enabled: boolean };

export const LANDING_SECTION_LABELS: Record<LandingSectionId, string> = {
  about: "Tentang acara",
  highlights: "Angka penting",
  agenda: "Susunan acara",
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
  about: { text: "Deskripsi acara — diisi di halaman ini" },
  highlights: { text: "Diisi di halaman ini" },
  agenda: {
    text: "Ditarik otomatis dari modul Rundown acara",
    href: "/admin/rundown",
    linkLabel: "Buka Rundown",
  },
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
  { id: "venue", enabled: true },
  { id: "faq", enabled: false },
  { id: "sponsors", enabled: true },
  { id: "contact", enabled: false },
];

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

export type EventLandingConfig = {
  banner_url?: string | null;
  /** Bawaan `theme` — perilaku sebelum pilihan ini ada. */
  banner_style?: LandingBannerStyle;
  /** Bawaan `standard`. */
  hero_height?: LandingHeroHeight;
  cta_label?: string;
  sections?: LandingSection[];
  /** Angka yang ingin ditonjolkan: "300+ peserta", "12 booth". */
  highlights?: { label: string; value: string }[];
  faq?: { q: string; a: string }[];
  /** Logo sponsor dan mitra. Diunggah di CMS halaman acara, bukan ditarik dari layar lain. */
  sponsors?: { name?: string; logo_url: string }[];
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  /**
   * Warna merek halaman. Bentuknya sama dengan tema form pendaftaran, dan
   * memang disengaja: satu acara punya satu warna, dua permukaan.
   */
  theme?: RegistrationFormTheme;
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
  /** Hanya untuk `select` dan `radio`. */
  options?: string[];
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
  | "EMAIL_NOT_CONFIGURED"
  | "EMAIL_SEND_FAILED"
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
  | "PARTICIPANT_IN_USE"
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
