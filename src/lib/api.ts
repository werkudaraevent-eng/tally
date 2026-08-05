import type { ApiErrorCode } from "./domain";

const messages: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: "Sesi login tidak ditemukan.",
  FORBIDDEN: "Anda tidak punya izin untuk aksi ini.",
  // Lama tunggu yang tepat disisipkan pemanggil lewat `details`; pesan dasar ini
  // hanya dipakai bila angkanya tidak tersedia.
  RATE_LIMITED: "Terlalu banyak percobaan login untuk username ini. Tunggu sebentar, lalu coba lagi.",
  VALIDATION_ERROR: "Data yang dikirim belum valid.",
  PARTICIPANT_NOT_FOUND: "Peserta tidak ditemukan.",
  DISCOUNT_ALREADY_TAKEN: "Peserta sudah mengambil item diskon di booth ini.",
  DISCOUNT_OUT_OF_STOCK: "Item diskon di booth ini sudah habis.",
  ORDER_CODE_USED: "Nomor stiker sudah terpakai. Gunakan stiker berikutnya.",
  ORDER_NOT_PENDING: "Order sudah diproses dan tidak lagi pending.",
  ORDER_NOT_VOIDABLE: "Order tidak dapat dibatalkan pada status ini.",
  ORDER_NOT_ELIGIBLE_FOR_HANDOVER: "Order belum siap diserahkan.",
  INVALID_APPROVAL_CODE: "Nomor referensi pembayaran tidak sesuai jumlah digit yang diminta.",
  // Pesan menyebutkan LANGKAH pemulihannya, bukan hanya menyatakan salah. Ketiga
  // kondisi ini tidak akan pernah membaik dengan "coba lagi", jadi pesan generik
  // justru membuat staf booth mengulang tindakan yang sama sampai menyerah.
  INVALID_ORDER_CODE: "Nomor order tidak sesuai format booth ini. Isi 3 angka, dan pastikan kode booth di layar sudah benar. Bila baru diubah admin, muat ulang halaman.",
  INVALID_AMOUNT: "Nominal tidak valid. Isi angka 0 atau lebih, maksimal 2.147.483.647.",
  VOID_REASON_REQUIRED: "Alasan void wajib diisi.",
  PARTICIPANT_REMOVED: "Peserta ini sudah dihapus panitia pusat, jadi order tidak dapat dibuat. Arahkan peserta ke meja registrasi.",
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
  RUNDOWN_SECTION_NOT_FOUND: "Bagian rundown tidak ditemukan.",
  RUNDOWN_ITEM_NOT_FOUND: "Baris rundown tidak ditemukan.",
  DUPLICATE_RUNDOWN_SLUG: "Slug bagian rundown sudah dipakai. Gunakan slug lain.",
  UNDIAN_PRIZE_NOT_FOUND: "Hadiah undian tidak ditemukan.",
  UNDIAN_PRIZE_IN_USE: "Hadiah sudah punya pemenang. Matikan saja, jangan dihapus.",
  UNDIAN_NO_ACTIVE_PRIZE: "Belum ada hadiah yang dipilih untuk diundi.",
  UNDIAN_POOL_EMPTY: "Tidak ada peserta yang memenuhi syarat hadiah ini.",
  UNDIAN_QUOTA_REACHED: "Kuota pemenang hadiah ini sudah penuh.",
  UNDIAN_ALREADY_SPINNING: "Undian sedang berjalan. Tunggu sampai pemenang tampil.",
  UNDIAN_ENTRY_GROUP_NOT_FOUND: "Daftar entri undian tidak ditemukan.",
  UNDIAN_WINNER_NOT_FOUND: "Pemenang tidak ditemukan.",
  UNDIAN_WINNER_DECIDED: "Pemenang ini sudah dikonfirmasi atau ditolak.",
  UNDIAN_RULE_NOT_FOUND: "Aturan pengecualian tidak ditemukan.",
  UNDIAN_SESSION_NOT_FOUND: "Sesi undian tidak ditemukan.",
  UNDIAN_SESSION_ACTIVE: "Masih ada sesi yang berjalan. Tutup dulu sebelum memulai sesi baru.",
  UNDIAN_SESSION_CLOSED: "Sesi ini sudah ditutup.",
  UNDIAN_NO_ACTIVE_SESSION: "Belum ada sesi undian yang dimulai.",
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
  // Urutan penting: INVALID_ORDER_CODE diperiksa sebelum INVALID_APPROVAL_CODE
  // karena keduanya memuat "INVALID_" + "_CODE" dan pencocokan substring pada
  // yang lebih umum akan menutup yang lebih spesifik.
  if (message.includes("INVALID_ORDER_CODE")) return "INVALID_ORDER_CODE" as const;
  if (message.includes("INVALID_APPROVAL_CODE")) return "INVALID_APPROVAL_CODE" as const;
  if (message.includes("INVALID_AMOUNT")) return "INVALID_AMOUNT" as const;
  if (message.includes("VOID_REASON_REQUIRED")) return "VOID_REASON_REQUIRED" as const;
  if (message.includes("PARTICIPANT_REMOVED")) return "PARTICIPANT_REMOVED" as const;
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
  // Sisa dari model syarat lama (satu kolom min_accumulated_amount). Fungsi
  // create_order_transaction versi 202607290007 masih dapat melemparnya bila
  // sebuah lingkungan belum menerapkan migrasi rule builder.
  if (message.includes("OFFER_BELOW_MIN_ACCUMULATED")) return "OFFER_CONDITIONS_NOT_MET" as const;
  // Dilempar trigger guard_builtin_offer_scope bila ada jalur lain yang mencoba
  // memindahkan penawaran bawaan booth.
  if (message.includes("OFFER_SCOPE_LOCKED_BUILTIN")) return "OFFER_SCOPE_LOCKED_BUILTIN" as const;
  if (message.includes("ORDER_TOTAL_MISMATCH")) return "ORDER_TOTAL_MISMATCH" as const;
  // Postgres 22003 = numeric_value_out_of_range. Muncul ketika `regular_amount`
  // ditambah harga item spesial melampaui int4, jadi nominalnya sendiri lolos
  // validasi tetapi jumlahnya tidak. Tanpa cabang ini pesannya jatuh ke
  // INTERNAL_ERROR dan staf disuruh "coba lagi" untuk kondisi yang tidak akan
  // pernah berubah selama nominalnya tidak dikoreksi.
  if (error.code === "22003") return "INVALID_AMOUNT" as const;
  if (error.code === "23505") return "DISCOUNT_ALREADY_TAKEN" as const;
  return "INTERNAL_ERROR" as const;
}
