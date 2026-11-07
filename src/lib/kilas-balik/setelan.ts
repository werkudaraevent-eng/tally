import { z } from "zod";
import { CARRY_MIN, SYARAT_MAX, kunciRecall, lolosJawaban, pilihanDari, syaratSchema, type Syarat } from "./logika.ts";

/**
 * Kilas balik: kuesioner akhir acara (Admin > Feedback, /e/<slug>/kilas-balik).
 *
 * Fungsi murni tanpa akses database, supaya bisa diuji langsung dengan Node
 * (setelan.check.ts) dan dipakai bersama oleh admin, API, dan halaman peserta.
 *
 * Peserta tidak "mengerjakan soal": mereka melihat ulang perjalanan mereka
 * sendiri (kartu kenangan dari data yang sudah ada di Tally), dan di sela
 * kenangan itu ada satu pertanyaan ringan per layar. Pola satu pertanyaan per
 * layar dari Typeform; kartu akhir pribadi dari Spotify Wrapped.
 */

/** Kartu kenangan. Isinya dibaca dari data acara; panitia hanya menyalakan atau mematikan. */
export const KARTU = ["trip", "stay", "agenda", "prize"] as const;
export type KunciKartu = (typeof KARTU)[number];

export const JENIS = ["faces", "nps", "choice", "text"] as const;
export type JenisPertanyaan = (typeof JENIS)[number];

export const PERTANYAAN_MAX = 8;
export const PILIHAN_MAX = 12;

export type Pertanyaan = {
  /** Kunci jawaban. Tetap walau judulnya diubah, supaya hasil lama tidak tercampur. */
  key: string;
  type: JenisPertanyaan;
  title: string;
  /** Judul dalam bahasa kedua acara (English bila Indonesia utama, dan sebaliknya). Kosong = judul utama. */
  title_alt?: string | null;
  /** `choice`: pilihan, minimal dua. */
  options?: string[];
  /**
   * `choice`: pilihan yang sama dengan judul baris Agenda hanya tampil ke
   * peserta yang bisa melihat baris itu (Who sees it). Pilihan lain tetap tampil.
   */
  from_agenda?: boolean;
  /** `choice`: berapa yang boleh dipilih, 1 sampai 3. */
  max?: number;
  required: boolean;
  /** Ditampilkan sesudah kartu kenangan ini. Null = sesudah kartu terakhir. */
  after?: KunciKartu | null;
  /** Logic > Show if: semua syarat harus cocok. Kosong = selalu tampil. Lihat logika.ts. */
  show_if?: Syarat[] | null;
  /** `choice`: pilihan diambil dari yang dicentang di pertanyaan pilihan ini (carry forward). */
  options_from?: string | null;
};

/**
 * Tampilan: cara pertanyaan yang sama disajikan. Jawaban, hasil, dan simpanan
 * di HP sama untuk ketiganya, jadi panitia bebas berganti kapan saja.
 * - kilas: kartu per layar seperti Stories, kenangan di sela pertanyaan.
 * - percakapan: obrolan dengan panitia, kenangan jadi gelembung pesan.
 * - ringkas: satu halaman, semua pertanyaan sekaligus, untuk yang buru-buru.
 */
export const TAMPILAN = ["kilas", "percakapan", "ringkas"] as const;
export type Tampilan = (typeof TAMPILAN)[number];

/** Warna: ikut tema acara, atau dua warna sendiri (latar kartu kenangan, aksen). */
export type TemaKilas = { mode: "event" | "custom"; brand: string | null; accent: string | null };
export const TEMA_AWAL: TemaKilas = { mode: "event", brand: null, accent: null };
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const temaSchema = z.object({ mode: z.enum(["event", "custom"]), brand: hex.nullable(), accent: hex.nullable() });

export type SetelanKilas = {
  enabled: boolean;
  /** Judul kartu pembuka. Kosong = "Halo, <nama>". */
  title: string | null;
  intro: string | null;
  /** Ucapan panitia di kartu penutup. */
  closing: string | null;
  /** Nama di bawah ucapan penutup, mis. "Rina, Ketua Panitia". */
  signed_by: string | null;
  display: Tampilan;
  theme: TemaKilas;
  questions: Pertanyaan[];
  cards: Record<KunciKartu, boolean>;
  opens_at: string | null;
  closes_at: string | null;
  updated_at: string | null;
};

