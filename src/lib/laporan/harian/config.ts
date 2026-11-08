/**
 * Pilihan panitia per hari, disimpan di `event_reports.config.harian`
 * (tanpa migrasi baru). Salinan yang dikunci ikut disimpan di sini: kecil
 * (sekitar 3 KB per hari) dan dibatasi 14 hari, jauh di bawah batas 100 KB
 * kolom config.
 */
import { KUNCI_HALAMAN, type HariHighlight, type KunciHalaman } from "./jenis.ts";

export const BATAS_HARIAN = { hari: 14, catatan: 160, foto: 3, url: 1000 } as const;

export type SetelanHari = {
  sembunyi: KunciHalaman[];
  catatan: string;
  /** Foto panitia: [0] sampul, [1] halaman jam, [2] penutup; "" = tidak ada. Sampul tanpa foto memakai foto hero acara. */
  foto: string[];
  kunci: { at: string; hari: HariHighlight } | null;
};
export type ConfigHarian = Record<string, SetelanHari>;

export const SETELAN_KOSONG: SetelanHari = { sembunyi: [], catatan: "", foto: [], kunci: null };

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const kunciSah = new Set<string>(KUNCI_HALAMAN);

/** Salinan terkunci dipercaya dari server sendiri; cukup diperiksa bentuk luarnya. */
function bacaKunci(nilai: unknown): SetelanHari["kunci"] {
  if (!nilai || typeof nilai !== "object") return null;
  const k = nilai as { at?: unknown; hari?: unknown };
  const hari = k.hari as Partial<HariHighlight> | undefined;
  if (typeof k.at !== "string" || !hari || typeof hari.tanggal !== "string" || !Array.isArray(hari.halaman)) return null;
  return { at: k.at, hari: hari as HariHighlight };
}

export function bacaSetelanHari(nilai: unknown, fotoSah: (url: string) => boolean = () => true): SetelanHari {
  if (!nilai || typeof nilai !== "object" || Array.isArray(nilai)) return { ...SETELAN_KOSONG };
  const s = nilai as Record<string, unknown>;
  const sembunyi = Array.isArray(s.sembunyi) ? [...new Set(s.sembunyi.filter((k): k is KunciHalaman => typeof k === "string" && kunciSah.has(k)))] : [];
  const catatan = typeof s.catatan === "string" ? s.catatan.replace(/\s+/g, " ").trim().slice(0, BATAS_HARIAN.catatan) : "";
  // Posisi berarti ([0] sampul, [1] jam, [2] penutup): yang kosong atau tidak sah jadi "".
  const foto = Array.isArray(s.foto)
    ? s.foto.slice(0, BATAS_HARIAN.foto).map((u) => (typeof u === "string" && u && u.length <= BATAS_HARIAN.url && fotoSah(u) ? u : ""))
    : [];
  while (foto.length && !foto[foto.length - 1]) foto.pop();
  return { sembunyi, catatan, foto, kunci: bacaKunci(s.kunci) };
}

export function bacaHarian(nilai: unknown): ConfigHarian {
  if (!nilai || typeof nilai !== "object" || Array.isArray(nilai)) return {};
  const hasil: ConfigHarian = {};
  for (const [tgl, isi] of Object.entries(nilai).filter(([t]) => TANGGAL.test(t)).sort(([a], [b]) => a.localeCompare(b)).slice(-BATAS_HARIAN.hari)) {
    hasil[tgl] = bacaSetelanHari(isi);
  }
  return hasil;
}
