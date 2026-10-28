import { z } from "zod";
import { LANDING_CARD_ICON_POLA, LANDING_CARD_TONES } from "@/lib/landing-card-icons";
import { OUTFIT_LABEL_MAX } from "@/lib/outfit";
import { SASARAN_NILAI_MAX, SASARAN_NILAI_PANJANG } from "@/lib/sasaran-bagian";
import { TAUTAN_AGENDA_MAX } from "@/lib/sasaran-blok";
import { outfitSetiapHariSchema } from "@/lib/outfit-setiap-hari";
import { KOLOM_MASUK_POLA } from "@/lib/member/kolom-masuk";
import { KONTAK_DARURAT_BATAS, KONTAK_DARURAT_MAX } from "@/lib/member/kontak-darurat";
import { KONTAK_PANITIA_MAX, KONTAK_PERAN_MAX } from "@/lib/kontak-panitia";
import { LANDING_ABOUT_CARDS, LANDING_ABOUT_MEDIA, LANDING_SPEAKER_FRAMES, LANDING_FAQ_LAYOUTS, FAQ_GROUP_MAX, LANDING_AGENDA_SPEAKERS, LANDING_FORUM_ICON_KEYS, LANDING_IMAGE_ALT_MAX, LANDING_HEADING_FONT_KEYS, LANDING_BODY_FONTS, LANDING_CORNERS, LANDING_HEADING_SIZE, LANDING_HERO_HEIGHT_PX, LANDING_NAV_HEIGHT_MAX, LANDING_NAV_HEIGHT_MIN, LANDING_NAV_LABEL_MAX, LANDING_SECTION_TEXT_MAX, HORIZON_TEXT_MAX, EVENT_VENUE_MAX, LANDING_BLOCK_SHOW_ON, LANDING_ROUTE_MAPS_MODES, LANDING_ROUTE_STEPS_MAX, LANDING_ROUTE_STEP_TEXT_MAX, landingBlockLimits, type LandingTextLimit } from "@/lib/domain";

const NADA_BAGIAN = z.enum(["light", "panel", "dark"]);
const WARNA_BAGIAN = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// Skema isi CMS Halaman acara. Dipakai PATCH /api/admin/landing saat menyimpan
// dan pratinjau langsung saat merender draf, supaya pratinjau menolak hal yang
// sama dengan yang ditolak saat Simpan.


