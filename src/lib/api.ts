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
  PAYMENT_METHOD_NOT_FOUND: "Metode pembayaran tidak ditemukan.",
  PAYMENT_METHOD_INACTIVE: "Metode pembayaran ini sedang dimatikan admin.",
  PAYMENT_METHOD_IN_USE: "Metode sudah dipakai order. Matikan saja, jangan dihapus.",
  PAYMENT_METHOD_BUILTIN: "Metode bawaan tidak dapat dihapus. Matikan saja bila tidak dipakai.",
  DUPLICATE_PAYMENT_METHOD: "Kode metode pembayaran sudah dipakai.",
  AT_LEAST_ONE_PAYMENT_METHOD_REQUIRED: "Minimal satu metode pembayaran harus aktif.",
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
  if (message.includes("PAYMENT_METHOD_NOT_FOUND")) return "PAYMENT_METHOD_NOT_FOUND" as const;
  if (message.includes("PAYMENT_METHOD_INACTIVE")) return "PAYMENT_METHOD_INACTIVE" as const;
  if (message.includes("AT_LEAST_ONE_PAYMENT_METHOD_REQUIRED")) return "AT_LEAST_ONE_PAYMENT_METHOD_REQUIRED" as const;
  if (error.code === "23505") return "DISCOUNT_ALREADY_TAKEN" as const;
  return "INTERNAL_ERROR" as const;
}
