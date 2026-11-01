/**
 * Daftar jenis blok halaman acara: SATU tempat untuk semua yang dibaca di luar
 * editor dan renderer per jenis. Tipe `LandingBlockType`, enum skema simpan,
 * label, deskripsi, kelompok di dialog Tambah, latar bawaan, dan boleh tidaknya
 * tampil di halaman peserta semuanya diturunkan dari array ini.
 *
 * Menambah jenis blok: tambahkan satu entri di sini, lalu TypeScript menunjuk
 * setiap `Record<LandingBlockType, …>` dan `switch` yang belum menanganinya.
 * `jenis.check.ts` memeriksa entrinya lengkap.
 *
 * Urutan array = urutan di dialog Tambah blok.
 *
 * Berkas ini tanpa impor: dibaca oleh domain.ts, skema, dan berkas `.check.ts`.
 */

/** Kelompok di dialog Tambah blok. */
export type KelompokBlok = "media" | "daftar" | "data" | "panduan" | "ajakan";

export const LABEL_KELOMPOK_BLOK: Record<KelompokBlok, string> = {
  media: "Text and media",
  daftar: "Cards and lists",
  data: "From your event data",
  panduan: "Guidance",
  ajakan: "Partners and calls to action",
};

type Latar = "light" | "panel" | "dark";

type DefinisiBlok = {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly kelompok: KelompokBlok;
  /** Latar saat baru ditambahkan. */
  readonly latar: Latar;
  /** Punya kartu di halaman peserta (components/member/kartu-blok.tsx), jadi boleh memilih Show on. */
  readonly peserta: boolean;
  /** Nama satu butir ("card"), untuk "Card 1" dan "3 cards". Kosong = blok tanpa butir bernama. */
  readonly butir?: string;
};

export const JENIS_BLOK = [
  { type: "text_image", label: "Text and image", description: "A short story with one photo on the left or right.", kelompok: "media", latar: "light", peserta: true },
  { type: "multicolumn", label: "Columns", description: "1 to 4 columns, each with an image, title, text and link.", kelompok: "media", latar: "light", peserta: true, butir: "column" },
  { type: "cards", label: "Image cards", description: "Sessions, topics or reading, each with a photo.", kelompok: "daftar", latar: "light", peserta: true, butir: "card" },
  { type: "points", label: "Point cards", description: "Points without photos: definitions, goals or who should attend.", kelompok: "daftar", latar: "light", peserta: true, butir: "point" },
  { type: "stats", label: "Figures strip", description: "2 to 4 real figures with their source, on a dark background.", kelompok: "daftar", latar: "dark", peserta: true, butir: "figure" },
  { type: "logos", label: "Partner logos", description: "Organiser, partner or sponsor logos.", kelompok: "ajakan", latar: "light", peserta: true, butir: "logo" },
  { type: "download", label: "Downloads", description: "Links to terms of reference, brochures or PDF materials.", kelompok: "panduan", latar: "panel", peserta: true },
  { type: "cta", label: "Call-to-action strip", description: "A call to register, with or without a background photo.", kelompok: "ajakan", latar: "light", peserta: true },
  { type: "countdown", label: "Countdown", description: "Days, hours and minutes to the event start. Hides itself once the event is over.", kelompok: "data", latar: "dark", peserta: true },
  { type: "gallery", label: "Photo gallery", description: "3 to 12 photos of the event.", kelompok: "media", latar: "panel", peserta: true, butir: "photo" },
  { type: "quote", label: "Quote", description: "One real quote with a name and job title.", kelompok: "media", latar: "light", peserta: true },
  { type: "route", label: "Directions", description: "How to get from one place to another, e.g. between two hotels, with a Google Maps button.", kelompok: "data", latar: "panel", peserta: true },
  { type: "dos_donts", label: "Do's and Don'ts", description: "What to do and what to avoid, each with an icon: what to wear, what to bring, house rules.", kelompok: "panduan", latar: "panel", peserta: false },
  { type: "dress_code", label: "Dress code", description: "What to wear each day, taken from Agenda > Dress code, so guests can pack before they sign in.", kelompok: "data", latar: "panel", peserta: false },
] as const satisfies readonly DefinisiBlok[];

export type JenisBlok = (typeof JENIS_BLOK)[number]["type"];

/** Semua jenis, urut seperti di dialog Tambah blok. Tuple supaya bisa dipakai `z.enum`. */
export const DAFTAR_JENIS_BLOK = JENIS_BLOK.map((jenis) => jenis.type) as unknown as readonly [JenisBlok, ...JenisBlok[]];

const PER_JENIS = new Map<string, DefinisiBlok>(JENIS_BLOK.map((jenis) => [jenis.type, jenis]));

export function definisiBlok(type: JenisBlok): DefinisiBlok {
  const def = PER_JENIS.get(type);
  if (!def) throw new Error(`Unknown block type: ${type}`);
  return def;
}

export function adaJenisBlok(type: string): type is JenisBlok {
  return PER_JENIS.has(type);
}

/** `{ jenis: nilai }` untuk setiap jenis, dari satu kolom definisi. */
export function petaJenisBlok<K extends keyof DefinisiBlok>(kolom: K): Record<JenisBlok, DefinisiBlok[K]> {
  return Object.fromEntries(JENIS_BLOK.map((jenis) => [jenis.type, (jenis as DefinisiBlok)[kolom]])) as Record<JenisBlok, DefinisiBlok[K]>;
}
