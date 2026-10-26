/**
 * Untuk siapa sebuah bagian Agenda (Agenda > This section > Who it's for).
 *
 * Kosong berarti semua peserta, jadi acara yang sudah ada berubah 0 px.
 * Terisi: satu kolom peserta (pertanyaan form, termasuk kolom khusus staf
 * seperti Batch dari #201) dan satu atau beberapa jawaban. Pola dari Cvent
 * dan Whova: sesi diberi sasaran segmen peserta, dan agenda pribadi
 * menampilkan sesi milik peserta lebih dulu tanpa menyembunyikan yang lain.
 *
 * Portal memakai sasaran untuk memilih bagian peserta sendiri pada hari yang
 * punya beberapa bagian (Batch 1 dan Batch 2 KSO). Peserta tanpa jawaban di
 * kolom itu tetap melihat semua bagian berlabel, seperti sebelumnya.
 *
 * Murni, tanpa impor runtime, supaya bisa diuji langsung oleh Node
 * (sasaran-bagian.check.ts).
 */

export type SasaranBagian = { field: string; values: string[] };

export const SASARAN_NILAI_MAX = 20;
export const SASARAN_NILAI_PANJANG = 120;

const sama = (a: string, b: string) => a.trim().toLocaleLowerCase("id") === b.trim().toLocaleLowerCase("id");

/** Bentuk tersimpan menjadi sasaran yang sah, atau null (semua peserta). */
export function bacaSasaran(nilai: unknown): SasaranBagian | null {
  if (!nilai || typeof nilai !== "object" || Array.isArray(nilai)) return null;
  const baris = nilai as Record<string, unknown>;
  const field = typeof baris.field === "string" ? baris.field.trim() : "";
  if (!/^[a-z0-9_]{1,64}$/.test(field) || !Array.isArray(baris.values)) return null;
  const values: string[] = [];
  for (const isi of baris.values) {
    if (typeof isi !== "string" || !isi.trim()) continue;
    const teks = isi.trim().slice(0, SASARAN_NILAI_PANJANG);
    if (!values.some((ada) => sama(ada, teks))) values.push(teks);
  }
  return values.length > 0 ? { field, values: values.slice(0, SASARAN_NILAI_MAX) } : null;
}

/** Jawaban peserta di kolom itu, sebagai teks; null bila kosong. */
export function jawabanPeserta(extra: Record<string, unknown> | null | undefined, field: string): string | null {
  const isi = extra?.[field];
  if (typeof isi === "string") return isi.trim() || null;
  if (typeof isi === "number" || typeof isi === "boolean") return String(isi);
  return null;
}

/**
 * Bagian ini milik peserta?
 *   true   sasarannya cocok dengan jawaban peserta
 *   false  jawaban peserta ada dan tidak cocok
 *   null   bagian untuk semua, atau peserta belum punya jawaban di kolom itu
 */
export function milikPeserta(sasaran: SasaranBagian | null, extra: Record<string, unknown> | null | undefined): boolean | null {
  if (!sasaran) return null;
  const jawaban = jawabanPeserta(extra, sasaran.field);
  if (jawaban === null) return null;
  return sasaran.values.some((nilai) => sama(nilai, jawaban));
}

export type PilihanPeserta = {
  /** Indeks bagian yang bukan milik peserta: Beranda tidak memakainya. */
  bukanMilik: Set<number>;
  /** Indeks bagian milik peserta (sasarannya cocok). */
  milik: Set<number>;
  /**
   * Label kelompok peserta untuk layar QR dan Jadwal ("Batch 2"): jawabannya
   * di kolom yang dipakai sasaran bagian mana pun. Hanya ada bila panitia
   * memakai kolom itu untuk Agenda, jadi kolom staf lain tetap tidak tampil.
   */
  kelompok: string | null;
};

/**
 * Bagian mana yang milik peserta, dari sasaran tiap bagian (urut seperti
 * agenda). Bagian tanpa sasaran tidak masuk ke mana pun: ia untuk semua.
 */
export function pilihanPeserta(sasaran: ReadonlyArray<SasaranBagian | null>, extra: Record<string, unknown> | null | undefined): PilihanPeserta {
  const milik = new Set<number>();
  const bukanMilik = new Set<number>();
  // Label dari kolom bagian yang cocok; tanpa bagian yang cocok, dari kolom sasaran pertama.
  let kelompok: string | null = null;
  let cadangan: string | null = null;
  sasaran.forEach((isi, indeks) => {
    const hasil = milikPeserta(isi, extra);
    if (hasil === true) milik.add(indeks);
    if (hasil === false) bukanMilik.add(indeks);
    if (isi && hasil === true && kelompok === null) kelompok = jawabanPeserta(extra, isi.field);
    if (isi && cadangan === null) cadangan = jawabanPeserta(extra, isi.field);
  });
  return { milik, bukanMilik, kelompok: kelompok ?? cadangan };
}

/**
 * Bagian yang dibuka lebih dulu di satu hari: milik peserta bila ada, lalu
 * yang untuk semua, lalu yang pertama.
 */
export function bagianPertama(indeksHari: readonly number[], pilihan: Pick<PilihanPeserta, "milik" | "bukanMilik">): number | undefined {
  return indeksHari.find((indeks) => pilihan.milik.has(indeks)) ?? indeksHari.find((indeks) => !pilihan.bukanMilik.has(indeks)) ?? indeksHari[0];
}

export type KolomSasaran = {
  key: string;
  label: string;
  options: string[];
  staff: boolean;
  /** Registration > Edit form > "Show answers in the public agenda" (labelAgendaPublik di sasaran-baris.ts). */
  label_agenda: boolean;
};

/**
 * Kolom peserta yang bisa menjadi sasaran: pertanyaan dropdown atau radio
 * yang punya pilihan, termasuk kolom khusus staf (#201, `on_form: false`).
 * Pertanyaan teks bebas tidak ditawarkan: jawabannya tidak bisa dipilih dari
 * daftar, dan salah ketik satu huruf membuat peserta jatuh ke bagian lain.
 */
export function kolomSasaran(config: unknown): KolomSasaran[] {
  const fields = (config && typeof config === "object" ? (config as { fields?: unknown }).fields : null) ?? [];
  if (!Array.isArray(fields)) return [];
  const hasil: KolomSasaran[] = [];
  for (const field of fields as Array<Record<string, unknown>>) {
    if (!field || (field.type !== "select" && field.type !== "radio")) continue;
    if (typeof field.key !== "string" || !/^[a-z0-9_]{1,64}$/.test(field.key)) continue;
    const options = Array.isArray(field.options) ? (field.options as unknown[]).filter((isi): isi is string => typeof isi === "string" && isi.trim() !== "").map((isi) => isi.trim()) : [];
    if (options.length === 0) continue;
    hasil.push({ key: field.key, label: typeof field.label === "string" && field.label.trim() ? field.label.trim() : field.key, options, staff: field.on_form === false, label_agenda: field.agenda_label === true });
  }
  return hasil;
}
