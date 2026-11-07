import { z } from "zod";

/**
 * Logic Kilas balik: kapan sebuah pertanyaan tampil, dan bagaimana jawaban
 * sebelumnya mengubah pertanyaan berikutnya. Fungsi murni (diuji di alur.check.ts),
 * dipakai bersama oleh admin, API, dan halaman peserta.
 *
 * Tiga hal, dari pola builder kuesioner yang umum:
 * - Show if (Display logic di Qualtrics, conditional logic di Tally): satu
 *   sampai tiga syarat, SEMUA harus cocok. Bukan "lompat ke pertanyaan 5" ala
 *   Typeform: dengan paling banyak 8 pertanyaan hasilnya sama, dan urutan di
 *   daftar alur admin tetap terbaca dari atas ke bawah.
 * - Recall (Typeform): `{kunci}` di judul diganti jawaban pertanyaan itu.
 * - Carry forward (Qualtrics): pilihan sebuah pertanyaan diambil dari pilihan
 *   yang dicentang peserta di pertanyaan pilihan sebelumnya.
 *
 * Syarat boleh membaca jawaban sebelumnya ATAU data acara peserta itu sendiri:
 * sesi check-in yang mencatatnya, hadiah undian (hanya bila kartu hadiah tampil
 * di area peserta), dan kolom pilihan pendaftarannya. Syarat data acara dinilai
 * di server sebelum halaman dikirim; syarat jawaban dinilai di HP setiap kali
 * jawaban berubah, dan dinilai ulang di server saat jawaban dikirim.
 */

export const SYARAT_MAX = 3;

export type Syarat =
  | { source: "answer"; q: string; op: "includes" | "excludes"; value: string }
  | { source: "answer"; q: string; op: "gte" | "lte"; value: number }
  | { source: "answer"; q: string; op: "answered" | "skipped" }
  | { source: "checkin"; session: number; op: "yes" | "no" }
  | { source: "prize"; op: "yes" | "no" }
  | { source: "field"; field: string; values: string[] };

export const syaratSchema: z.ZodType<Syarat> = z.union([
  z.object({ source: z.literal("answer"), q: z.string().regex(/^[a-z0-9_]{1,40}$/), op: z.enum(["includes", "excludes"]), value: z.string().trim().min(1).max(80) }),
  z.object({ source: z.literal("answer"), q: z.string().regex(/^[a-z0-9_]{1,40}$/), op: z.enum(["gte", "lte"]), value: z.number().int().min(0).max(10) }),
  z.object({ source: z.literal("answer"), q: z.string().regex(/^[a-z0-9_]{1,40}$/), op: z.enum(["answered", "skipped"]) }),
  z.object({ source: z.literal("checkin"), session: z.number().int().positive(), op: z.enum(["yes", "no"]) }),
  z.object({ source: z.literal("prize"), op: z.enum(["yes", "no"]) }),
  z.object({ source: z.literal("field"), field: z.string().regex(/^[a-z0-9_]{1,64}$/), values: z.array(z.string().trim().min(1).max(120)).min(1).max(20) }),
]);

/** Data acara satu peserta untuk syarat. Dibaca di server saja. */
export type FaktaPeserta = {
  /** Id sesi check-in yang mencatat peserta ini. */
  sesi: ReadonlySet<number>;
  /** Punya hadiah undian yang tampil di kartu hadiah area peserta. */
  hadiah: boolean;
  /** Jawaban pendaftaran (participants.extra). */
  kolom: Record<string, unknown> | null;
};

const sama = (a: string, b: string) => a.trim().toLocaleLowerCase("id") === b.trim().toLocaleLowerCase("id");

const terisi = (v: unknown) => (typeof v === "number" ? true : typeof v === "string" ? v.trim() !== "" : Array.isArray(v) && v.length > 0);

/** Syarat data acara: true atau false. Syarat jawaban: null (dinilai nanti). */
export function cocokFakta(s: Syarat, f: FaktaPeserta): boolean | null {
  if (s.source === "checkin") return f.sesi.has(s.session) === (s.op === "yes");
  if (s.source === "prize") return f.hadiah === (s.op === "yes");
  if (s.source === "field") {
    const isi = f.kolom?.[s.field];
    const jawaban = typeof isi === "string" ? isi : typeof isi === "number" || typeof isi === "boolean" ? String(isi) : null;
    return jawaban !== null && jawaban.trim() !== "" && s.values.some((v) => sama(v, jawaban));
  }
  return null;
}

/** Syarat jawaban: true atau false. Syarat data acara: null (sudah dinilai di server). */
export function cocokJawaban(s: Syarat, jawaban: Record<string, unknown>): boolean | null {
  if (s.source !== "answer") return null;
  const v = jawaban[s.q];
  if (s.op === "answered") return terisi(v);
  if (s.op === "skipped") return !terisi(v);
  if (s.op === "includes" || s.op === "excludes") {
    const ada = Array.isArray(v) && v.some((x) => typeof x === "string" && sama(x, s.value));
    return s.op === "includes" ? ada : terisi(v) && !ada;
  }
  if (typeof v !== "number") return false;
  return s.op === "gte" ? v >= s.value : s.op === "lte" ? v <= s.value : false;
}

/** Semua syarat data acara cocok (syarat jawaban dilewati). */
export function lolosFakta(syarat: readonly Syarat[] | null | undefined, f: FaktaPeserta): boolean {
  return (syarat ?? []).every((s) => cocokFakta(s, f) !== false);
}

/** Semua syarat jawaban cocok (syarat data acara dilewati). */
export function lolosJawaban(syarat: readonly Syarat[] | null | undefined, jawaban: Record<string, unknown>): boolean {
  return (syarat ?? []).every((s) => cocokJawaban(s, jawaban) !== false);
}

/** Hanya syarat jawaban, untuk dikirim ke HP: data acara peserta tidak ikut ke klien. */
export function syaratJawabanSaja(syarat: readonly Syarat[] | null | undefined): Syarat[] {
  return (syarat ?? []).filter((s) => s.source === "answer");
}

/* -------------------------------------------------------------- Recall */

export const TOKEN = /\{([a-z0-9_]{1,40})\}/g;

/** Kunci pertanyaan yang dipanggil di teks. */
export function kunciRecall(teks: string): string[] {
  return [...teks.matchAll(TOKEN)].map((m) => m[1]);
}

/**
 * Ganti `{kunci}` dengan jawaban pertanyaan itu, dibentuk oleh `label`. Bila
 * belum dijawab, token dihapus lalu kurung kosong, spasi dan tanda baca dirapikan.
 */
export function isiRecall(teks: string, label: (kunci: string) => string | null): string {
  if (!teks.includes("{")) return teks;
  return teks
    .replace(TOKEN, (_, kunci: string) => label(kunci) ?? "")
    .replace(/\(\s*\)|\[\s*\]|"\s*"|“\s*”/g, "")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ------------------------------------------------------- Carry forward */

/** Pilihan yang dicentang di pertanyaan sumber, untuk carry forward. */
export function pilihanDari(jawaban: Record<string, unknown>, kunci: string): string[] {
  const v = jawaban[kunci];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

/** Carry forward perlu paling sedikit dua pilihan; satu pilihan saja tidak perlu ditanyakan. */
export const CARRY_MIN = 2;
