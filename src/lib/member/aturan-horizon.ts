/**
 * Aturan tempat tetap Beranda Gathering Horizon (Participant home), tanpa
 * impor apa pun: dipakai susunan-horizon.ts (halaman peserta dan daftar CMS)
 * dan iframe pratinjau (seret-kartu.ts), jadi garis jatuh di pratinjau
 * menunjuk tempat yang sama dengan hasil simpanannya.
 *
 * Next up paling atas, dan hanya Announcements yang boleh di atasnya; Help
 * card paling bawah; Roommates menempel tepat sesudah Bus and room.
 */

/** Isi bawaan yang tempatnya tetap: tidak bisa diseret. */
export const TETAP_HORIZON: ReadonlySet<string> = new Set(["next", "roommates", "help"]);

/** Aturan tempat tetap: Next up di atas (Announcements boleh di atasnya), Roommates sesudah Bus and room, Help card di bawah. */
export function rapikanHorizon(urutan: readonly string[]): string[] {
  const posisiNext = urutan.indexOf("next");
  const posisiPengumuman = urutan.indexOf("announcements");
  const pengumumanDiAtas = posisiPengumuman >= 0 && (posisiNext < 0 || posisiPengumuman < posisiNext);
  const atas = pengumumanDiAtas ? ["announcements", "next"] : ["next"];
  const sisa = urutan.filter((id) => !atas.includes(id) && id !== "roommates" && id !== "help");
  const bus = sisa.indexOf("logistics");
  sisa.splice(bus < 0 ? sisa.length : bus + 1, 0, "roommates");
  return [...atas, ...sisa, "help"];
}

/**
 * Urutan sesudah `id` dipindah ke indeks `ke` di urutan tampil. Isi bertempat
 * tetap tidak bergerak; tujuan yang melanggar aturan dirapikan (di atas Next
 * up menjadi tepat di bawahnya, kecuali Announcements; di bawah Help card
 * menjadi tepat di atasnya).
 */
export function pindahHorizon(urutan: readonly string[], id: string, ke: number): string[] {
  const dari = urutan.indexOf(id);
  if (dari < 0 || TETAP_HORIZON.has(id)) return [...urutan];
  const hasil = urutan.filter((lain) => lain !== id);
  hasil.splice(Math.max(0, Math.min(ke, hasil.length)), 0, id);
  return rapikanHorizon(hasil);
}

/**
 * Seret di pratinjau: `id` diletakkan tepat sebelum `sebelum` (null = paling
 * bawah). Aturan tempat tetap sama dengan pindahHorizon.
 */
export function letakkanHorizon(urutan: readonly string[], id: string, sebelum: string | null): string[] {
  if (TETAP_HORIZON.has(id) || !urutan.includes(id) || id === sebelum) return [...urutan];
  const tanpa = urutan.filter((lain) => lain !== id);
  const ke = sebelum === null ? tanpa.length : tanpa.indexOf(sebelum);
  return pindahHorizon(urutan, id, ke < 0 ? tanpa.length : ke);
}
