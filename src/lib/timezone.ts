// Zona waktu acara. Satu sumber kebenaran untuk seluruh app.
//
// Kenapa daftar tertutup dan bukan sembarang string IANA:
// acara ini berlangsung di Indonesia, dan tiga zona di bawah menutup seluruh
// wilayahnya. Membuka pilihan ke ~600 zona IANA berarti admin bisa memilih zona
// ber-DST, dan seluruh perhitungan offset tetap di bawah ikut salah dua kali
// setahun tanpa ada yang menyadarinya.
//
// Yang membuat pendekatan offset tetap ini benar: TIDAK ADA zona Indonesia yang
// menerapkan DST, dan ketiganya tidak pernah berubah sejak 1964. Jadi offset
// boleh ditempelkan sebagai string ke ISO tanpa library timezone, dan hasilnya
// tetap tepat kapan pun dihitung.

export const EVENT_TIME_ZONES = [
  {
    id: "Asia/Jakarta",
    abbr: "WIB",
    offset: "+07:00",
    label: "WIB — Waktu Indonesia Barat (UTC+7)",
    hint: "Jakarta, Bandung, Medan, Palembang, Semarang, Surabaya.",
  },
  {
    id: "Asia/Makassar",
    abbr: "WITA",
    offset: "+08:00",
    label: "WITA — Waktu Indonesia Tengah (UTC+8)",
    hint: "Bali, Makassar, Balikpapan, Mataram, Manado, Kupang.",
  },
  {
    id: "Asia/Jayapura",
    abbr: "WIT",
    offset: "+09:00",
    label: "WIT — Waktu Indonesia Timur (UTC+9)",
    hint: "Jayapura, Ambon, Ternate, Sorong.",
  },
] as const;

export type EventTimeZone = (typeof EVENT_TIME_ZONES)[number]["id"];

/**
 * Default sengaja WIB, bukan zona acara yang sedang berjalan.
 *
 * Ini nilai yang dipakai ketika setelan belum terbaca atau gagal dimuat, jadi ia
 * harus sama dengan perilaku app sebelum kolom ini ada. Menjadikan WITA sebagai
 * default akan menggeser semua jam yang sudah tercatat pada acara lain.
 */
export const DEFAULT_TIME_ZONE: EventTimeZone = "Asia/Jakarta";

const BY_ID = new Map(EVENT_TIME_ZONES.map((zone) => [zone.id as string, zone]));

export const TIME_ZONE_IDS = EVENT_TIME_ZONES.map((zone) => zone.id);

/**
 * Nilai apa pun dari database, URL, atau props dijadikan zona yang sah.
 *
 * Dipakai di batas sistem, bukan di dalamnya: kolom `time_zone` sudah dijaga
 * CHECK constraint, tapi payload publik melewati JSON yang tidak bertipe, dan
 * satu nilai tak dikenal tidak boleh membuat seluruh halaman jam gagal render.
 */
export function normalizeTimeZone(value: unknown): EventTimeZone {
  return typeof value === "string" && BY_ID.has(value) ? (value as EventTimeZone) : DEFAULT_TIME_ZONE;
}

/** Singkatan untuk ditempel di UI, mis. "WITA". */
export function timeZoneAbbr(zone: EventTimeZone): string {
  return BY_ID.get(zone)?.abbr ?? "WIB";
}

/** Offset ISO tetap, mis. "+08:00". */
export function timeZoneOffset(zone: EventTimeZone): string {
  return BY_ID.get(zone)?.offset ?? "+07:00";
}
