/**
 * Kehadiran untuk panitia di portal peserta (usulan disetujui Mas 29 Okt 2026).
 *
 * Peserta yang Tipe-nya (participants.participant_type) dipilih admin di
 * Check-in > Checkpoints > Committee access melihat kartu "Pantau kehadiran"
 * di Beranda dan halaman Kehadiran: jumlah per titik check-in dan siapa yang
 * sudah atau belum, hanya nama, unit, kelompok, dan jam.
 *
 * Kuncinya Tipe, bukan jawaban formulir: jawaban diisi peserta sendiri, jadi
 * siapa pun bisa memilih "Panitia" dan membaca data peserta lain. Tipe hanya
 * ditulis admin. Pola peran Check-in di Whova, Luma, dan Eventbrite: peran
 * diberikan penyelenggara, aplikasinya sama dengan peserta.
 *
 * Disimpan di `landing_config.member.committee` lewat /api/admin/area-peserta,
 * tanpa kolom baru. Akses berhenti sehari setelah hari terakhir acara.
 *
 * Murni, supaya bisa diuji langsung oleh Node (akses-panitia.check.ts).
 */

export type SetelanPanitia = {
  /** Tipe peserta yang mendapat akses, seperti tertulis di data peserta. */
  types: string[];
  /** Kunci titik (`cp-12`, `sesi-4`) yang tidak ditampilkan ke panitia. */
  hidden: string[];
};

export const PANITIA_TIPE_MAX = 10;
export const PANITIA_TIPE_PANJANG = 80;
export const PANITIA_SEMBUNYI_MAX = 200;
export const POLA_KUNCI_TITIK = /^(cp|sesi)-\d{1,12}$/;

/** "Panitia ", "panitia", dan "PANITIA" sama: Tipe diketik tangan di spreadsheet impor. */
export function kunciTipe(tipe: string): string {
  return tipe.trim().replace(/\s+/g, " ").toLocaleLowerCase("id");
}

/** Setelan tersimpan, atau null bila tidak ada Tipe yang dipilih (fitur mati). */
export function bacaSetelanPanitia(nilai: unknown): SetelanPanitia | null {
  if (!nilai || typeof nilai !== "object") return null;
  const isi = nilai as { types?: unknown; hidden?: unknown };
  const types = Array.isArray(isi.types)
    ? [...new Set(isi.types.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()))].slice(0, PANITIA_TIPE_MAX)
    : [];
  if (types.length === 0) return null;
  const hidden = Array.isArray(isi.hidden) ? isi.hidden.filter((k): k is string => typeof k === "string" && POLA_KUNCI_TITIK.test(k)).slice(0, PANITIA_SEMBUNYI_MAX) : [];
  return { types, hidden };
}

export function tipeTermasuk(setelan: SetelanPanitia, tipe: string | null | undefined): boolean {
  if (!tipe || !tipe.trim()) return false;
  const kunci = kunciTipe(tipe);
  return setelan.types.some((t) => kunciTipe(t) === kunci);
}

function tambahHari(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

/**
 * Masih dalam masa akses: sampai sehari setelah hari terakhir acara (end_date,
 * atau event_date bila satu hari). Acara tanpa tanggal: tidak dibatasi tanggal.
 */
export function masihDalamMasa(acara: { event_date: string | null; end_date?: string | null }, hariIni: string): boolean {
  const akhir = acara.end_date || acara.event_date;
  if (!akhir || !/^\d{4}-\d{2}-\d{2}$/.test(akhir)) return true;
  return hariIni <= tambahHari(akhir, 1);
}

/** Satu-satunya pintu: dipakai Beranda (kartu) dan API (setiap permintaan). */
export function bolehPantau(
  member: { committee?: unknown } | null | undefined,
  peserta: { participant_type?: string | null } | null | undefined,
  acara: { event_date: string | null; end_date?: string | null },
  hariIni: string,
): SetelanPanitia | null {
  const setelan = bacaSetelanPanitia(member?.committee);
  if (!setelan || !peserta || !tipeTermasuk(setelan, peserta.participant_type)) return null;
  return masihDalamMasa(acara, hariIni) ? setelan : null;
}
