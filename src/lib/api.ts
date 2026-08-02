import type { ApiErrorCode } from "./domain";

const messages: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: "Sesi login tidak ditemukan.",
  FORBIDDEN: "Anda tidak punya izin untuk aksi ini.",
  VALIDATION_ERROR: "Data yang dikirim belum valid.",
  PARTICIPANT_NOT_FOUND: "Peserta tidak ditemukan.",
  DISCOUNT_ALREADY_TAKEN: "Peserta sudah mengambil item diskon di booth ini.",
  DISCOUNT_OUT_OF_STOCK: "Item diskon di booth ini sudah habis.",
  ORDER_CODE_USED: "Nomor stiker sudah terpakai. Gunakan stiker berikutnya.",
  ORDER_NOT_PENDING: "Order sudah diproses dan tidak lagi pending.",
  ORDER_NOT_VOIDABLE: "Order tidak dapat dibatalkan pada status ini.",
  ORDER_NOT_ELIGIBLE_FOR_HANDOVER: "Order belum siap diserahkan.",
  INVALID_APPROVAL_CODE: "Nomor referensi pembayaran tidak sesuai jumlah digit yang diminta.",
  DISCOUNT_QUOTA_REACHED: "Peserta sudah mencapai batas maksimum item diskon.",
  DISCOUNT_NOT_OFFERED: "Booth ini tidak menyediakan item diskon.",
  USERNAME_TAKEN: "Username sudah dipakai. Gunakan username lain.",
  USER_NOT_FOUND: "User tidak ditemukan.",
  BOOTH_NOT_FOUND: "Booth tidak ditemukan.",
  BOOTH_WITHOUT_TRANSACTIONS: "Booth ini disetel tanpa transaksi, jadi nominal item reguler harus Rp 0.",
  EMPTY_ORDER: "Order kosong. Isi nominal item reguler atau pilih minimal satu item.",
  PAYMENT_METHOD_NOT_FOUND: "Metode pembayaran tidak ditemukan.",
  PAYMENT_METHOD_INACTIVE: "Metode pembayaran ini sedang dimatikan admin.",
  PAYMENT_METHOD_IN_USE: "Metode sudah dipakai order. Matikan saja, jangan dihapus.",
  PAYMENT_METHOD_BUILTIN: "Metode bawaan tidak dapat dihapus. Matikan saja bila tidak dipakai.",
  DUPLICATE_PAYMENT_METHOD: "Kode metode pembayaran sudah dipakai.",
  AT_LEAST_ONE_PAYMENT_METHOD_REQUIRED: "Minimal satu metode pembayaran harus aktif.",
  OFFER_NOT_FOUND: "Penawaran spesial tidak ditemukan.",
  OFFER_INACTIVE: "Penawaran spesial ini sedang dimatikan admin.",
  OFFER_WRONG_BOOTH: "Penawaran ini hanya berlaku di booth lain.",
  OFFER_CONDITIONS_NOT_MET: "Peserta belum memenuhi syarat penawaran ini.",
  OFFER_IN_USE: "Penawaran sudah diklaim order. Matikan saja, jangan dihapus.",
  OFFER_BUILTIN: "Penawaran bawaan booth tidak dapat dihapus. Matikan saja bila tidak dipakai.",
  OFFER_SCOPE_LOCKED_BUILTIN: "Penawaran bawaan booth selalu terikat booth-nya. Buat penawaran baru bila perlu cakupan lain.",
  OFFER_SCOPE_LOCKED_CLAIMED: "Cakupan tidak dapat diubah karena penawaran sudah pernah diklaim. Buat penawaran baru.",
  DUPLICATE_OFFER_CODE: "Kode penawaran sudah dipakai.",
  ORDER_TOTAL_MISMATCH: "Total order tidak cocok dengan item yang diklaim.",
  SEAT_MAP_SESSION_NOT_FOUND: "Sesi denah tidak ditemukan.",
  DUPLICATE_SEAT_MAP_SLUG: "Slug sesi denah sudah dipakai. Gunakan slug lain.",
  SEAT_MAP_SESSION_UNPUBLISHED: "Denah sesi ini belum dipublikasikan.",
  INTERNAL_ERROR: "Terjadi kesalahan server. Coba lagi.",
};