const kunci = z.string().trim().regex(/^[a-z0-9_]{1,40}$/);
const teks = (max: number) => z.string().trim().min(1).max(max);

export const pertanyaanSchema = z
  .object({
    key: kunci,
    type: z.enum(JENIS),
    title: teks(200),
    title_alt: z.string().trim().max(200).nullable().optional(),
    options: z.array(teks(80)).max(PILIHAN_MAX).optional(),
    from_agenda: z.boolean().optional(),
    max: z.number().int().min(1).max(3).optional(),
    required: z.boolean(),
    after: z.enum(KARTU).nullable().optional(),
    show_if: z.array(syaratSchema).max(SYARAT_MAX).nullable().optional(),
    options_from: kunci.nullable().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === "choice" && !q.options_from && (q.options?.length ?? 0) < 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two options." });
    }
  });

export const setelanSchema = z
  .object({
    enabled: z.boolean(),
    title: z.string().trim().max(120).nullable(),
    intro: z.string().trim().max(600).nullable(),
    closing: z.string().trim().max(600).nullable(),
    signed_by: z.string().trim().max(120).nullable(),
    display: z.enum(TAMPILAN),
    theme: temaSchema,
    questions: z.array(pertanyaanSchema).max(PERTANYAAN_MAX),
    cards: z.object(Object.fromEntries(KARTU.map((k) => [k, z.boolean()])) as Record<KunciKartu, z.ZodBoolean>),
    opens_at: z.string().datetime({ offset: true }).nullable(),
    closes_at: z.string().datetime({ offset: true }).nullable(),
  })
  .superRefine((s, ctx) => {
    const ada = new Set<string>();
    s.questions.forEach((q, i) => {
      if (ada.has(q.key)) ctx.addIssue({ code: "custom", path: ["questions", i, "key"], message: "Two questions share the same key." });
      ada.add(q.key);
    });
    const masalah = masalahLogika(s.questions as Pertanyaan[]);
    for (const m of masalah) ctx.addIssue({ code: "custom", path: ["questions", m.indeks], message: m.pesan });
    if (s.enabled && s.questions.length === 0) ctx.addIssue({ code: "custom", path: ["questions"], message: "Add at least one question before turning Feedback on." });
    if (s.theme.mode === "custom" && !s.theme.brand) ctx.addIssue({ code: "custom", path: ["theme", "brand"], message: "Pick a background colour for your own theme." });
    if (s.opens_at && s.closes_at && Date.parse(s.opens_at) >= Date.parse(s.closes_at)) {
      ctx.addIssue({ code: "custom", path: ["closes_at"], message: "Closing time must be after opening time." });
    }
  });

/** Urutan pertanyaan seperti yang dialami peserta: per kartu kenangan, lalu yang di akhir. Stabil. */
export function urutAlur<T extends Pick<Pertanyaan, "after">>(questions: readonly T[]): T[] {
  const posisi = (q: T) => (q.after && KARTU.includes(q.after) ? KARTU.indexOf(q.after) : KARTU.length);
  return questions.map((q, n) => ({ q, n })).sort((a, b) => posisi(a.q) - posisi(b.q) || a.n - b.n).map((x) => x.q);
}

/** Judul pendek untuk pesan dan menu admin: "Q2 · Momen mana yang…". */
export function namaPertanyaan(questions: readonly Pertanyaan[], key: string): string {
  const urut = urutAlur(questions);
  const n = urut.findIndex((q) => q.key === key);
  if (n < 0) return "a deleted question";
  const judul = urut[n].title.trim();
  return `Q${n + 1}${judul ? ` (${judul.length > 40 ? `${judul.slice(0, 39)}…` : judul})` : ""}`;
}

/**
 * Logic yang tidak bisa jalan: syarat, recall, atau carry forward yang
 * merujuk pertanyaan yang sudah dihapus, yang datang SESUDAH pertanyaan ini
 * (peserta belum menjawabnya), atau yang jenisnya tidak cocok. Admin
 * menampilkan pesannya di pertanyaan itu; Save ditolak sampai dibereskan.
 */
