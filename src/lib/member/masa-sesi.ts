/**
 * Masa berlaku sesi peserta.
 *
 * Dulu sesi habis tepat 30 hari sejak masuk, tidak diperpanjang. Peserta yang
 * masuk sebulan sebelum acara keluar sendiri tepat sebelum hari-H, lalu harus
 * masuk ulang di gerbang dengan sinyal lemah. Sekarang sesi diperpanjang setiap
 * kali portal dibuka: minimal 30 hari dari sekarang, dan minimal sampai 2 hari
 * sesudah acara selesai (paling jauh 90 hari dari sekarang).
 *
 * Murni, supaya bisa diuji tanpa basis data (masa-sesi.check.ts).
 */

const HARI = 24 * 60 * 60 * 1000;
export const SESI_HARI = 30;
/** Batas atas "sampai acara selesai": acara yang masih jauh tidak membuat sesi bertahun-tahun. */
const BATAS_HARI = 90;
/** Perpanjang paling sering sekali sehari, supaya buka portal tidak selalu menulis. */
const JEDA_HARI = 1;

/** Tanggal "YYYY-MM-DD" terakhir acara (end_date, atau event_date untuk acara sehari). */
function akhirAcara(acara: { event_date: string | null; end_date: string | null }): number | null {
  const tanggal = acara.end_date ?? acara.event_date;
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
  const awal = Date.parse(`${tanggal}T00:00:00Z`);
  // Akhir hari terakhir di zona mana pun (sampai UTC+14) masih sebelum 00.00 UTC lusanya.
  return Number.isNaN(awal) ? null : awal + 3 * HARI;
}

/** Masa berlaku yang seharusnya untuk sesi yang dipakai pada `sekarang`. */
export function masaSesi(sekarang: number, acara: { event_date: string | null; end_date: string | null }): number {
  const dasar = sekarang + SESI_HARI * HARI;
  const akhir = akhirAcara(acara);
  if (akhir === null) return dasar;
  return Math.max(dasar, Math.min(akhir, sekarang + BATAS_HARI * HARI));
}

/** Masa berlaku baru, atau null bila sesi ini belum perlu diperpanjang. Tidak pernah memperpendek. */
export function perpanjangSesi(sekarang: number, berlakuSampai: number, acara: { event_date: string | null; end_date: string | null }): number | null {
  const target = masaSesi(sekarang, acara);
  return berlakuSampai >= target - JEDA_HARI * HARI ? null : target;
}

