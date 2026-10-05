import { z } from "zod";
import { FIELDS } from "@/lib/pesan/bawaan";

/**
 * Templat email Konfirmasi pendaftaran, satu per acara.
 *
 * Berkas ini tanpa impor server: editor di peramban dan pengirim di server
 * memakai skema, bawaan, dan preset yang sama, supaya pratinjau tidak pernah
 * berbeda dari email yang benar-benar terkirim.
 *
 * Teks panitia disimpan sebagai teks biasa dengan format kecil (**tebal**,
 * _miring_, [tautan](https://...), "- " daftar), BUKAN HTML. Penyusunnya
 * (src/lib/pesan/format.ts) hanya mengeluarkan tag dari daftar izin dan
 * meng-escape sisanya, jadi tidak ada tag yang bisa diselundupkan ke email.
 */

export const TEXT_MAX = 2000;
export const BLOCKS_MAX = 24;

const tautan = z
  .string()
  .trim()
  .max(600)
  .refine((nilai) => /^(https?:\/\/|mailto:)\S+$/i.test(nilai), "Links must start with https://, http:// or mailto:");

/** Teks panitia: TextArea biasa dengan format kecil (lihat src/lib/pesan/format.ts). */
const teksKaya = z.string().max(TEXT_MAX);

const id = z.string().regex(/^[a-z0-9-]{1,40}$/);
const judul = z.string().trim().max(120);

/** Salinan email Tidak disetujui. Bawaan diisi saat dibaca, jadi templat yang disimpan sebelum fitur ini tetap sah. */
export const SALINAN_DITOLAK = {
  subjek: "Kabar pendaftaran {acara}",
  judul: "Terima kasih atas minat Anda",
  isi: "Halo {nama}, terima kasih sudah mendaftar di {acara}. Mohon maaf, kali ini panitia belum dapat menyetujui pendaftaran Anda.",
};
/**
 * Versi English sebuah kolom (lihat bahasa.ts). Kosong = bawaan English, atau
 * untuk teks bebas tanpa bawaan, teks Indonesianya.
 */
const enJudul = judul.optional();
const enTeks = teksKaya.optional();
const gambarUrl = z.string().trim().url().max(600).refine((nilai) => nilai.startsWith("https://"), "Images must come from an https:// address");

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("kepala"), on: z.literal(true) }),
  z.object({
    id,
    type: z.literal("pembuka"),
    on: z.boolean(),
    judul,
    isi: teksKaya,
    judul_menunggu: judul,
    isi_menunggu: teksKaya,
    judul_ditolak: judul.default(SALINAN_DITOLAK.judul),
    isi_ditolak: teksKaya.default(SALINAN_DITOLAK.isi),
    en: z
      .object({ judul: enJudul, isi: enTeks, judul_menunggu: enJudul, isi_menunggu: enTeks, judul_ditolak: enJudul, isi_ditolak: enTeks })
      .optional(),
  }),
  z.object({ id, type: z.literal("tiket"), on: z.literal(true) }),
  z.object({ id, type: z.literal("detail"), on: z.boolean() }),
  z.object({ id, type: z.literal("teks"), on: z.boolean(), isi: teksKaya, en: z.object({ isi: enTeks }).optional() }),
  z.object({
    id,
    type: z.literal("gambar"),
    on: z.boolean(),
    url: gambarUrl.nullable(),
    alt: z.string().trim().max(200),
    lebar: z.number().int().min(1).max(4000).optional(),
    tinggi: z.number().int().min(1).max(4000).optional(),
    href: tautan.optional(),
    en: z.object({ alt: z.string().trim().max(200).optional() }).optional(),
  }),
  z.object({
    id,
    type: z.literal("tombol"),
    on: z.boolean(),
    label: z.string().trim().min(1).max(40),
    tujuan: z.enum(["dashboard", "halaman", "url"]),
    url: tautan.optional(),
    en: z.object({ label: z.string().trim().max(40).optional() }).optional(),
  }),
  z.object({ id, type: z.literal("info"), on: z.boolean(), judul, isi: teksKaya, en: z.object({ judul: enJudul, isi: enTeks }).optional() }),
  z.object({ id, type: z.literal("mitra"), on: z.boolean(), judul, en: z.object({ judul: enJudul }).optional() }),
  z.object({ id, type: z.literal("garis"), on: z.boolean() }),
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];

export const PRESETS = ["banner", "pita", "polos"] as const;
export type Preset = (typeof PRESETS)[number];
export const FONTS = ["sans", "serif", "tema"] as const;
/** Aturan bahasa kirim (lihat bahasa.ts): ikuti formulir pendaftar, atau selalu satu bahasa. */
export const BAHASA_KIRIM = ["ikuti", "id", "en"] as const;
const subjekEn = z.string().trim().max(150).optional();
export type Font = (typeof FONTS)[number];

