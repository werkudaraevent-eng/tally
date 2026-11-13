import type { EventTimeZone } from "../timezone";
import type { RegistrationFormTheme } from "../registration-theme";
import type { RegistrationField, RegistrationFieldType } from "./formulir-transaksi.ts";
import type { EventLandingConfig } from "./landing-config.ts";

// super_admin = pemilik sistem. Memegang operasi yang tidak dapat dibalik (reset
// data, kelola user/role) yang tidak dibutuhkan klien untuk menjalankan acara.
// scanner = petugas pemindai kehadiran. Akun paling sempit di sistem: hanya bisa
// membuka layar /scan. Ada karena HP di pintu masuk sering dipegang bergantian,
// dan akun yang juga membuka transaksi serta data peserta adalah risiko yang
// tidak dibutuhkan di sana.
// `custom`: izin per modul dari peran buatan super admin (users.access_role_id,
// lihat src/lib/auth/izin-modul.ts). Masuk ke ruang kerja admin yang sama,
// tetapi hanya melihat modul yang diberikan perannya.
export type UserRole = "booth" | "cashier" | "admin" | "super_admin" | "scanner" | "viewer" | "custom";

/**
 * Nama peran yang boleh dilihat orang. SATU sumber.
 *
 * Sebelumnya ada empat peta terpisah di empat berkas, dan tiga di antaranya
 * tidak lengkap — `super_admin` dan `scanner` tidak ada di sana. Konsekuensinya
 * bukan sekadar teori: pola `LABEL[role] ?? role` di layar masuk jatuh ke nilai
 * cadangan dan menampilkan "Masuk sebagai super_admin" kepada panitia. Nilai
 * kolom database, lengkap dengan garis bawahnya, di dalam kalimat sambutan.
 *
 * `Record<UserRole, string>`, bukan `Record<string, string>`: menambah peran
 * baru tanpa menamainya di sini sekarang gagal di typecheck, bukan di layar.
 */
export const ROLE_LABEL: Record<UserRole, string> = {
  booth: "Booth staff",
  cashier: "Cashier",
  admin: "Admin",
  super_admin: "Super admin",
  scanner: "Scanner staff",
  viewer: "Viewer",
  custom: "Custom role",
};
export type OrderStatus = "pending" | "paid" | "void" | "handed_over";
export type PickupMode = "after_payment" | "immediate";

// ============================================================================
// Multi-Event Types
// ============================================================================

export type EventStatus = "draft" | "active" | "completed" | "archived";

/**
 * Batas panjang nama tempat acara, satu angka untuk Create event, Edit details
 * dan editor Halaman acara. Dulu 160 di dua dialog dan 200 di editor, sehingga
 * tempat sepanjang 161-200 karakter yang disimpan editor membuat setiap simpan
 * Edit details ditolak.
 */
export const EVENT_VENUE_MAX = 200;

/**
 * SATU peta label status untuk seluruh antarmuka.
 *
 * Sebelumnya daftar acara menulis "Aktif", halaman workspace menulis "ACTIVE",
 * dan dashboard menulis "active" — tiga kosakata untuk satu status, di tiga
 * layar yang dibuka berurutan dalam hitungan detik. Nilai mentah kolom tidak
 * pernah boleh sampai ke layar.
 */
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

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
  /**
   * Boleh tidaknya petugas /scan mendaftarkan tamu yang belum terdaftar.
   * Default false — lihat migrasi 202609070001 untuk alasannya.
   */
  attendance_allow_walk_in: boolean;
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
  /**
   * Pertanyaan yang jawabannya boleh dilihat akun Viewer (klien) di layar live
   * dan unduhannya, persis seperti saat disetujui admin. Kosong/tidak ada =
   * tidak satu pun. Diatur dari layar Client view; penyunting form hanya
   * membuang milik pertanyaan yang dihapus. Lihat src/lib/live/kolom-klien.ts.
   */
  client_fields?: ClientFieldApproval[];
  /**
   * Kunci pertanyaan yang sudah hilang dari susunan (dihapus, atau Data key-nya
   * diganti). Jawabannya tetap tersimpan di participants.extra, jadi kunci
   * otomatis pertanyaan baru tidak boleh memakainya: kolom staf yang dihapus
   * tidak boleh hidup lagi di bawah pertanyaan baru, apalagi yang diisi peserta.
   * Ditulis server saat Save form; kosong = tidak ada. Lihat src/lib/kolom-staf.ts.
   */
  retired_keys?: string[];
  /**
   * Kunci pertanyaan yang dipakai sebagai NOMOR BAGASI peserta (Check-in >
   * sesi > Luggage > Luggage number). Satu per acara, dipakai semua meja
   * bagasi: lembar pemindai, kartu Bagasi di portal, kolom Luggage, dan
   * pencarian di meja ambil. Nomornya tetap jawaban pertanyaan itu, jadi
   * isian, impor, dan ekspornya tidak berubah. Kosong = tidak ada.
   * Lihat src/lib/bagasi/nomor.ts.
   */
  luggage_number_field?: string;
};

/** Satu pertanyaan yang disetujui admin untuk klien: kunci, judul, dan jenis saat disetujui. */
export type ClientFieldApproval = { key: string; label: string; type: RegistrationFieldType };
