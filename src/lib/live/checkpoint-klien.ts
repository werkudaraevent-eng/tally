/**
 * Check-in point mana yang tampil sebagai kolom di layar klien (akun Viewer).
 * Murni, tanpa database, supaya route data, unduhan, layar admin dan route
 * simpan memakai aturan yang sama dan bisa diuji sendiri
 * (checkpoint-klien.check.ts).
 *
 * Disimpan di `registration_form_config.client_checkpoints` sebagai larik id
 * `attendance_sessions`, di samping `client_fields` (jawaban form), supaya satu
 * dialog "What the client sees" menyimpan keduanya dengan satu tulis CAS dan
 * tanpa migrasi. Bawaannya kosong: acara yang sudah ada berubah 0 px.
 *
 * Berbeda dengan jawaban form, yang disimpan cukup id. Nama check-in point
 * bukan data pribadi: kalau panitia mengganti namanya, kolom klien ikut nama
 * baru. Check-in point yang dihapus hilang dari kolom dengan sendirinya karena
 * daftar kolom dibaca dari tabel sesi yang masih ada.
 */
export type KolomCheckpoint = { id: number; label: string };

/** Paling banyak sekian kolom check-in point: tabel klien tetap terbaca. */
export const BATAS_CHECKPOINT_KLIEN = 30;

/** Awalan kunci saringan "+ Filter" untuk kolom check-in point. */
export const AWALAN_CHECKPOINT = "checkpoint:";

/** Id yang disetujui admin, tanpa duplikat; bentuk lain diabaikan = tidak dibagikan. */
export function checkpointKlienTersimpan(config: unknown): number[] {
  const daftar = ((config ?? {}) as { client_checkpoints?: unknown }).client_checkpoints;
  if (!Array.isArray(daftar)) return [];
  const hasil: number[] = [];
  for (const id of daftar) if (Number.isSafeInteger(id) && (id as number) > 0 && !hasil.includes(id as number)) hasil.push(id as number);
  return hasil.slice(0, BATAS_CHECKPOINT_KLIEN);
}

/**
 * Kolom klien: sesi yang disetujui DAN masih ada, dalam urutan sesi acara
 * (urutan Check-in setup, yang sudah diurutkan pemanggil).
 */
export function kolomCheckpointKlien(config: unknown, sesi: Array<{ id: number; name: string }>): KolomCheckpoint[] {
  const setuju = new Set(checkpointKlienTersimpan(config));
  return sesi.filter((s) => setuju.has(s.id)).map((s) => ({ id: s.id, label: s.name }));
}

/** Pilihan admin divalidasi terhadap sesi acara ini; urutan mengikuti sesi, tanpa duplikat. */
export function setujuiCheckpoint(ids: number[], sesi: Array<{ id: number }>): { ids: number[]; unknown: number[] } {
  const pilihan = new Set(ids);
  const ada = new Set(sesi.map((s) => s.id));
  return { ids: sesi.filter((s) => pilihan.has(s.id)).map((s) => s.id), unknown: [...pilihan].filter((id) => !ada.has(id)) };
}

/**
 * Pindaian pertama per peserta per sesi: `peserta -> { "<sesi>": ISO }`.
 * Pindaian ulang tetap dibaca (bukan hanya `is_duplicate = false`) dan yang
 * paling awal menang, supaya urutan baca dari database tidak berpengaruh.
 */
export function waktuPertama(scans: Array<{ participant_id: string; session_id: number; scanned_at: string }>): Map<string, Record<string, string>> {
  const peta = new Map<string, Record<string, string>>();
  for (const s of scans) {
    const isi = peta.get(s.participant_id) ?? {};
    const kunci = String(s.session_id);
    const lama = isi[kunci];
    if (lama === undefined || Date.parse(s.scanned_at) < Date.parse(lama)) isi[kunci] = s.scanned_at;
    peta.set(s.participant_id, isi);
  }
  return peta;
}
