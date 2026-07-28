// Semua tampilan waktu dipaksa ke Asia/Jakarta (WIB).
//
// Alasan: `toLocaleString("id-ID")` tanpa timeZone mengikuti timezone device.
// Kalau ada HP/laptop panitia yang timezone-nya salah atau di luar WIB, jam
// order akan tampil berbeda antar device dan menyulitkan rekonsiliasi.
// Spec non-functional: "Timezone: Asia/Jakarta (WIB) untuk semua tampilan."

const TIME_ZONE = "Asia/Jakarta";

/** Tanggal + jam singkat, mis. "29/07/26, 00.14". */
export function formatWibDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", {
    timeZone: TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Jam saja, mis. "00.14". */
export function formatWibTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("id-ID", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Jam lengkap dengan detik untuk Live Display, mis. "00.14.44". */
export function formatWibTimeWithSeconds(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("id-ID", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
