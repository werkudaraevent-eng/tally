import { CARRY_MIN, isiRecall, lolosJawaban, pilihanDari, type Syarat } from "./logika.ts";
import { KARTU, type KunciKartu, type NilaiJawaban, type Pertanyaan } from "./setelan.ts";

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

const menitDari = (jam: string | null | undefined): number | null => {
  const m = jam?.match(/^(\d{1,2})[:.](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Sorotan kartu Agenda: satu baris per hari acara (tanggal mulai..selesai),
 * yaitu baris bukan jeda yang paling lama di hari itu (seri: yang lebih
 * malam), supaya yang muncul gala atau sesi utama, bukan "Ambil tiket" atau
 * "Pengambilan badge" sebelum acara. Bagian tanpa tanggal dipakai hanya bila
 * tidak ada bagian bertanggal sama sekali.
 */
export function sorotanAgenda(
  bagian: { tanggal: string | null; items: { title: string; time: string; end: string | null; jeda: boolean }[] }[],
  mulai: string | null,
  akhir: string | null,
  max = 3,
): string[] {
  const bertanggal = bagian.some((b) => b.tanggal);
  const dalam = bagian.filter((b) => {
    if (!bertanggal) return true;
    if (!b.tanggal) return false;
    return (!mulai || b.tanggal >= mulai) && (!akhir || b.tanggal <= (akhir >= (mulai ?? "") ? akhir : mulai ?? akhir));
  });
  const perHari = new Map<string, { title: string; lama: number; mulai: number }>();
  dalam.forEach((b, n) => {
    const kunci = b.tanggal ?? `#${n}`;
    for (const i of b.items) {
      const judul = i.title.trim();
      if (i.jeda || !judul) continue;
      const a = menitDari(i.time) ?? 0;
      const z = menitDari(i.end);
      const lama = z !== null && z > a ? z - a : 0;
      const lama2 = perHari.get(kunci);
      if (!lama2 || lama > lama2.lama || (lama === lama2.lama && a > lama2.mulai)) perHari.set(kunci, { title: judul, lama, mulai: a });
    }
  });
  return [...new Set([...perHari.values()].map((v) => v.title))].slice(0, max);
}

/** Pertanyaan seperti yang dikirim ke HP: syarat jawaban saja, pilihan dasar, judul dengan `{kunci}`. */
export type TanyaAlur = {
  key: string;
  type: Pertanyaan["type"];
  title: string;
  options: string[];
  max: number;
  show_if?: Syarat[];
  options_from?: string | null;
};

/**
 * Layar yang benar-benar dilihat peserta dengan jawaban sejauh ini: pertanyaan
 * yang Show if-nya tidak cocok dilewati, `{kunci}` di judul diganti jawabannya
 * (`label`), dan pilihan carry forward diambil dari centang di pertanyaan
 * sumbernya. Jawaban pertanyaan yang sedang tersembunyi tidak dihitung untuk
 * syarat berikutnya, sama dengan periksaJawaban di server.
 */
export function alurAktif<L extends { jenis: string; q?: TanyaAlur }>(
  layar: readonly L[],
  jawaban: Record<string, NilaiJawaban>,
  label: (q: TanyaAlur, v: NilaiJawaban) => string | null,
): L[] {
  const terlihat: Record<string, NilaiJawaban> = {};
  const dilihat = new Map<string, TanyaAlur>();
  const hasil: L[] = [];
  for (const l of layar) {
    const q = l.jenis === "tanya" ? l.q : undefined;
    if (!q) {
      hasil.push(l);
      continue;
    }
    if (!lolosJawaban(q.show_if, terlihat)) continue;
    let options = q.options;
    if (q.type === "choice" && q.options_from) {
      const dari = pilihanDari(terlihat, q.options_from);
      options = dari.length >= CARRY_MIN ? dari : [];
    }
    if (q.type === "choice" && options.length === 0) continue;
    const title = isiRecall(q.title, (kunci) => {
      const sumber = dilihat.get(kunci);
      const v = terlihat[kunci];
      return sumber && v !== undefined ? label(sumber, v) : null;
    });
    const v = jawaban[q.key];
    if (v !== undefined) {
      if (q.type === "choice" && Array.isArray(v)) {
        const sah = v.filter((x) => options.includes(x));
        if (sah.length) terlihat[q.key] = sah;
      } else terlihat[q.key] = v;
    }
    dilihat.set(q.key, q);
    hasil.push({ ...l, q: { ...q, title, options } });
  }
  return hasil;
}
