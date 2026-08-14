import type { EventStatus, UserRole } from "../domain";

/**
 * Keputusan murni: bolehkah permintaan ini MENGUBAH data event?
 *
 * Dipisah dari event-scope.ts (yang menarik Supabase) supaya bisa diuji lewat
 * `npm run check` tanpa database. Aturannya pernah hanya berupa peredupan tombol
 * di satu halaman, dan itu gagal total: `pointer-events-none` cuma CSS, sedangkan
 * penjaga servernya (ensureEventWritable) tidak pernah dipanggil sama sekali.
 * Akibatnya order baru tetap tersimpan ke event yang laporannya sudah diserahkan.
 *
 * Bacaan TIDAK pernah diblokir. Event selesai memang dirancang untuk tetap bisa
 * dibuka dan diekspor; yang dilindungi hanya angkanya agar tidak berubah setelah
 * diserahkan ke klien.
 */

/** Method HTTP yang tidak mengubah apa pun menurut spesifikasi. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Status yang laporannya sudah final. */
const FROZEN: EventStatus[] = ["completed", "archived"];

export function isWriteBlocked(input: {
  method: string;
  status: EventStatus;
  /** Peran GLOBAL user (users.role), bukan peran per-event. Lihat catatan di bawah. */
  role: UserRole;
  /** Route baca-saja yang terpaksa memakai POST (badan permintaan terlalu besar untuk query). */
  readOnly?: boolean;
}): boolean {
  if (input.readOnly) return false;
  if (READ_METHODS.has(input.method.toUpperCase())) return false;
  if (!FROZEN.includes(input.status)) return false;

  // super_admin (pemilik platform) tetap boleh mengoreksi setelah acara ditutup.
  // Sengaja memakai peran GLOBAL, bukan peran per-event: pemilik yang kebetulan
  // punya baris user_event_access sebagai "admin" di event itu tetap pemilik, dan
  // menguncinya dari sistemnya sendiri hanya memaksa koreksi lewat SQL mentah --
  // jalur yang tidak tercatat di audit_logs sama sekali.
  //
  // Yang dilindungi aturan ini adalah admin KLIEN, yang tidak boleh mengubah
  // laporan yang sudah diserahkan.
  if (input.role === "super_admin") return false;

  return true;
}