export function masalahLogika(questions: readonly Pertanyaan[]): { key: string; indeks: number; pesan: string }[] {
  const urut = urutAlur(questions);
  const posisi = new Map(urut.map((q, n) => [q.key, n]));
  const hasil: { key: string; indeks: number; pesan: string }[] = [];
  questions.forEach((q, indeks) => {
    const saya = posisi.get(q.key) ?? 0;
    const sebelum = (k: string) => (posisi.get(k) ?? Infinity) < saya;
    const tambah = (pesan: string) => hasil.push({ key: q.key, indeks, pesan });
    for (const s of q.show_if ?? []) {
      if (s.source !== "answer") continue;
      const sumber = questions.find((x) => x.key === s.q);
      if (!sumber) tambah("Show if uses a question that was deleted.");
      else if (!sebelum(s.q)) tambah(`Show if uses ${namaPertanyaan(questions, s.q)}, which comes later. Move this question below it.`);
      else if ((s.op === "includes" || s.op === "excludes") && sumber.type !== "choice") tambah("Show if picks an option from a question without options.");
      else if ((s.op === "gte" || s.op === "lte") && sumber.type !== "faces" && sumber.type !== "nps") tambah("Show if compares a score on a question without a score.");
    }
    for (const k of new Set([...kunciRecall(q.title), ...kunciRecall(q.title_alt ?? "")])) {
      if (!questions.some((x) => x.key === k)) tambah(`The question text recalls {${k}}, which no longer exists.`);
      else if (!sebelum(k)) tambah(`The question text recalls ${namaPertanyaan(questions, k)}, which comes later.`);
    }
    if (q.options_from) {
      const sumber = questions.find((x) => x.key === q.options_from);
      if (q.type !== "choice") tambah("Only Choice questions can take options from another question.");
      else if (!sumber) tambah("Options come from a question that was deleted.");
      else if (sumber.type !== "choice" || (sumber.max ?? 1) < 2) tambah(`Options come from ${namaPertanyaan(questions, sumber.key)}, which must be a Choice question where participants pick two or more.`);
      else if (!sebelum(sumber.key)) tambah(`Options come from ${namaPertanyaan(questions, sumber.key)}, which comes later.`);
    }
  });
  return hasil;
}

/** Pertanyaan awal yang diisi saat panitia pertama kali membuka Feedback. Bisa diubah semuanya. */
export function pertanyaanAwal(lang: "id" | "en", judulAgenda: string[] = []): Pertanyaan[] {
  const id = lang === "id";
  const dariAgenda = [...new Set(judulAgenda.map((j) => j.trim()).filter((j) => j && j.length <= 80))].slice(0, 8);
  const momen = dariAgenda.length >= 2
    ? dariAgenda
    : id ? ["Sesi utama", "Kegiatan bersama", "Makan malam", "Ngobrol dengan tim lain"] : ["Main sessions", "Group activities", "Dinner", "Meeting other teams"];
  return [
    {
      key: "perjalanan",
      type: "faces",
      title: id ? "Bagaimana perjalanan dan penginapanmu?" : "How were your travel and stay?",
      title_alt: id ? "How were your travel and stay?" : "Bagaimana perjalanan dan penginapanmu?",
      required: true,
      after: "stay",
    },
    {
      key: "momen",
      type: "choice",
      title: id ? "Momen mana yang paling berkesan?" : "Which moment stood out the most?",
      title_alt: id ? "Which moment stood out the most?" : "Momen mana yang paling berkesan?",
      options: momen,
      from_agenda: dariAgenda.length >= 2,
      max: 2,
      required: true,
      after: "agenda",
    },
    {
      key: "rekomendasi",
      type: "nps",
      title: id ? "Seberapa mungkin kamu mengajak rekan ikut acara seperti ini?" : "How likely are you to recommend an event like this to a colleague?",
      title_alt: id ? "How likely are you to recommend an event like this to a colleague?" : "Seberapa mungkin kamu mengajak rekan ikut acara seperti ini?",
      required: true,
      after: null,
    },
    {
      key: "saran",
      type: "text",
      title: id ? "Satu hal yang bikin acara berikutnya lebih seru?" : "One thing that would make the next event even better?",
      title_alt: id ? "One thing that would make the next event even better?" : "Satu hal yang bikin acara berikutnya lebih seru?",
      required: false,
      after: null,
    },
  ];
}

export const KARTU_AWAL: Record<KunciKartu, boolean> = { trip: true, stay: true, agenda: true, prize: true };

