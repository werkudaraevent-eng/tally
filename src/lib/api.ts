import type { ApiErrorCode } from "./domain";

const messages: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: "You are signed out. Sign in again.",
  FORBIDDEN: "You don't have permission to do this.",
  // Lama tunggu yang tepat disisipkan pemanggil lewat `details`; pesan dasar ini
  // hanya dipakai bila angkanya tidak tersedia.
  RATE_LIMITED: "Too many sign-in attempts for this username. Wait a moment, then try again.",
  VALIDATION_ERROR: "Some of the data sent is not valid.",
  PARTICIPANT_NOT_FOUND: "Participant not found.",
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
  USERNAME_TAKEN: "This username is taken. Choose another.",
  USER_NOT_FOUND: "User not found.",
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
  SEAT_MAP_SESSION_NOT_FOUND: "Seating plan session not found.",
  DUPLICATE_SEAT_MAP_SLUG: "Another seating plan session already uses this slug. Use a different slug.",
  SEAT_MAP_SESSION_UNPUBLISHED: "This session's seating plan is not published yet.",
  RUNDOWN_SECTION_NOT_FOUND: "Agenda section not found.",
  RUNDOWN_ITEM_NOT_FOUND: "Agenda item not found.",
  DUPLICATE_RUNDOWN_SLUG: "Another agenda section already uses this slug. Use a different slug.",
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
  REGISTRATION_CLOSED: "Registration for this event is closed.",
  // Menyebut "sudah terdaftar" dan bukan "email dipakai": pendaftar yang lupa
  // pernah mengisi form akan mengira ada orang lain memakai emailnya.
  REGISTRATION_DUPLICATE_EMAIL: "This email is already registered for this event.",
  REGISTRATION_NOT_FOUND: "Registration not found.",
  REGISTRATION_ALREADY_REVIEWED: "Another admin has already handled this registration. Reload the list.",
  REGISTRATION_NOT_APPROVED: "This registration is not approved yet, so there is no participant code to send.",
  REGISTRATION_INVITE_ONLY: "Registration for this event is for invited guests only.",
  INVITATION_USED: "This invitation link has already been used to register.",
  INVITATION_NOT_FOUND: "Invited guest not found.",
  INVITATIONS_NOT_READY: "Invited guests are not ready yet: the database migration has not been run.",
  CONFLICT: "This event was saved somewhere else at the same moment. Nothing was changed. Try again.",
  // Menyebut env-nya: yang bisa membereskan ini pemilik sistem, bukan panitia.
  INVITATION_SENDING_LOCKED: "Invitation blasts stay locked until the system owner sets up a separate invitation sender.",
  MESSAGE_NOT_PAUSED: "This blast is not paused.",
  ANNOUNCEMENT_NOT_FOUND: "Announcement not found. Another staff member may have deleted it; reload the page.",
  // Tabel pengumuman dibuat migrasi 202610030002. Sebelum dijalankan, fitur
  // ini mati dengan pesan yang menyebut langkahnya, bukan galat 500.
  ANNOUNCEMENTS_NOT_READY: "Announcements are not active yet: database migration 202610030002 has not been run.",
  BADGE_NOT_READY: "Badge kertas belum bisa disimpan: migrasi database 202610040002 belum dijalankan.",
  STASIUN_NOT_READY: "Print stations are not active yet: database migration 202610040009 has not been run.",
  // Menyebut SIAPA yang harus bertindak. Panitia yang membaca "gagal terkirim"
  // akan menekan Kirim ulang berkali-kali untuk keadaan yang tidak akan berubah
  // sampai pemilik sistem mengisi kunci API.
  // Pesan peserta (migrasi 202610030003).
  MESSAGES_NOT_READY: "Messages are not active yet: database migration 202610030003 has not been run.",
  MESSAGE_NOT_FOUND: "Blast not found. Another staff member may have deleted it; reload the page.",
  MESSAGE_NOT_DRAFT: "This blast has already been sent or scheduled, so its content can't be changed. Duplicate it to make a new blast.",
  MESSAGE_EMPTY: "There are no recipients to send to. Check the recipients and the skip reasons.",
  // Jumlah di dialog adalah janji. Bila berubah antara dialog dibuka dan Kirim
  // ditekan (peserta baru diimpor, panitia lain menyunting), panitia harus
  // melihat angka barunya dulu.
  MESSAGE_COUNT_CHANGED: "The number of recipients changed since the dialog opened. Check the new number, then send again.",
  MESSAGE_TEST_NOT_ALLOWED: "This test address is not on this server's test list (MESSAGING_ALLOWLIST).",
  MESSAGING_BLOCKED: "This server is not production and its test list (MESSAGING_ALLOWLIST) is empty, so no email is sent to participants.",
  MESSAGE_SCHEDULE_NOT_ALLOWED: "Scheduling only works on the main site. On a test site, choose Send now.",
  MESSAGE_RETRY_NOT_ALLOWED: "This blast was sent from another site. Retry it from the site that sent it.",
  MESSAGE_WHATSAPP_NOT_READY: "WhatsApp is not connected yet. Send by email for now.",
  EMAIL_NOT_CONFIGURED: "Email sending is not set up on the server. Contact the system owner; you can still read out participant codes from this list.",
  EMAIL_SEND_FAILED: "The email could not be sent. The reason is recorded on the registration row.",
  EMAIL_TEMPLATE_NOT_READY: "The confirmation email template can't be saved yet: database migration 202610030006 has not been run. Emails still go out with the default template.",
  MESSAGING_PREVIEW_BLOCKED: "A preview site without a test list (MESSAGING_ALLOWLIST) doesn't email real registrants.",
  EVENT_NOT_DELETABLE: "Hanya event berstatus Draft atau Arsip yang dapat dihapus. Kembalikan ke draft atau arsipkan dulu.",
  EVENT_HAS_ORDERS: "Event ini sudah punya transaksi tercatat, jadi tidak dapat dihapus. Arsipkan saja — datanya hilang dari daftar utama tanpa memusnahkan laporan.",
  // Menyebut APA yang masih boleh diubah, bukan sekadar menolak. Tanpa itu
  // panitia mengira barisnya rusak dan mencoba lagi dengan cara yang sama.
  PARTICIPANT_SOURCE_LOCKED: "This participant comes from the Scanner API, so their name, organisation, job title, QR code, type and RSVP are managed there. Changes made here are overwritten at the next sync. Only email, phone and form answers can be changed on this page.",
  PARTICIPANT_QR_TAKEN: "Another participant in this event already uses this QR code. Use a different code.",
  PARTICIPANT_FIELDS_REQUIRED: "QR code and name are required.",
  PARTICIPANT_RSVP_INVALID: "RSVP can only be empty, invited or confirmed.",
  PARTICIPANT_EXTRA_INVALID: "The form answers are not in the expected shape. Reload the page and try again.",
  PARTICIPANT_IN_USE: "This participant has orders or has won a draw, so they can't be deleted.",
  // Menyebut SIAPA yang bisa mengubahnya. Petugas di pintu masuk tidak punya
  // akses ke setelan acara, dan pesan yang hanya menyatakan "tidak diizinkan"
  // membuatnya mencoba lagi dengan cara yang sama sampai antreannya menumpuk.
  WALKIN_DISABLED: "Acara ini tidak menerima tamu walk-in. Minta admin menyalakannya di Admin → Kehadiran bila memang boleh.",
  IMPORT_EMPTY: "The file has no data rows.",
  IMPORT_TOO_LARGE: "The file has more than 5,000 rows. Split it into several files.",
  IMPORT_UNREADABLE: "The file can't be read. Make sure it is CSV or XLSX and the first row holds the column names.",
  SCANNER_NOT_CONFIGURED: "The Scanner API is not set up for this event. Enter the base URL, API key and event slug in the Scanner API card.",
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
  INTERNAL_ERROR: "Something went wrong on the server. Try again.",
};

