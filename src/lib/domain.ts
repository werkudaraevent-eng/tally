// super_admin = pemilik sistem. Memegang operasi yang tidak dapat dibalik (reset
// data, kelola user/role) yang tidak dibutuhkan klien untuk menjalankan acara.
export type UserRole = "booth" | "cashier" | "admin" | "super_admin";
export type OrderStatus = "pending" | "paid" | "void" | "handed_over";
export type PickupMode = "after_payment" | "immediate";

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
  | "VALIDATION_ERROR"
  | "PARTICIPANT_NOT_FOUND"
  | "DISCOUNT_ALREADY_TAKEN"
  | "DISCOUNT_OUT_OF_STOCK"
  | "ORDER_CODE_USED"
  | "ORDER_NOT_PENDING"
  | "ORDER_NOT_VOIDABLE"
  | "ORDER_NOT_ELIGIBLE_FOR_HANDOVER"
  | "INVALID_APPROVAL_CODE"
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
  | "INTERNAL_ERROR";

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};