export const templatSchema = z
  .object({
    v: z.literal(1),
    preset: z.enum(PRESETS),
    font: z.enum(FONTS),
    subjek: z.string().trim().min(1).max(150),
    subjek_menunggu: z.string().trim().min(1).max(150),
    subjek_ditolak: z.string().trim().min(1).max(150).default(SALINAN_DITOLAK.subjek),
    /** Email "Tidak disetujui" saat panitia menolak. Bawaan mati: penolakan sering perlu disampaikan secara pribadi. */
    kirim_ditolak: z.boolean().default(false),
    /** Bawaan "ikuti": pendaftar dari formulir English menerima email English. */
    bahasa: z.enum(BAHASA_KIRIM).default("ikuti"),
    /** Subjek versi English; kosong = bawaan English. Teks bagian ada di `en` tiap bagian. */
    en: z.object({ subjek: subjekEn, subjek_menunggu: subjekEn, subjek_ditolak: subjekEn }).optional(),
    /**
     * Gambar kepala Banner KV yang sudah jadi: potongan KV 1200x400 dengan logo
     * putih di atasnya, dibuat sekali di peramban saat Simpan. Satu gambar,
     * bukan gambar latar + teks, karena Outlook desktop mengabaikan gambar latar.
     */
    kepala_url: gambarUrl.nullable(),
    /** Sumber gambar kepala (KV + logo) saat dibuat; beda = dibuat ulang saat Simpan. */
    kepala_sumber: z.string().max(1300).optional(),
    /** Logo putih untuk preset Pita warna. Kosong = logo acara apa adanya. */
    logo_putih_url: gambarUrl.nullable(),
    logo_putih_sumber: z.string().max(700).optional(),
    blocks: z.array(blockSchema).min(2).max(BLOCKS_MAX),
  })
  .superRefine((templat, ctx) => {
    // Kepala dan Tiket wajib ada tepat satu. Tanpa Tiket, email konfirmasi
    // kehilangan satu-satunya alasan keberadaannya: kode masuk peserta.
    for (const wajib of ["kepala", "tiket", "pembuka"] as const) {
      const jumlah = templat.blocks.filter((block) => block.type === wajib).length;
      if (jumlah !== 1) ctx.addIssue({ code: "custom", path: ["blocks"], message: `The email needs exactly one ${BLOCK_LABELS[wajib]} section.` });
    }
    if (templat.blocks[0]?.type !== "kepala") ctx.addIssue({ code: "custom", path: ["blocks"], message: "Header must be at the top." });
    templat.blocks.forEach((block, index) => {
      if (block.type === "gambar" && block.on && block.url && !block.alt) {
        ctx.addIssue({ code: "custom", path: ["blocks", index, "alt"], message: "Add alt text for the image." });
      }
      if (block.type === "tombol" && block.tujuan === "url" && !block.url) {
        ctx.addIssue({ code: "custom", path: ["blocks", index, "url"], message: "Add the button link." });
      }
    });
    const ids = templat.blocks.map((block) => block.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["blocks"], message: "Duplicate section ID." });
  });

export type Templat = z.infer<typeof templatSchema>;

export const BLOCK_LABELS: Record<BlockType, string> = {
  kepala: "Header",
  pembuka: "Opening",
  tiket: "Ticket and QR",
  detail: "Event details",
  teks: "Text",
  gambar: "Image",
  tombol: "Button",
  info: "Info box",
  mitra: "Partner logos",
  garis: "Divider",
};

/** Bagian yang bisa ditambah panitia lewat "+ Tambah bagian", dengan urutan menu. */
export const ADDABLE: { type: BlockType; note: string }[] = [
  { type: "teks", note: "Paragraph, bold, italic, link" },
  { type: "gambar", note: "Upload; alt text required" },
  { type: "tombol", note: "My dashboard, Event page, other link" },
  { type: "info", note: "Coloured box for important points" },
  { type: "mitra", note: "Logos from the Event page" },
  { type: "garis", note: "Line between sections" },
];

export const PRESET_LABELS: Record<Preset, { label: string; note: string }> = {
  banner: { label: "KV banner", note: "KV crop with the logo on top" },
  pita: { label: "Colour band", note: "Event main colour with a white logo" },
  polos: { label: "Plain", note: "Colour logo on white" },
};

export const FONT_LABELS: Record<Font, string> = { sans: "Sans", serif: "Serif", tema: "Follow theme" };

/** Gmail dan Outlook Windows tidak memuat huruf web; "Ikuti Tema" hanya tampil di Apple Mail. */
export const FONT_NOTES: Record<Font, string> = {
  sans: "Arial/Helvetica, looks the same in every email app",
  serif: "Georgia, looks the same in every email app",
  tema: "Event heading font in Apple Mail; Gmail and Outlook use Sans or Serif",
};