/**
 * Pesan untuk rute yang dibaca PESERTA (pendaftaran, voting, denah, rundown,
 * layar panggung). Admin pindah ke English bertahap lewat `messages` di atas;
 * halaman peserta mengikuti bahasa acara, jadi kalimatnya disalin ke sini dan
 * tidak ikut berganti. Kode yang tidak ada di sini jatuh ke `messages`.
 */
const PESAN_PESERTA_UMUM = "Permintaan belum bisa diproses. Muat ulang halaman, lalu coba lagi.";

const pesanPeserta: Partial<Record<ApiErrorCode, string>> = {
  VALIDATION_ERROR: "Data yang dikirim belum valid.",
  INTERNAL_ERROR: "Terjadi kesalahan server. Coba lagi.",
  INVITATION_USED: "Tautan undangan ini sudah dipakai untuk mendaftar.",
  REGISTRATION_CLOSED: "Pendaftaran untuk acara ini sedang ditutup.",
  REGISTRATION_DUPLICATE_EMAIL: "Email ini sudah terdaftar untuk acara ini. Hubungi panitia bila Anda belum menerima kode peserta.",
  REGISTRATION_INVITE_ONLY: "Pendaftaran acara ini khusus tamu undangan. Gunakan tautan pribadi di email undangan Anda.",
  REGISTRATION_NOT_FOUND: "Pendaftaran tidak ditemukan.",
  SEAT_MAP_SESSION_NOT_FOUND: "Sesi denah tidak ditemukan.",
  SEAT_MAP_SESSION_UNPUBLISHED: "Denah sesi ini belum dipublikasikan.",
  VOTE_POLL_NOT_FOUND: "Pertanyaan voting tidak ditemukan.",
  VOTE_CLOSED: "Voting untuk pertanyaan ini sedang ditutup.",
  VOTE_ALREADY_CAST: "Anda sudah memberikan suara untuk pertanyaan ini.",
  VOTE_NO_OPTION: "Pilih dulu jawabannya.",
  VOTE_OPTION_INVALID: "Ada pilihan yang tidak dikenali. Muat ulang halaman lalu coba lagi.",
  VOTE_TOO_MANY: "Pilihan Anda melebihi batas untuk pertanyaan ini.",
  VOTE_INVALID_REQUEST: "Permintaan voting tidak lengkap.",
  VOTE_CODE_NOT_FOUND: "Kode peserta tidak ditemukan di acara ini. Periksa kembali kode di badge Anda.",
  VOTE_RATING_INVALID: "Nilai yang dipilih di luar rentang yang disediakan.",
  VOTE_WORD_TOO_LONG: "Ada kata yang terlalu panjang. Maksimal 40 huruf per kata.",
  VOTE_TEXT_BLOCKED: "Ada kata yang tidak dapat ditampilkan di layar acara. Ganti dengan kata lain.",
  PARTICIPANT_NOT_FOUND: "Peserta tidak ditemukan.",
  PARTICIPANT_EXTRA_INVALID: "Jawaban formulir tidak berbentuk yang diharapkan. Muat ulang halaman lalu coba lagi.",
  UNAUTHENTICATED: "Sesi login tidak ditemukan.",
};

export function apiError(code: ApiErrorCode, status: number, details?: unknown) {
  return Response.json({ error: { code, message: messages[code], details } }, { status });
}

/** `apiError` untuk rute yang dibaca peserta. Lihat `pesanPeserta`. */
export function apiErrorPeserta(code: ApiErrorCode, status: number, details?: unknown) {
  // Kode yang belum ada di `pesanPeserta` memakai kalimat umum dalam bahasa
  // peserta, bukan `messages[code]`: tabel staf itu akan berbahasa English.
  return Response.json({ error: { code, message: pesanPeserta[code] ?? PESAN_PESERTA_UMUM, details } }, { status });
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
  if (message.includes("REGISTRATION_INVITE_ONLY")) return "REGISTRATION_INVITE_ONLY" as const;
  if (message.includes("INVITATION_USED")) return "INVITATION_USED" as const;
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
  if (message.includes("PARTICIPANT_EXTRA_INVALID")) return "PARTICIPANT_EXTRA_INVALID" as const;
  if (message.includes("PARTICIPANT_IN_USE")) return "PARTICIPANT_IN_USE" as const;
  // Dilempar create_walkin_participant.
  if (message.includes("WALKIN_DISABLED")) return "WALKIN_DISABLED" as const;
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
