import type { OrderStatus, PickupMode } from "./akses-acara.ts";
import type { EventLandingConfig } from "./landing-config.ts";

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
  /**
   * Peserta boleh mengisi atau mengubah jawaban ini sendiri setelah terdaftar:
   * kartu "Lengkapi data" di dashboard dan kiriman "Update details link"
   * (halaman /e/<slug>/lengkapi). Tidak berlaku untuk `file`.
   */
  participant_update?: boolean;
  /**
   * Ditanyakan di formulir pendaftaran publik dan formulir meja walk-in
   * ("Ask on the registration form"). Kosong = ditanyakan, jadi acara yang
   * sudah ada tidak berubah; false = hanya kolom di Participant list, diisi
   * panitia (atau peserta sendiri bila participant_update menyala) dan tidak
   * pernah wajib. `file` selalu ditanyakan. Lihat src/lib/kolom-staf.ts.
   */
  on_form?: boolean;
  /**
   * "Show answers in the public agenda": baris Agenda yang Who sees it-nya
   * memakai pertanyaan ini mendapat label jawabannya ("Batch 1") di halaman
   * acara sebelum masuk. Hanya select dan radio. Kosong = tanpa label, jadi
   * jawaban kolom khusus staf tidak pernah tampil tanpa izin panitia. Lihat
   * labelAgendaPublik di src/lib/sasaran-baris.ts.
   */
  agenda_label?: boolean;
  /**
   * Hanya di draf Edit form, tidak pernah disimpan: kunci pertanyaan baru ini
   * masih mengikuti teksnya (kunciIkutLabel di src/lib/kolom-staf.ts). Hilang
   * begitu Data key diketik sendiri, dan dibuang sebelum disimpan.
   */
  kunci_otomatis?: boolean;
};

/** Pertanyaan yang boleh diisi atau diubah peserta sendiri (participant_update). */
export function participantUpdatableFields(config: { fields?: RegistrationField[] } | null | undefined): RegistrationField[] {
  return ((config?.fields ?? []) as RegistrationField[]).filter((field) => field.participant_update === true && field.type !== "file");
}

/** Jenis yang memerlukan daftar pilihan. Kosongnya membuat field mustahil diisi. */
export const CHOICE_FIELD_TYPES: RegistrationFieldType[] = ["select", "radio"];

export const REGISTRATION_FIELD_TYPE_LABELS: Record<RegistrationFieldType, string> = {
  text: "Short text",
  email: "Email",
  tel: "Phone number",
  textarea: "Long text",
  select: "Dropdown",
  radio: "Multiple choice",
  checkbox: "Checkboxes",
  date: "Date",
  number: "Number",
  file: "File upload",
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
  | "ACCESS_ROLE_NOT_FOUND"
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
  | "OUTFIT_NOT_READY"
  // Sasaran bagian Agenda disimpan sebelum migrasi 202610180002 dijalankan.
  | "AUDIENCE_NOT_READY"
  // Show before sign-in bagian Agenda disimpan sebelum migrasi 202610260001 dijalankan.
  | "PUBLIC_DAY_NOT_READY"
  // Trip bus ditautkan ke baris Agenda sebelum migrasi 202610170002 dijalankan.
  // Trip tanpa tautan tetap tersimpan seperti biasa.
  | "TRIP_AGENDA_NOT_READY"
  | "CHECKPOINT_GOAL_NOT_READY"
  | "CHECKPOINT_SELF_SCAN_NOT_READY"
  | "CHECKPOINT_WHEN_NOT_READY"
  | "CHECKPOINT_MESSAGE_NOT_READY"
  | "CHECKPOINT_QR_NOT_READY"
  | "UNDIAN_PRIZE_NOT_FOUND"
  | "UNDIAN_PRIZE_IN_USE"
  | "UNDIAN_NO_ACTIVE_PRIZE"
  | "UNDIAN_POOL_EMPTY"
  | "UNDIAN_RULE_BROKEN"
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
  | "REGISTRATION_INVITE_ONLY"
  | "INVITATION_USED"
  | "INVITATION_NOT_FOUND"
  | "INVITATIONS_NOT_READY"
  // Acara disimpan di tempat lain pada saat yang sama; simpanan ini tidak ditulis.
  | "CONFLICT"
  | "SPEAKERS_CHANGED"
  | "CONTACT_CHANGED"
  | "PAYLOAD_TOO_LARGE"
  | "INVITATION_SENDING_LOCKED"
  | "MESSAGE_NOT_PAUSED"
  | "ANNOUNCEMENT_NOT_FOUND"
  | "TRACKING_NOT_READY"
  | "ANNOUNCEMENTS_NOT_READY"
  | "ROOM_NOTICES_NOT_READY"
  | "ANNOUNCEMENT_AUDIENCE_NOT_READY"
  | "ANNOUNCEMENT_MATCH_ANY_NOT_READY"
  | "ANNOUNCEMENT_PHOTO_NOT_READY"
  | "ANNOUNCEMENT_HIDE_NOT_READY"
  | "ANNOUNCEMENT_HIDDEN"
  | "ANNOUNCEMENT_NOTIFIED_RECENTLY"
  | "BADGE_NOT_READY"
  | "STASIUN_NOT_READY"
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
  | "REGISTRATION_QR_EXHAUSTED"
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
