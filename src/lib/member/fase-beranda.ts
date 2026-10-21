import { rentangAcara, type JadwalHitungMundur } from "../landing-hitung-mundur.ts";

/**
 * Fase Beranda Gathering Horizon (keputusan Mas 20 Okt, E-15): isinya
 * berganti sebelum, saat, dan sesudah acara.
 *
 * Dihitung dari tanggal dan jam acara, sumber yang sama dengan blok Hitung
 * mundur, bukan dari tanggal bagian Agenda: hari ambil badge sebelum acara
 * tetap "sebelum". "Saat" mulai pada jam mulai acara, bukan tengah malam, dan
 * berlangsung sampai akhir hari terakhir menurut kalender (perjalanan pulang
 * masih hari itu), jadi "sesudah" baru esok harinya.
 *
 * `hariIni`: tanggal hari ini di zona acara (YYYY-MM-DD), sama dengan yang
 * dipakai susunan acara. Null bila acara tanpa tanggal.
 */
export type FaseBeranda =
  | { fase: "sebelum"; /** 0 = hari pertama, sebelum jam mulai; 1 = besok. */ sisaHari: number }
  | { fase: "saat"; /** Dihitung dari 1. */ hariKe: number; lama: number }
  | { fase: "sesudah" };

const SEHARI = 86_400_000;

export function faseBeranda(jadwal: JadwalHitungMundur, sekarang: number, hariIni: string): FaseBeranda | null {
  const rentang = rentangAcara(jadwal);
  if (!rentang) return null;
  const keHariIni = Math.round((Date.parse(`${hariIni}T00:00:00Z`) - Date.parse(`${rentang.hariPertama}T00:00:00Z`)) / SEHARI);
  if (Number.isNaN(keHariIni)) return null;
  if (keHariIni >= rentang.lama) return { fase: "sesudah" };
  if (sekarang < rentang.mulai) return { fase: "sebelum", sisaHari: Math.max(0, -keHariIni) };
  return { fase: "saat", hariKe: Math.max(1, keHariIni + 1), lama: rentang.lama };
}