// ---- Pustaka blok (lihat LandingBlock di domain.ts) ---------------------------
const MAX_BLOCKS = 30;
const blockId = z.string().regex(/^blk_[a-z0-9]{6,24}$/) as z.ZodType<`blk_${string}`>;
// Tautan opsional: kosong boleh, selain itu http(s) atau jangkar di halaman yang
// sama (#agenda). Bukan `z.string().url()` saja karena kolom yang dikosongkan
// admin terkirim sebagai "".
const tautan = z.string().trim().max(600).refine((value) => value === "" || /^(https?:\/\/\S+|#[A-Za-z][\w-]*)$/.test(value), "Links must start with http://, https://, or # for a section on this page");
// Gambar blok: http(s) atau jalur di situs ini (/uploads/...), bukan javascript:,
// data:, atau ftp:. "//host" ditolak karena itu alamat situs lain. Alamat lama
// yang tidak lolos membuat Simpan acara itu menunjuk kolomnya; unggahan CMS
// selalu http(s), jadi itu hanya alamat yang diketik tangan.
const GAMBAR_KETAT = /^(https?:\/\/\S+|\/(?![/\\])\S*)$/i;
const PESAN_GAMBAR = "Images must be an http(s) address or a path on this site";
/** Alamat penuh http(s) saja: `z.string().url()` sendiri juga menerima javascript: dan data:. */
const GAMBAR_HTTP = /^https?:\/\/\S+$/i;
const gambarPenuh = z.string().url().max(600).refine((value) => GAMBAR_HTTP.test(value), PESAN_GAMBAR);
const gambarUrl = z.string().max(600).refine((value) => GAMBAR_KETAT.test(value), PESAN_GAMBAR).nullable().optional();
// Batas luar. Batas per jenis blok (lebih ketat) diperiksa di superRefine dengan
// landingBlockLimits, sumber yang sama dengan penghitung di CMS.
const teks = (max: number) => z.string().trim().max(max).optional();
/** Teks Gathering Horizon yang bisa disunting, sama di kolom dasar dan `en`. */
const TEKS_HORIZON = Object.fromEntries(Object.entries(HORIZON_TEXT_MAX).map(([kunci, max]) => [kunci, teks(max)])) as Record<keyof typeof HORIZON_TEXT_MAX, ReturnType<typeof teks>>;

const { eyebrow: ALIS_MAX, heading: JUDUL_MAX, intro: PENGANTAR_MAX } = LANDING_SECTION_TEXT_MAX;
/** Judul bagian bawaan; bentuk yang sama di Indonesia dan di `en`. */
const JUDUL_BAGIAN = {
  about_eyebrow: teks(ALIS_MAX),
  agenda_eyebrow: teks(ALIS_MAX),
  speakers_eyebrow: teks(ALIS_MAX),
  venue_eyebrow: teks(ALIS_MAX),
  faq_eyebrow: teks(ALIS_MAX),
  agenda_heading: teks(JUDUL_MAX),
  speakers_heading: teks(JUDUL_MAX),
  venue_heading: teks(JUDUL_MAX),
  faq_heading: teks(JUDUL_MAX),
  faq_intro: teks(PENGANTAR_MAX),
};

// Teks English disimpan di `en` di samping teks Indonesianya (LandingConfigEn
// dan kawan-kawan di domain.ts), dengan batas yang sama. Tanpa skema ini Zod
// membuang kunci `en` saat Simpan.
const itemEnSchema = z.object({ label: teks(160), title: teks(160), body: teks(400), value: teks(30) });
const blockEnSchema = z.object({
  eyebrow: teks(60),
  heading: teks(160),
  body: teks(1200),
  link_label: teks(60),
  link2_label: teks(60),
  fact_title: teks(60),
  fact_body: teks(120),
  source: teks(300),
  quote: teks(600),
  name: teks(120),
  role: teks(160),
  nav_label: teks(LANDING_NAV_LABEL_MAX),
  countdown_from: teks(40),
  countdown_to: teks(60),
  do_label: teks(24),
  dont_label: teks(24),
});
// Hanya https (QA #115 L1): gambar ikon dari unggahan CMS selalu https.
const ikonUrl = z.string().trim().max(600).regex(/^https:\/\/[^\s"'<>]+$/, "Icon images must be an https:// address").nullable().optional();
const routeStop = z.object({ hotel_id: z.number().int().positive().optional(), name: teks(120), address: teks(300) });
const blockSchema = z.object({
  id: blockId,
  type: z.enum(["text_image", "cards", "points", "gallery", "stats", "quote", "logos", "download", "cta", "multicolumn", "route", "countdown", "dos_donts"]),
  show_on: z.enum(LANDING_BLOCK_SHOW_ON).optional(),
  route_from: routeStop.optional(),
  route_to: routeStop.optional(),
  maps_mode: z.enum(LANDING_ROUTE_MAPS_MODES).optional(),
  maps_button: z.literal(false).optional(),
  map_image_url: gambarUrl,
  // Kolom pertanyaan (a-z0-9_) atau Hotel dari Logistics; lihat src/lib/sasaran-blok.ts.
  audience: z.object({
    field: z.string().regex(/^(@hotel|[a-z0-9_]{1,64})$/),
    values: z.array(z.string().trim().min(1).max(SASARAN_NILAI_PANJANG)).min(1).max(SASARAN_NILAI_MAX),
  }).refine((isi) => isi.field !== "@hotel" || isi.values.every((nilai) => /^[1-9]\d{0,17}$/.test(nilai)), "Hotel groups use hotel ids").optional(),
  agenda_item_ids: z.array(z.number().int().positive()).max(TAUTAN_AGENDA_MAX).optional(),
  tone: z.enum(["light", "panel", "dark"]).optional(),
  layout: z.enum(["featured", "overlay", "columns", "cards", "numbered", "list", "numbers", "board", "ticket", "strip", "photo", "journey", "tiles"]).optional(),
  eyebrow: teks(60),
  heading: teks(160),
  body: teks(1200),
  // Alamat http(s) atau jalur di situs ini (/uploads/...); skema lain ditolak.
  image_url: z.string().max(600).refine((value) => GAMBAR_KETAT.test(value), PESAN_GAMBAR).nullable().optional(),
  image_side: z.enum(["left", "right"]).optional(),
  items: z.array(z.object({
    image_url: gambarPenuh.nullable().optional(),
    label: teks(160),
    title: teks(160),
    body: teks(400),
    value: teks(30),
    href: tautan.optional(),
    icon: z.string().regex(LANDING_CARD_ICON_POLA).optional(),
    tone: z.enum(LANDING_CARD_TONES).optional(),
    icon_url: ikonUrl,
    steps: z.array(z.object({
      text: teks(LANDING_ROUTE_STEP_TEXT_MAX),
      image_url: gambarPenuh.nullable().optional(),
      en: z.object({ text: teks(LANDING_ROUTE_STEP_TEXT_MAX) }).optional(),
    })).max(LANDING_ROUTE_STEPS_MAX).optional(),
    kind: z.enum(["do", "dont"]).optional(),
    en: itemEnSchema.optional(),
  })).max(16).optional(),
  quote: teks(600),
  name: teks(120),
  role: teks(160),
  link_url: tautan.optional(),
  link_label: teks(60),
  link2_url: tautan.optional(),
  link2_label: teks(60),
  fact_title: teks(60),
  fact_body: teks(120),
  source: teks(300),
  nav_label: teks(LANDING_NAV_LABEL_MAX),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  image_shape: z.enum(["wide", "square", "circle"]).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  countdown_from: teks(40),
  countdown_to: teks(60),
  do_label: teks(24),
  dont_label: teks(24),
  icon: z.string().regex(/^[A-Za-z0-9]{1,48}$/).optional(),
  icon_url: gambarUrl,
  highlight: z.union([z.enum(["brand", "accent", "ink"]), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).optional(),
  bg_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  seconds: z.boolean().optional(),
  en: blockEnSchema.optional(),
}).superRefine((block, ctx) => {
  const batas = landingBlockLimits(block);
  const periksa = (nilai: string | undefined, limit: LandingTextLimit | undefined, path: (string | number)[]) => {
    if (nilai && limit && nilai.length > limit.max) {
      ctx.addIssue({ code: "custom", path, message: `Maximum ${limit.max} characters` });
    }
  };
  (["eyebrow", "heading", "body", "link_label", "link2_label", "fact_title", "fact_body", "source", "quote", "name", "role", "countdown_from", "countdown_to", "do_label", "dont_label"] as const).forEach((key) => {
    periksa(block[key], batas[key], [key]);
    periksa(block.en?.[key], batas[key], ["en", key]);
  });
  if (block.align === "right" && block.type !== "logos") {
    ctx.addIssue({ code: "custom", path: ["align"], message: "Right alignment is only for Logos" });
  }
  const items = block.items ?? [];
  if (items.length > (batas.items?.max ?? 0)) {
    ctx.addIssue({ code: "custom", path: ["items"], message: `Maximum ${batas.items?.max ?? 0} items` });
  }
  items.forEach((item, index) =>
    (["label", "title", "body", "value"] as const).forEach((key) => {
      periksa(item[key], batas.item?.[key], ["items", index, key]);
      periksa(item.en?.[key], batas.item?.[key], ["items", index, "en", key]);
    }),
  );
});

// ---- Tata letak Forum (lihat LandingForumConfig di domain.ts) ----------------
const gambar = gambarPenuh.nullable().optional();
const warna = z.string().regex(/^#[0-9a-fA-F]{6}$/).optional();
// Tautan penuh saja: tautan Forum keluar dari halaman (sosmed, situs tempat).
const tautanLuar = z.string().trim().max(600).refine((value) => value === "" || /^https?:\/\/\S+\.\S+/.test(value), "Links must start with http:// or https://");
const forumSchema = z.object({
  language: z.enum(["id", "en"]).optional(),
  accent: warna,
  secondary: warna,
  logo_light_url: gambar,
  hero_badge: teks(60),
  date_banner_url: gambar,
  date_banner_text: teks(90),
  about_image_url: gambar,
  program_banner_url: gambar,
  program_subtitle: teks(160),
  highlights: z.array(z.object({
    title: z.string().trim().max(60),
    body: teks(1500),
    image_url: gambar,
    link: z.enum(["program", "info", "daftar", "url"]).optional(),
    link_url: tautanLuar.optional(),
    link_label: teks(40),
  })).max(4).optional(),
  venue_note: teks(1200),
  venue_image_url: gambar,
  gallery: z.array(gambarPenuh).max(6).optional(),
  dresscode_intro: teks(400),
  dresscode: z.array(z.object({
    title: z.string().trim().max(40),
    body: teks(400),
    image_url: gambar,
  })).max(6).optional(),
  info_title: teks(60),
  info_intro: teks(400),
  info: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
    title: z.string().trim().max(40),
    icon: z.enum(LANDING_FORUM_ICON_KEYS).optional(),
    image_url: gambar,
    items: z.array(z.object({ heading: teks(120), body: z.string().trim().max(2000) })).max(20),
  })).max(9).optional(),
  footer_logo_url: gambar,
  socials: z.object({
    facebook: tautanLuar.optional(),
    x: tautanLuar.optional(),
    linkedin: tautanLuar.optional(),
    instagram: tautanLuar.optional(),
    youtube: tautanLuar.optional(),
    whatsapp: tautanLuar.optional(),
  }).optional(),
  footer_links: z.array(z.object({ label: z.string().trim().max(40), url: tautanLuar })).max(8).optional(),
  hidden: z.array(z.enum(["tanggal", "about", "program", "speakers", "sorotan", "info", "venue", "galeri", "dresscode"])).max(9).optional(),
});

/**
 * Konten landing page publik.
 *
 * Dua jenis data disimpan sekaligus lewat satu permintaan, dan pemisahannya
 * dijaga di sini:
 *
 *   * FAKTA ACARA (jam, venue, tagline) menjadi kolom. Email konfirmasi,
 *     rundown, dan berkas kalender membacanya juga — kalau ditanam di dalam
 *     jsonb, ketiganya tidak punya cara membacanya.
 *   * KONTEN HALAMAN (banner, urutan bagian, FAQ) menjadi satu jsonb. Hanya
 *     landing page yang peduli.
 *
 * Satu permintaan, bukan dua, karena admin menyuntingnya di satu layar dan
 * menekan satu tombol Simpan. Dua permintaan berarti separuh perubahan bisa
 * tersimpan saat jaringan putus di tengah.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Setelan area peserta (`landing_config.member`), disimpan di /admin/area-peserta. */
const idBeranda = z.union([z.enum(["quick", "announcements", "next", "checkpoints", "logistics", "roommates", "agenda", "outfit", "help"]), blockId]);

export const memberSchema = z.object({
  enabled: z.boolean(),
  audience: z.enum(["approved", "all"]).optional(),
  show_code: z.boolean().optional(),
  show_seat: z.boolean().optional(),
  show_schedule: z.boolean().optional(),
  show_vote: z.boolean().optional(),
  /** Kamar, bus, dan barang dari Logistik di Dashboard saya. Bawaan mati. */
  show_logistics: z.boolean().optional(),
  /** Dibaca member_logistics di database; bawaan tampil. */
  show_roommates: z.boolean().optional(),
  /** Plat nomor dan kontak kru bus peserta (Logistics > Buses). Bawaan mati. */
  show_bus_plate: z.boolean().optional(),
  show_bus_crew: z.boolean().optional(),
  /** Email Sign-in link ke walk-in baru. Bawaan mati. */
  walkin_link: z.boolean().optional(),
  /** Cara masuk peserta. Kosong = email + kata sandi. */
  sign_in: z.enum(["password", "email_code", "fields"]).optional(),
  /** Dua kolom berbeda untuk `sign_in: "fields"` (lib/member/kolom-masuk.ts). */
  sign_in_fields: z
    .tuple([z.string().regex(KOLOM_MASUK_POLA), z.string().regex(KOLOM_MASUK_POLA)])
    .refine(([a, b]) => a !== b, "Choose two different fields")
    .nullable()
    .optional(),
  feedback_url: z.string().trim().url().max(600).nullable().optional(),
  /** Beranda halaman peserta: id bawaan (MEMBER_HOME_BUILTINS) atau id blok. */
  home: z.object({ order: z.array(idBeranda).max(MAX_BLOCKS + 10).optional(), hidden: z.array(idBeranda).max(MAX_BLOCKS + 10).optional() }).optional(),
  /**
   * Label halaman Outfit portal Horizon. Kosong = bawaan "Outfit" (disimpan null).
   * Tidak dikirim = tidak diubah: transform mengembalikan undefined, jadi
   * kuncinya tidak muncul di hasil parse dan gabungan `member` mempertahankannya.
   */
  outfit_label: z
    .string()
    .trim()
    .max(OUTFIT_LABEL_MAX)
    .nullish()
    .transform((nilai) => (nilai === undefined ? undefined : nilai || null)),
  /** Dresscode Setiap hari portal Horizon. Tidak dikirim = tidak diubah; kosong = tidak ada (disimpan null). */
  outfit_every_day: outfitSetiapHariSchema,
  /** Blok peserta yang tampil di Menu sebagai kartu darurat dan bantuan (portal Horizon). Kosong = tidak ada. */
  help_block: blockId.nullable().optional(),
  /**
   * Kontak darurat dan bantuan (E-03), diisi di Participant area > Emergency
   * and help. Ada isinya = dipakai menggantikan `help_block`.
   */
  help: z
    .object({
      title: z.string().trim().max(KONTAK_DARURAT_BATAS.title).nullish(),
      note: z.string().trim().max(KONTAK_DARURAT_BATAS.catatan).nullish(),
      contacts: z
        .array(
          z.object({
            name: z.string().trim().min(1, "Each contact needs a name or role").max(KONTAK_DARURAT_BATAS.name),
            phone: z.string().trim().max(KONTAK_DARURAT_BATAS.phone).nullish(),
            note: z.string().trim().max(KONTAK_DARURAT_BATAS.note).nullish(),
            map_url: z.string().trim().max(KONTAK_DARURAT_BATAS.map_url).regex(/^(https?:\/\/[^\s"'<>\\]+)?$/i, "Map links must start with http:// or https://").nullish(),
            en: z.object({ name: z.string().trim().max(KONTAK_DARURAT_BATAS.name).nullish(), note: z.string().trim().max(KONTAK_DARURAT_BATAS.note).nullish() }).nullish(),
          }),
        )
        .max(KONTAK_DARURAT_MAX),
      /** Teks English (halaman /en), aturan yang sama dengan blok halaman acara. */
      en: z.object({ title: z.string().trim().max(KONTAK_DARURAT_BATAS.title).nullish(), note: z.string().trim().max(KONTAK_DARURAT_BATAS.catatan).nullish() }).nullish(),
    })
    .nullable()
    .optional(),
});

/** Satu pembicara (`landing_config.speakers[]`), disimpan di halaman Speakers. */
export const speakerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().max(200).optional(),
  company: z.string().trim().max(120).optional(),
  role: z.string().trim().max(60).optional(),
  // http(s) atau jalur di situs ini. `javascript:` dan `data:` ditolak. http
  // tetap diterima: setiap simpan mengirim seluruh daftar, jadi satu foto lama
  // http tidak boleh membuat semua pembicara gagal disimpan.
  // Garis miring terbalik ditolak di mana pun: peramban membaca "/\host" sebagai "//host".
  photo_url: z.string().trim().max(600).regex(/^(https?:\/\/[^\s"'<>\\]+|\/(?![/\\])[^\s"'<>\\]*)$/i, "Photos must be an http:// or https:// address, or a path on this site").nullable().optional(),
  featured: z.boolean().optional(),
  session_refs: z.array(z.object({
    id: z.number().int().positive(),
    label: z.string().trim().max(80),
    // Peran di sesi ini saja; batasnya sama dengan `role` pembicara.
    role: z.string().trim().max(60).optional(),
    en: z.object({ role: teks(60) }).optional(),
    pos: z.number().int().min(0).max(99).optional(),
  })).max(40).optional(),
  session: z.string().trim().max(40).optional(),
  en: z.object({ title: teks(200), company: teks(120), role: teks(60), session: teks(40) }).optional(),
});

/** Batas jumlah pembicara per acara. */
export const SPEAKERS_MAX = 60;

/**
 * Batas badan PATCH /api/admin/speakers dalam byte. Satu pembicara dengan
 * semua kolom penuh dan 40 sesi sekitar 12 KB; `base` dan `speakers` masing-
 * masing paling banyak 60 orang. Isi `base` tidak divalidasi per kolom (itu
 * salinan data tersimpan, apa adanya), jadi ukurannya dibatasi di sini.
 */
export const SPEAKERS_BODY_MAX = 1_500_000;

/**
 * Badan PATCH /api/admin/speakers. `base`: daftar pembicara seperti yang
 * terakhir dibaca layar itu dari server, apa adanya. Server menolak (409) bila
 * daftar tersimpan sudah berbeda, jadi dua tab tidak saling menimpa.
 */
export const speakersBodySchema = z.object({
  base: z.array(z.unknown()).max(SPEAKERS_MAX),
  speakers: z.array(speakerSchema).max(SPEAKERS_MAX),
});

export const landingBodySchema = z.object({
  // ---- Fakta acara --------------------------------------------------------
  // 5000, bukan 500 seperti di form pembuatan acara. Batas di sana untuk
  // ringkasan sebaris saat mendaftarkan acara; bagian "Tentang acara" di
  // halaman publik adalah beberapa paragraf, dan 500 karakter memotongnya di
  // tengah kalimat.
  description: z.string().trim().max(5000).nullable(),
  tagline: z.string().trim().max(200).nullable(),
  start_time: z.string().regex(HHMM).nullable(),
  end_time: z.string().regex(HHMM).nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  venue_name: z.string().trim().max(EVENT_VENUE_MAX).nullable(),
  venue_address: z.string().trim().max(600).nullable(),
  venue_map_url: z.string().url().max(600).refine((value) => GAMBAR_HTTP.test(value), "Map links must start with http:// or https://").nullable(),

  // ---- Konten halaman -----------------------------------------------------
  landing: z.object({
    banner_url: gambarPenuh.nullable().optional(),
    banner_style: z.enum(["theme", "photo"]).optional(),
    hero_height: z.enum(["compact", "standard", "tall"]).optional(),
    hero_min_height: z.number().int().min(LANDING_HERO_HEIGHT_PX.min).max(LANDING_HERO_HEIGHT_PX.max).optional(),
    cta_label: z.string().trim().max(60).optional(),
    heading_font: z.enum(LANDING_HEADING_FONT_KEYS).optional(),
    body_font: z.enum(LANDING_BODY_FONTS).optional(),
    corners: z.enum(LANDING_CORNERS).optional(),
    hero_align: z.enum(["left", "center"]).optional(),
    hero_position: z.enum(["bottom", "middle"]).optional(),
    layout: z.enum(["editorial", "modern", "forum"]).optional(),
    tayang: z.enum(["halaman", "formulir"]).optional(),
    forum: forumSchema.optional(),
    public_name: z.string().trim().max(120).optional(),
    nav: z.object({
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      opacity: z.number().int().min(0).max(100).optional(),
      width: z.enum(["full", "content"]).optional(),
      height: z.number().int().min(LANDING_NAV_HEIGHT_MIN).max(LANDING_NAV_HEIGHT_MAX).optional(),
      logo_url: gambarPenuh.nullable().optional(),
      logo_on_image: z.enum(["white", "original"]).optional(),
    }).optional(),
    about_heading: z.string().trim().max(160).optional(),
    about_media: z.enum(LANDING_ABOUT_MEDIA).optional(),
    speaker_frame: z.enum(LANDING_SPEAKER_FRAMES).optional(),
    agenda_speakers: z.enum(LANDING_AGENDA_SPEAKERS).optional(),
    about_image_url: gambarPenuh.nullable().optional(),
    about_image_alt: teks(LANDING_IMAGE_ALT_MAX),
    about_cards: z.array(z.object({
      title: z.string().trim().max(LANDING_ABOUT_CARDS.title),
      body: z.string().trim().max(LANDING_ABOUT_CARDS.body),
      icon: z.string().regex(LANDING_CARD_ICON_POLA).optional(),
      tone: z.enum(LANDING_CARD_TONES).optional(),
      icon_url: ikonUrl,
    })).max(LANDING_ABOUT_CARDS.max).optional(),
    program_heading: z.string().trim().max(120).optional(),
    program_intro: z.string().trim().max(400).optional(),
    program_notes: z.array(z.string().trim().max(600)).max(10).optional(),
    program_hidden: z.boolean().optional(),
    agenda_note: z.string().trim().max(140).optional(),
    ...JUDUL_BAGIAN,
    eyebrow_shown: z.object({ about: z.boolean(), agenda: z.boolean(), speakers: z.boolean(), venue: z.boolean(), faq: z.boolean() }).partial().optional(),
    section_tone: z.object({ about: NADA_BAGIAN, agenda: NADA_BAGIAN, speakers: NADA_BAGIAN, venue: NADA_BAGIAN, faq: NADA_BAGIAN }).partial().optional(),
    // Background › Custom per bagian; kosong = pilihan section_tone.
    section_bg_color: z.object({ about: WARNA_BAGIAN, agenda: WARNA_BAGIAN, speakers: WARNA_BAGIAN, venue: WARNA_BAGIAN, faq: WARNA_BAGIAN }).partial().optional(),
    footer_note: z.string().trim().max(180).optional(),
    cta_heading: z.string().trim().max(120).optional(),
    cta_note: z.string().trim().max(300).optional(),
    heading_scale: z.enum(["md", "lg", "xl"]).optional(),
    heading_size: z.number().int().min(LANDING_HEADING_SIZE.min).max(LANDING_HEADING_SIZE.max).optional(),
    sections: z
      .array(z.object({
        id: z.union([
          z.enum(["about", "highlights", "agenda", "speakers", "venue", "faq", "sponsors", "contact"]),
          blockId,
          // Tempat Portal peserta (gaya gathering), lihat susunanDenganPortal.
          z.literal("portal"),
        ]),
        enabled: z.boolean(),
      }))
      .max(11 + MAX_BLOCKS)
      .refine((daftar) => daftar.filter((section) => section.id === "portal").length <= 1, "Portal peserta appears more than once."),
    blocks: z.array(blockSchema).max(MAX_BLOCKS).optional(),
    en_enabled: z.boolean().optional(),
    invite_only: z.boolean().optional(),
    gathering: z.boolean().optional(),
    gathering_variant: z.enum(["horizon"]).optional(),
    pass_from: teks(40),
    pass_to: teks(40),
    ...TEKS_HORIZON,
    hero_logo_url: gambarPenuh.nullable().optional(),
    accent: warna,
    button_color: warna,
    hero_note: teks(240),
    hero_eyebrow: teks(60),
    portal_preview: z.boolean().optional(),
    portal_section: z.boolean().optional(),
    hero_bg_url: gambarPenuh.nullable().optional(),
    hero_bg_on: z.boolean().optional(),
    hero_bg_opacity: z.number().int().min(5).max(50).optional(),
    hero_bg_color: warna,
    hero_bg_terang: z.string().regex(/^#[0-9a-fA-F]{8}$/).optional(),
    hero_bg_terang_src: gambarPenuh.optional(),
    default_lang: z.enum(["id", "en"]).optional(),
    en: z.object({
      public_name: teks(120),
      cta_label: teks(60),
      about_heading: teks(160),
      about_image_alt: teks(LANDING_IMAGE_ALT_MAX),
      program_heading: teks(120),
      program_intro: teks(400),
      program_notes: z.array(z.string().trim().max(600)).max(10).optional(),
      about_cards: z
        .array(z.object({ title: z.string().trim().max(LANDING_ABOUT_CARDS.title).optional(), body: z.string().trim().max(LANDING_ABOUT_CARDS.body).optional() }))
        .max(LANDING_ABOUT_CARDS.max)
        .optional(),
      agenda_note: teks(140),
      ...JUDUL_BAGIAN,
      footer_note: teks(180),
      cta_heading: teks(120),
      cta_note: teks(300),
      hero_note: teks(240),
      hero_eyebrow: teks(60),
      ...TEKS_HORIZON,
      contact_name: teks(120),
      // Versi English kolom `events` (lihat LANDING_EVENT_EN_KEYS), batas sama dengan kolomnya.
      tagline: teks(200),
      description: teks(5000),
      venue_name: teks(200),
      venue_address: teks(600),
    }).optional(),
    highlights: z.array(z.object({
      label: z.string().trim().min(1).max(60),
      value: z.string().trim().min(1).max(30),
      en: z.object({ label: teks(60), value: teks(30) }).optional(),
    })).max(8).optional(),
    // `speakers` sengaja tidak ada: zod membuang kunci yang tidak dikenal tanpa
    // memeriksanya. Pembicara disimpan lewat /api/admin/speakers (halaman
    // Speakers); salinan dari tab Halaman acara yang terbuka sejak sebelum
    // halaman itu ada tidak boleh menimpanya.
    faq: z.array(z.object({
      q: z.string().trim().min(1).max(200),
      a: z.string().trim().min(1).max(2000),
      group: teks(FAQ_GROUP_MAX),
      en: z.object({ q: teks(200), a: teks(2000), group: teks(FAQ_GROUP_MAX) }).optional(),
    })).max(20).optional(),
    faq_layout: z.enum(LANDING_FAQ_LAYOUTS).optional(),
    // Kontak panitia diisi di Event settings (/api/admin/kontak); server
    // memakai yang tersimpan, bukan salinan editor ini (lihat PATCH /api/admin/landing).
    contact_name: z.string().trim().max(120).optional(),
    contact_phone: z.string().trim().max(40).optional(),
    contact_email: z.string().trim().max(160).optional(),
    sponsors: z.array(z.object({
      name: z.string().trim().max(120).optional(),
      logo_url: gambarPenuh,
      en: z.object({ name: teks(120) }).optional(),
    })).max(40).optional(),
    theme: z.object({ seed: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).optional(),
    // Tidak divalidasi dan diabaikan server: area peserta disimpan lewat
    // /api/admin/area-peserta (lihat PATCH /api/admin/landing). Salinan basi
    // dari klien lama tidak boleh menggagalkan Simpan halaman acara.
    member: z.unknown().optional(),
  }),

  // ---- Warna formulir pendaftaran -----------------------------------------
  // Disunting di layar ini, tetapi disimpan di kolom lain
  // (`registration_form_config.theme`) karena di sanalah seluruh konfigurasi
  // formulir tinggal. Yang disatukan adalah TEMPAT MENGATURNYA, bukan tempat
  // menyimpannya: kontrol warna yang tersebar di dua layar akan berbeda isinya,
  // dan tidak ada yang tahu mana yang menang.
  form_theme: z
    .object({
      /** true = formulir memakai warna halaman acara. */
      inherit: z.boolean(),
      seed: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    })
    .optional(),
});


/** Kontak panitia (Event settings). Kosong = tidak diisi. */
const emailKontak = z.union([z.literal(""), z.string().trim().toLowerCase().max(160).email("Contact email is not a valid email address.")]);
const teleponKontak = z.string().trim().max(40).regex(/^[0-9+()\-.\s]*$/, "Phone may only contain digits, spaces, + ( ) - and .");
/** Kontak kedua dan ketiga: nama boleh kosong, tetapi nomor atau email wajib ada. */
const kontakTambahanSchema = z
  .object({ name: z.string().trim().max(120), role: z.string().trim().max(KONTAK_PERAN_MAX).optional(), email: emailKontak, phone: teleponKontak })
  .refine((kontak) => kontak.email || kontak.phone, "Each extra contact needs a phone number or an email.");
const kontakSchema = z.object({
  contact_name: z.string().trim().max(120),
  contact_email: emailKontak,
  contact_phone: teleponKontak,
  // Opsional: tab Event settings lama tidak mengirimnya, dan yang tersimpan tetap.
  contact_role: z.string().trim().max(KONTAK_PERAN_MAX).optional(),
  contact_more: z.array(kontakTambahanSchema).max(KONTAK_PANITIA_MAX - 1).optional(),
});
export type KontakPanitia = z.infer<typeof kontakSchema>;
/** PATCH /api/admin/kontak: `base` = kontak seperti yang terakhir dibaca klien. */
// Kontak tambahan tanpa kontak utama: halaman daftar, undangan, dan dashboard
// hanya membaca yang utama, jadi mereka akan kosong.
export const kontakBodySchema = z.object({
  base: kontakSchema.partial(),
  contact: kontakSchema.refine(
    (kontak) => !(kontak.contact_more ?? []).length || Boolean(kontak.contact_email || kontak.contact_phone),
    "Fill in a phone number or email for the first contact before adding more.",
  ),
});