/** Bentuk aman dari baris feedback_settings apa pun (atau tidak ada baris). */
export function rapikanSetelan(baris: unknown): SetelanKilas {
  const r = (baris && typeof baris === "object" ? baris : {}) as Record<string, unknown>;
  const cardsMentah = (r.cards && typeof r.cards === "object" ? r.cards : {}) as Record<string, unknown>;
  const questions = Array.isArray(r.questions)
    ? r.questions.flatMap((q) => {
        const hasil = pertanyaanSchema.safeParse(q);
        return hasil.success ? [hasil.data as Pertanyaan] : [];
      }).slice(0, PERTANYAAN_MAX)
    : [];
  return {
    enabled: r.enabled === true,
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : null,
    intro: typeof r.intro === "string" && r.intro.trim() ? r.intro.trim() : null,
    closing: typeof r.closing === "string" && r.closing.trim() ? r.closing.trim() : null,
    signed_by: typeof r.signed_by === "string" && r.signed_by.trim() ? r.signed_by.trim() : null,
    display: (TAMPILAN as readonly string[]).includes(r.display as string) ? (r.display as Tampilan) : "kilas",
    theme: (() => {
      const t = temaSchema.safeParse(r.theme);
      return t.success && (t.data.mode === "event" || t.data.brand) ? t.data : TEMA_AWAL;
    })(),
    questions,
    cards: Object.fromEntries(KARTU.map((k) => [k, cardsMentah[k] !== false])) as Record<KunciKartu, boolean>,
    opens_at: typeof r.opens_at === "string" ? r.opens_at : null,
    closes_at: typeof r.closes_at === "string" ? r.closes_at : null,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}

export type StatusBuka = "off" | "not_yet" | "open" | "closed";

/** Apakah kilas balik bisa diisi sekarang. */
export function statusBuka(s: Pick<SetelanKilas, "enabled" | "opens_at" | "closes_at" | "questions">, now: Date): StatusBuka {
  if (!s.enabled || s.questions.length === 0) return "off";
  if (s.opens_at && now.getTime() < Date.parse(s.opens_at)) return "not_yet";
  if (s.closes_at && now.getTime() >= Date.parse(s.closes_at)) return "closed";
  return "open";
}

/** Kunci baru yang belum dipakai, dari judul pertanyaan. */
export function kunciBaru(judul: string, dipakai: Iterable<string>): string {
  const ada = new Set(dipakai);
  const dasar = judul.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "q";
  if (!ada.has(dasar)) return dasar;
  for (let n = 2; ; n++) {
    const coba = `${dasar}_${n}`;
    if (!ada.has(coba)) return coba;
  }
}

/* ------------------------------------------------------------- Jawaban */

export type NilaiJawaban = number | string | string[];

/**
 * Pilihan yang tampil untuk satu pertanyaan pilihan, dengan jawaban sejauh
 * ini. Carry forward: yang dicentang di pertanyaan sumber (kurang dari dua =
 * tidak ditanyakan). Selain itu `dasar` (pilihan tetap, atau Agenda miliknya).
 */
export function pilihanTampil(q: Pick<Pertanyaan, "options_from">, dasar: readonly string[], jawaban: Record<string, unknown>): string[] {
  if (!q.options_from) return [...dasar];
  const dari = pilihanDari(jawaban, q.options_from);
  return dari.length >= CARRY_MIN ? dari : [];
}

/**
 * Jawaban yang aman disimpan: hanya pertanyaan yang memang tampil bagi peserta
 * ini, nilai yang cocok dengan jenisnya. Dinilai urut seperti alurnya, jadi
 * Show if dan carry forward membaca jawaban sebelumnya yang sudah diperiksa.
 * `pilihanDasar` = pilihan tetap atau Agenda miliknya; `tampil` = syarat data
 * acara (logika.ts lolosFakta). Galat per kunci untuk pertanyaan wajib kosong.
 */
export function periksaJawaban(
  questions: Pertanyaan[],
  mentah: Record<string, unknown>,
  pilihanDasar: (q: Pertanyaan) => string[],
  tampil: (q: Pertanyaan) => boolean = () => true,
): { ok: true; jawaban: Record<string, NilaiJawaban> } | { ok: false; kosong: string[] } {
  const jawaban: Record<string, NilaiJawaban> = {};
  const kosong: string[] = [];
  for (const q of urutAlur(questions)) {
    if (!tampil(q) || !lolosJawaban(q.show_if, jawaban)) continue;
    const sahDaftar = q.type === "choice" ? pilihanTampil(q, pilihanDasar(q), jawaban) : [];
    // Pilihan yang semuanya tersembunyi bagi peserta ini (Agenda kelompok lain,
    // atau carry forward dengan kurang dari dua centang): pertanyaannya tidak
    // ditampilkan kepadanya, jadi tidak bisa wajib dan tidak menerima jawaban.
    if (q.type === "choice" && sahDaftar.length === 0) continue;
    const v = mentah[q.key];
    let nilai: NilaiJawaban | null = null;
    if (q.type === "faces" && typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5) nilai = v;
    if (q.type === "nps" && typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10) nilai = v;
    if (q.type === "text" && typeof v === "string" && v.trim()) nilai = v.trim().slice(0, 1000);
    if (q.type === "choice" && Array.isArray(v)) {
      const sah = new Set(sahDaftar);
      const pilih = [...new Set(v.filter((x): x is string => typeof x === "string" && sah.has(x)))].slice(0, q.max ?? 1);
      if (pilih.length) nilai = pilih;
    }
    if (nilai === null) {
      if (q.required) kosong.push(q.key);
      continue;
    }
    jawaban[q.key] = nilai;
  }
  return kosong.length ? { ok: false, kosong } : { ok: true, jawaban };
}

/* -------------------------------------------------------------- Hasil */

/** Net Promoter Score: % 9-10 dikurangi % 0-6, dibulatkan. Null tanpa jawaban. */
export function skorNps(nilai: number[]): number | null {
  if (!nilai.length) return null;
  const promotor = nilai.filter((n) => n >= 9).length;
  const detraktor = nilai.filter((n) => n <= 6).length;
  return Math.round(((promotor - detraktor) / nilai.length) * 100);
}

export type HasilPertanyaan =
  | { key: string; type: "faces"; title: string; count: number; average: number | null; spread: number[] }
  | { key: string; type: "nps"; title: string; count: number; score: number | null; promoters: number; passives: number; detractors: number }
  | { key: string; type: "choice"; title: string; count: number; options: { label: string; count: number }[] }
  | { key: string; type: "text"; title: string; count: number; latest: { text: string; at: string }[] };

/** Ringkasan per pertanyaan dari semua jawaban. `latest` maks. 50 teks terbaru. */
export function ringkasHasil(questions: Pertanyaan[], rows: { answers: Record<string, unknown>; submitted_at: string }[]): HasilPertanyaan[] {
  const urut = [...rows].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return questions.map((q): HasilPertanyaan => {
    const nilai = urut.map((r) => ({ v: r.answers[q.key], at: r.submitted_at })).filter((x) => x.v !== undefined && x.v !== null);
    if (q.type === "faces") {
      const angka = nilai.map((x) => x.v).filter((v): v is number => typeof v === "number" && v >= 1 && v <= 5);
      const spread = [1, 2, 3, 4, 5].map((n) => angka.filter((v) => v === n).length);
      return { key: q.key, type: "faces", title: q.title, count: angka.length, average: angka.length ? Math.round((angka.reduce((a, b) => a + b, 0) / angka.length) * 10) / 10 : null, spread };
    }
    if (q.type === "nps") {
      const angka = nilai.map((x) => x.v).filter((v): v is number => typeof v === "number" && v >= 0 && v <= 10);
      return {
        key: q.key, type: "nps", title: q.title, count: angka.length, score: skorNps(angka),
        promoters: angka.filter((n) => n >= 9).length, passives: angka.filter((n) => n === 7 || n === 8).length, detractors: angka.filter((n) => n <= 6).length,
      };
    }
    if (q.type === "choice") {
      const hitung = new Map<string, number>();
      for (const x of nilai) if (Array.isArray(x.v)) for (const p of x.v) if (typeof p === "string") hitung.set(p, (hitung.get(p) ?? 0) + 1);
      const options = [...hitung.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      return { key: q.key, type: "choice", title: q.title, count: nilai.filter((x) => Array.isArray(x.v) && x.v.length).length, options };
    }
    const tulisan = nilai.filter((x): x is { v: string; at: string } => typeof x.v === "string" && x.v.trim() !== "");
    return { key: q.key, type: "text", title: q.title, count: tulisan.length, latest: tulisan.slice(0, 50).map((x) => ({ text: x.v, at: x.at })) };
  });
}
