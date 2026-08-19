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
  REGISTRATION_CLOSED: "Pendaftaran untuk acara ini sedang ditutup.",
  // Menyebut "sudah terdaftar" dan bukan "email dipakai": pendaftar yang lupa
  // pernah mengisi form akan mengira ada orang lain memakai emailnya.
  REGISTRATION_DUPLICATE_EMAIL: "Email ini sudah terdaftar untuk acara ini. Hubungi panitia bila Anda belum menerima kode peserta.",
  REGISTRATION_NOT_FOUND: "Pendaftaran tidak ditemukan.",
  REGISTRATION_ALREADY_REVIEWED: "Pendaftaran ini sudah diproses admin lain. Muat ulang daftarnya.",
  REGISTRATION_NOT_APPROVED: "Pendaftaran ini belum disetujui, jadi belum ada kode peserta yang bisa dikirim.",
  // Menyebut SIAPA yang harus bertindak. Panitia yang membaca "gagal terkirim"
  // akan menekan Kirim ulang berkali-kali untuk keadaan yang tidak akan berubah
  // sampai pemilik sistem mengisi kunci API.
  EMAIL_NOT_CONFIGURED: "Pengiriman email belum diaktifkan di server. Hubungi pemilik sistem; kode peserta tetap bisa dibacakan dari daftar ini.",
  EMAIL_SEND_FAILED: "Email gagal dikirim. Sebabnya tercatat di baris pendaftaran.",
  EVENT_NOT_DELETABLE: "Hanya event berstatus Draft atau Arsip yang dapat dihapus. Kembalikan ke draft atau arsipkan dulu.",
  EVENT_HAS_ORDERS: "Event ini sudah punya transaksi tercatat, jadi tidak dapat dihapus. Arsipkan saja — datanya hilang dari daftar utama tanpa memusnahkan laporan.",
  // Menyebut APA yang masih boleh diubah, bukan sekadar menolak. Tanpa itu
  // panitia mengira barisnya rusak dan mencoba lagi dengan cara yang sama.
  PARTICIPANT_SOURCE_LOCKED: "Peserta ini datang dari Scanner API, jadi nama, perusahaan, jabatan, kode QR, tipe, dan RSVP-nya dikelola di sana — suntingan di sini akan tertimpa pada sync berikutnya. Hanya email dan telepon yang bisa diubah dari halaman ini.",
  PARTICIPANT_QR_TAKEN: "Kode QR ini sudah dipakai peserta lain di event ini. Gunakan kode lain.",
  PARTICIPANT_FIELDS_REQUIRED: "Kode QR dan nama wajib diisi.",
  PARTICIPANT_RSVP_INVALID: "RSVP hanya boleh kosong, invited, atau confirmed.",
  PARTICIPANT_IN_USE: "Peserta ini sudah punya transaksi atau pernah menang undian, jadi tidak dapat dihapus.",
  IMPORT_EMPTY: "Berkas tidak memuat satu baris data pun.",
  IMPORT_TOO_LARGE: "Berkas melebihi 5.000 baris. Pecah menjadi beberapa berkas.",
  IMPORT_UNREADABLE: "Berkas tidak terbaca. Pastikan formatnya CSV atau XLSX dan baris pertamanya berisi nama kolom.",
  SCANNER_NOT_CONFIGURED: "Scanner API belum disetel untuk event ini. Isi base URL, kunci API, dan slug event di kartu Setelan Scanner API.",
  VOTE_POLL_NOT_FOUND: "Pertanyaan voting tidak ditemukan.",
  VOTE_CLOSED: "Voting untuk pertanyaan ini sedang ditutup.",
  VOTE_ALREADY_CAST: "Anda sudah memberikan suara untuk pertanyaan ini.",
  VOTE_NO_OPTION: "Pilih dulu jawabannya.",
  VOTE_OPTION_INVALID: "Ada pilihan yang tidak dikenali. Muat ulang halaman lalu coba lagi.",
  VOTE_TOO_MANY: "Pilihan Anda melebihi batas untuk pertanyaan ini.",
  VOTE_INVALID_REQUEST: "Permintaan voting tidak lengkap.",
  // Menyebut APA yang masih boleh diubah. Tanpa itu panitia mengira pertanyaan
  // terkunci sepenuhnya dan membuat pertanyaan baru di tengah acara.
  VOTE_HAS_BALLOTS: "Suara sudah masuk untuk pertanyaan ini, jadi opsi tidak dapat ditambah, dihapus, atau diganti tipenya — angka yang sudah terkumpul akan kehilangan artinya. Teks pertanyaan dan label opsi tetap bisa dibetulkan.",
  VOTE_QUESTION_REQUIRED: "Pertanyaan wajib diisi.",
  VOTE_NEED_TWO_OPTIONS: "Isi minimal dua opsi jawaban.",
  VOTE_TOO_MANY_OPTIONS: "Maksimal 30 opsi per pertanyaan.",
  VOTE_OPTION_LABEL_REQUIRED: "Ada opsi yang labelnya masih kosong.",
  VOTE_CODE_NOT_FOUND: "Kode peserta tidak ditemukan di acara ini. Periksa kembali kode di badge Anda.",
  VOTE_RATING_INVALID: "Nilai yang dipilih di luar rentang yang disediakan.",
  VOTE_WORD_TOO_LONG: "Ada kata yang terlalu panjang. Maksimal 40 huruf per kata.",
  // Tidak menyebutkan kata mana yang tertolak: mengulanginya di layar sama saja
  // menampilkannya, dan pengetiknya sudah tahu apa yang baru saja ia ketik.
  VOTE_TEXT_BLOCKED: "Ada kata yang tidak dapat ditampilkan di layar acara. Ganti dengan kata lain.",
  VOTE_BALLOT_NOT_FOUND: "Entri tidak ditemukan.",
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
  // Diperiksa SEBELUM cabang 23505 di bawah, yang memetakan setiap pelanggaran
  // unik ke DISCOUNT_ALREADY_TAKEN — pendaftar yang emailnya bentrok akan
  // membaca "sudah mengambil item diskon di booth ini" tanpa cabang ini.
  if (message.includes("event_registrations_email_unique")) return "REGISTRATION_DUPLICATE_EMAIL" as const;
  if (message.includes("REGISTRATION_CLOSED")) return "REGISTRATION_CLOSED" as const;
  if (message.includes("REGISTRATION_ALREADY_REVIEWED")) return "REGISTRATION_ALREADY_REVIEWED" as const;
  if (message.includes("REGISTRATION_NOT_FOUND")) return "REGISTRATION_NOT_FOUND" as const;
  // Dilempar delete_event. EVENT_NOT_FOUND sengaja TIDAK dipetakan di sini:
  // route penghapusan sudah membaca barisnya lebih dulu dan menjawabnya dengan
  // 404 berikut saran "muat ulang daftarnya", sama seperti PATCH di berkas yang
  // sama. Memetakannya jadi 422 akan membuat dua jawaban berbeda untuk sebab
  // yang persis sama.
  if (message.includes("EVENT_NOT_DELETABLE")) return "EVENT_NOT_DELETABLE" as const;
  if (message.includes("EVENT_HAS_ORDERS")) return "EVENT_HAS_ORDERS" as const;
  // Dilempar save_participant / delete_participant / import_participants.
  // PARTICIPANT_NOT_FOUND sudah terdaftar di atas lewat cabang bersama.
  if (message.includes("PARTICIPANT_SOURCE_LOCKED")) return "PARTICIPANT_SOURCE_LOCKED" as const;
  if (message.includes("PARTICIPANT_QR_TAKEN")) return "PARTICIPANT_QR_TAKEN" as const;
  if (message.includes("PARTICIPANT_FIELDS_REQUIRED")) return "PARTICIPANT_FIELDS_REQUIRED" as const;
  if (message.includes("PARTICIPANT_RSVP_INVALID")) return "PARTICIPANT_RSVP_INVALID" as const;
  if (message.includes("PARTICIPANT_IN_USE")) return "PARTICIPANT_IN_USE" as const;
  // Diperiksa SEBELUM cabang 23505 di bawah: bentrok kode peserta yang lolos
  // pemeriksaan eksplisit di RPC (balapan dua admin) tetap harus terbaca sebagai
  // kode terpakai, bukan sebagai "sudah mengambil item diskon".
  if (message.includes("participants_qr_code_event_unique")) return "PARTICIPANT_QR_TAKEN" as const;
  if (message.includes("IMPORT_TOO_LARGE")) return "IMPORT_TOO_LARGE" as const;
  if (message.includes("IMPORT_EMPTY")) return "IMPORT_EMPTY" as const;
  // Dilempar cast_vote dan save_vote_poll. Urutannya penting: VOTE_TOO_MANY dan
  // VOTE_TOO_MANY_OPTIONS berbagi awalan, jadi yang lebih panjang diperiksa
  // lebih dulu — pencocokan substring pada yang pendek akan menutupinya.
  if (message.includes("VOTE_TOO_MANY_OPTIONS")) return "VOTE_TOO_MANY_OPTIONS" as const;
  if (message.includes("VOTE_TOO_MANY")) return "VOTE_TOO_MANY" as const;
  if (message.includes("VOTE_POLL_NOT_FOUND")) return "VOTE_POLL_NOT_FOUND" as const;
  if (message.includes("VOTE_CLOSED")) return "VOTE_CLOSED" as const;
  if (message.includes("VOTE_ALREADY_CAST")) return "VOTE_ALREADY_CAST" as const;
  if (message.includes("VOTE_NO_OPTION")) return "VOTE_NO_OPTION" as const;
  if (message.includes("VOTE_OPTION_LABEL_REQUIRED")) return "VOTE_OPTION_LABEL_REQUIRED" as const;
  if (message.includes("VOTE_OPTION_INVALID")) return "VOTE_OPTION_INVALID" as const;
  if (message.includes("VOTE_INVALID_REQUEST")) return "VOTE_INVALID_REQUEST" as const;
  if (message.includes("VOTE_HAS_BALLOTS")) return "VOTE_HAS_BALLOTS" as const;
  if (message.includes("VOTE_QUESTION_REQUIRED")) return "VOTE_QUESTION_REQUIRED" as const;
  if (message.includes("VOTE_NEED_TWO_OPTIONS")) return "VOTE_NEED_TWO_OPTIONS" as const;
  if (message.includes("VOTE_RATING_INVALID")) return "VOTE_RATING_INVALID" as const;
  if (message.includes("VOTE_WORD_TOO_LONG")) return "VOTE_WORD_TOO_LONG" as const;
  if (message.includes("VOTE_TEXT_BLOCKED")) return "VOTE_TEXT_BLOCKED" as const;
  if (message.includes("VOTE_BALLOT_NOT_FOUND")) return "VOTE_BALLOT_NOT_FOUND" as const;
  // Postgres 22003 = numeric_value_out_of_range. Muncul ketika `regular_amount`
  // ditambah harga item spesial melampaui int4, jadi nominalnya sendiri lolos
  // validasi tetapi jumlahnya tidak. Tanpa cabang ini pesannya jatuh ke
  // INTERNAL_ERROR dan staf disuruh "coba lagi" untuk kondisi yang tidak akan
  // pernah berubah selama nominalnya tidak dikoreksi.
  if (error.code === "22003") return "INVALID_AMOUNT" as const;
  if (error.code === "23505") return "DISCOUNT_ALREADY_TAKEN" as const;
  return "INTERNAL_ERROR" as const;
}
