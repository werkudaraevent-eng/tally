// Semua tampilan waktu dipaksa ke zona LOKASI ACARA, bukan zona device.
//
// Alasan: `toLocaleString("id-ID")` tanpa timeZone mengikuti timezone device.
// Kalau ada HP/laptop panitia yang timezone-nya salah atau di luar zona acara,
// jam order akan tampil berbeda antar device dan menyulitkan rekonsiliasi.
//
// Zona diterima sebagai ARGUMEN, bukan konstanta. Sebelumnya file ini memaku
// "Asia/Jakarta" mengikuti catatan SPEC baris 762, dan itu benar selama acara di
// Jawa. Untuk acara di Bali (WITA, UTC+8) setiap jam tampil satu jam lebih awal
// daripada struk EDC yang dipegang kasir — dua angka yang tidak akan pernah cocok
// saat rekonsiliasi hari-H.
//
// Argumennya opsional dan jatuh ke WIB supaya pemanggil yang belum selesai memuat
// setelan tetap menampilkan perilaku lama, bukan halaman gagal render.

import { DEFAULT_TIME_ZONE, type EventTimeZone } from "@/lib/timezone";

/** Tanggal + jam singkat, mis. "29/07/26, 00.14". */
export function formatEventDateTime(
  value: string | null | undefined,
  zone: EventTimeZone = DEFAULT_TIME_ZONE,
): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", {
    timeZone: zone,
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Jam saja, mis. "00.14". */
export function formatEventTime(
  value: string | null | undefined,
  zone: EventTimeZone = DEFAULT_TIME_ZONE,
): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("id-ID", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Jam lengkap dengan detik untuk Live Display, mis. "00.14.44". */
export function formatEventTimeWithSeconds(
  value: string | null | undefined,
  zone: EventTimeZone = DEFAULT_TIME_ZONE,
): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("id-ID", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