export function apiError(code: ApiErrorCode, status: number, details?: unknown) {
  return Response.json({ error: { code, message: messages[code], details } }, { status });
}

export function mapDatabaseError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  if (message.includes("DISCOUNT_ALREADY_TAKEN")) return "DISCOUNT_ALREADY_TAKEN" as const;
  if (message.includes("ORDER_CODE_USED")) return "ORDER_CODE_USED" as const;
  if (message.includes("DISCOUNT_OUT_OF_STOCK")) return "DISCOUNT_OUT_OF_STOCK" as const;
  if (message.includes("INVALID_APPROVAL_CODE")) return "INVALID_APPROVAL_CODE" as const;
  if (message.includes("ORDER_NOT_PENDING")) return "ORDER_NOT_PENDING" as const;
  if (message.includes("ORDER_NOT_VOIDABLE")) return "ORDER_NOT_VOIDABLE" as const;
  if (message.includes("ORDER_NOT_ELIGIBLE_FOR_HANDOVER")) return "ORDER_NOT_ELIGIBLE_FOR_HANDOVER" as const;
  if (message.includes("PARTICIPANT_NOT_FOUND")) return "PARTICIPANT_NOT_FOUND" as const;
  if (message.includes("DISCOUNT_QUOTA_REACHED")) return "DISCOUNT_QUOTA_REACHED" as const;
  if (message.includes("DISCOUNT_NOT_OFFERED")) return "DISCOUNT_NOT_OFFERED" as const;
  if (message.includes("USERNAME_TAKEN")) return "USERNAME_TAKEN" as const;
  if (message.includes("USER_NOT_FOUND")) return "USER_NOT_FOUND" as const;
  if (message.includes("BOOTH_NOT_FOUND")) return "BOOTH_NOT_FOUND" as const;
  if (message.includes("BOOTH_WITHOUT_TRANSACTIONS")) return "BOOTH_WITHOUT_TRANSACTIONS" as const;
  if (message.includes("EMPTY_ORDER")) return "EMPTY_ORDER" as const;
  if (message.includes("PAYMENT_METHOD_NOT_FOUND")) return "PAYMENT_METHOD_NOT_FOUND" as const;
  if (message.includes("PAYMENT_METHOD_INACTIVE")) return "PAYMENT_METHOD_INACTIVE" as const;
  if (message.includes("AT_LEAST_ONE_PAYMENT_METHOD_REQUIRED")) return "AT_LEAST_ONE_PAYMENT_METHOD_REQUIRED" as const;
  // Urutan penting: OFFER_NOT_FOUND diperiksa sebelum OFFER_INACTIVE agar pesan
  // yang lebih spesifik tidak tertutup pencocokan substring.
  if (message.includes("OFFER_NOT_FOUND")) return "OFFER_NOT_FOUND" as const;
  if (message.includes("OFFER_INACTIVE")) return "OFFER_INACTIVE" as const;
  if (message.includes("OFFER_WRONG_BOOTH")) return "OFFER_WRONG_BOOTH" as const;
  if (message.includes("OFFER_CONDITIONS_NOT_MET")) return "OFFER_CONDITIONS_NOT_MET" as const;
  // Dilempar trigger guard_builtin_offer_scope bila ada jalur lain yang mencoba
  // memindahkan penawaran bawaan booth.
  if (message.includes("OFFER_SCOPE_LOCKED_BUILTIN")) return "OFFER_SCOPE_LOCKED_BUILTIN" as const;
  if (message.includes("ORDER_TOTAL_MISMATCH")) return "ORDER_TOTAL_MISMATCH" as const;
  if (error.code === "23505") return "DISCOUNT_ALREADY_TAKEN" as const;
  return "INTERNAL_ERROR" as const;
}
