import { KARTU, type KunciKartu, type Pertanyaan } from "./setelan.ts";

/**
 * Urutan layar Kilas balik untuk satu peserta. Fungsi murni (alur.check.ts).
 *
 * Kartu kenangan hanya tampil bila panitia menyalakannya DAN peserta itu punya
 * datanya (tanpa kereta, tanpa kartu perjalanan). Pertanyaan yang ditempel ke
 * kartu yang tidak tampil tetap ditanyakan, di tempat kartu itu seharusnya:
 * peserta tanpa hotel tetap ditanya soal acaranya.
 */

export type Kenangan = {
  /** Nama sapaan peserta. */
  nama: string;
  /** Berapa hari acaranya (1 bila satu hari). */
  hari: number;
  trip: { mode: "train" | "flight" | "ship" | "bus"; judul: string; kapan: string | null; detail: string | null } | null;
  stay: { hotel: string; kamar: string | null; teman: string[]; malam: number } | null;
  agenda: { hadir: number; sorotan: string[] } | null;
  prize: { hadiah: string[] } | null;
};

export type Layar =
  | { jenis: "buka" }
  | { jenis: "kartu"; kartu: KunciKartu }
  | { jenis: "tanya"; q: Pertanyaan }
  | { jenis: "tutup" };

export function adaData(k: Kenangan, kartu: KunciKartu): boolean {
  if (kartu === "trip") return k.trip !== null;
  if (kartu === "stay") return k.stay !== null;
  if (kartu === "agenda") return k.agenda !== null && (k.agenda.hadir > 0 || k.agenda.sorotan.length > 0);
  return k.prize !== null && k.prize.hadiah.length > 0;
}

export function susunAlur(questions: Pertanyaan[], cards: Record<KunciKartu, boolean>, k: Kenangan): Layar[] {
  const layar: Layar[] = [{ jenis: "buka" }];
  for (const kartu of KARTU) {
    if (cards[kartu] && adaData(k, kartu)) layar.push({ jenis: "kartu", kartu });
    for (const q of questions) if (q.after === kartu) layar.push({ jenis: "tanya", q });
  }
  for (const q of questions) if (!q.after || !KARTU.includes(q.after)) layar.push({ jenis: "tanya", q });
  layar.push({ jenis: "tutup" });
  return layar;
}

/** Berapa pertanyaan tersisa sesudah layar ke-`i` (tidak termasuk yang sedang tampil bila sudah dijawab). */
export function sisaPertanyaan(layar: Layar[], i: number): number {
  return layar.slice(i).filter((l) => l.jenis === "tanya").length;
}

/** Layar tempat melanjutkan: pertanyaan wajib pertama yang belum dijawab, atau 0. */
export function layarLanjut(layar: Layar[], jawaban: Record<string, unknown>, terakhir: number): number {
  const batas = Math.min(Math.max(terakhir, 0), layar.length - 1);
  for (let i = 0; i < batas; i++) {
    const l = layar[i];
    if (l.jenis === "tanya" && l.q.required && !terisi(jawaban[l.q.key])) return i;
  }
  return batas;
}

export function terisi(v: unknown): boolean {
  if (typeof v === "number") return true;
  if (typeof v === "string") return v.trim() !== "";
  return Array.isArray(v) && v.length > 0;
}
