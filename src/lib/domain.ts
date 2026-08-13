import type { EventTimeZone } from "./timezone";

// super_admin = pemilik sistem. Memegang operasi yang tidak dapat dibalik (reset
// data, kelola user/role) yang tidak dibutuhkan klien untuk menjalankan acara.
export type UserRole = "booth" | "cashier" | "admin" | "super_admin";
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
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

// ID IANA, bukan singkatan. Sengaja mengacu ke EVENT_TIME_ZONES di
// src/lib/timezone.ts agar menambah zona hanya perlu satu perubahan; menulis
// ulang unionnya di sini membuat kedua daftar bisa berbeda tanpa gagal compile.
// "WIB"/"WITA"/"WIT" hanyalah label tampilan (timeZoneAbbr).
export type EventTimeZoneCode = EventTimeZone;

// Field wajib registrasi publik TIDAK ada di sini. Nama, email, dan telepon
// ditegakkan sebagai kolom NOT NULL di tabel pendaftaran, bukan sebagai entri
// konfigurasi -- konfigurasi bisa dikosongkan admin, dan pendaftar tanpa email
// tidak punya jalan menerima QR-nya.
export type RegistrationFormConfig = {
  fields?: RegistrationField[];
  welcome_text?: string;
  success_text?: string;
  /** Jadikan perusahaan wajib. Bawaan opsional. */
  require_company?: boolean;
  /** Jadikan jabatan wajib. Bawaan opsional. */
  require_job_title?: boolean;
};

export type RegistrationField = {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select";
  required: boolean;
  options?: string[];
  placeholder?: string;
  help_text?: string;
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
  | "INTERNAL_ERROR";

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};