let urutId = 0;
export function newBlockId(type: BlockType): string {
  urutId += 1;
  return `${type}-${Date.now().toString(36)}${urutId.toString(36)}`.slice(0, 40);
}

export function newBlock(type: BlockType, opsi: { memberOn: boolean }): Block {
  const id = newBlockId(type);
  switch (type) {
    case "kepala":
      return { id, type, on: true };
    case "tiket":
      return { id, type, on: true };
    case "pembuka":
      return { ...DEFAULT_PEMBUKA, id };
    case "detail":
      return { id, type, on: true };
    case "teks":
      return { id, type, on: true, isi: "" };
    case "gambar":
      return { id, type, on: true, url: null, alt: "" };
    case "tombol":
      return opsi.memberOn
        ? { id, type, on: true, label: "Buka Dashboard saya", tujuan: "dashboard" }
        : { id, type, on: true, label: "Buka halaman acara", tujuan: "halaman" };
    case "info":
      return { id, type, on: true, judul: "Info penting", isi: "" };
    case "mitra":
      return { id, type, on: true, judul: "Didukung oleh" };
    case "garis":
      return { id, type, on: true };
  }
}

export const DEFAULT_PEMBUKA: Extract<Block, { type: "pembuka" }> = {
  id: "pembuka",
  type: "pembuka",
  on: true,
  judul: "Sampai jumpa di {acara}",
  isi: "Halo {nama}, pendaftaran Anda sudah dikonfirmasi. Simpan email ini; **QR di bawah adalah tiket masuk Anda**.",
  judul_menunggu: "Terima kasih sudah mendaftar",
  isi_menunggu: "Halo {nama}, pendaftaran Anda di {acara} sudah kami terima. Kami kabari lewat email ini begitu panitia menyetujuinya.",
  judul_ditolak: SALINAN_DITOLAK.judul,
  isi_ditolak: SALINAN_DITOLAK.isi,
};

/**
 * Templat bawaan sebuah acara. Dipakai selama panitia belum pernah menyimpan,
 * jadi acara lama langsung mendapat email yang lebih baik tanpa diatur.
 */
export function defaultTemplat(opsi: { punyaKv: boolean; memberOn: boolean }): Templat {
  return {
    v: 1,
    preset: opsi.punyaKv ? "banner" : "pita",
    font: "sans",
    subjek: "Tiket Anda: {acara}",
    subjek_menunggu: "Pendaftaran diterima: {acara}",
    subjek_ditolak: SALINAN_DITOLAK.subjek,
    kirim_ditolak: false,
    bahasa: "ikuti",
    kepala_url: null,
    logo_putih_url: null,
    blocks: [
      { id: "kepala", type: "kepala", on: true },
      { ...DEFAULT_PEMBUKA },
      { id: "tiket", type: "tiket", on: true },
      { id: "detail", type: "detail", on: true },
      opsi.memberOn
        ? { id: "tombol", type: "tombol", on: true, label: "Buka Dashboard saya", tujuan: "dashboard" }
        : { id: "tombol", type: "tombol", on: true, label: "Buka halaman acara", tujuan: "halaman" },
    ],
  };
}

/** Templat tersimpan bila sah, selain itu bawaan. Data lama yang rusak tidak boleh menghentikan email. */
export function readTemplat(raw: unknown, opsi: { punyaKv: boolean; memberOn: boolean }): Templat {
  const hasil = templatSchema.safeParse(raw);
  return hasil.success ? hasil.data : defaultTemplat(opsi);
}

/** Semua teks yang ditulis panitia, untuk memeriksa `{kolom}` yang tidak dikenal. */
export function teksPanitia(templat: Templat): string[] {
  const out = [templat.subjek, templat.subjek_menunggu, templat.subjek_ditolak];
  const en = templat.en ?? {};
  out.push(en.subjek ?? "", en.subjek_menunggu ?? "", en.subjek_ditolak ?? "");
  for (const block of templat.blocks) {
    if (block.type === "pembuka") {
      out.push(block.judul, block.isi, block.judul_menunggu, block.isi_menunggu, block.judul_ditolak, block.isi_ditolak);
      out.push(...Object.values(block.en ?? {}).map((nilai) => nilai ?? ""));
    }
    if (block.type === "teks") out.push(block.isi, block.en?.isi ?? "");
    if (block.type === "info") out.push(block.judul, block.isi, block.en?.judul ?? "", block.en?.isi ?? "");
  }
  return out;
}

const DIKENAL = new Set<string>(FIELDS.map((field) => field.key));

export function unknownFieldsIn(templat: Templat): string[] {
  const semua = teksPanitia(templat).join("\n");
  return [...new Set([...semua.matchAll(/\{([^{}\s]{1,30})\}/g)].map((cocok) => cocok[1]).filter((key) => !DIKENAL.has(key)))];
}
