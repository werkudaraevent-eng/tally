import { z } from "zod";
import { LANDING_CARD_ICON_POLA, LANDING_CARD_TONES } from "@/lib/landing-card-icons";
import { LANDING_ABOUT_CARDS, LANDING_ABOUT_MEDIA, LANDING_SPEAKER_FRAMES, LANDING_FORUM_ICON_KEYS, LANDING_IMAGE_ALT_MAX, LANDING_HEADING_FONT_KEYS, LANDING_BODY_FONTS, LANDING_CORNERS, LANDING_HEADING_SIZE, LANDING_HERO_HEIGHT_PX, LANDING_NAV_HEIGHT_MAX, LANDING_NAV_HEIGHT_MIN, LANDING_NAV_LABEL_MAX, LANDING_SECTION_TEXT_MAX, EVENT_VENUE_MAX, landingBlockLimits, type LandingTextLimit } from "@/lib/domain";

const NADA_BAGIAN = z.enum(["light", "panel", "dark"]);

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
// Batas luar. Batas per jenis blok (lebih ketat) diperiksa di superRefine dengan
// landingBlockLimits, sumber yang sama dengan penghitung di CMS.
const teks = (max: number) => z.string().trim().max(max).optional();

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
});
const blockSchema = z.object({
  id: blockId,
  type: z.enum(["text_image", "cards", "points", "gallery", "stats", "quote", "logos", "download", "cta", "multicolumn"]),
  tone: z.enum(["light", "panel", "dark"]).optional(),
  layout: z.enum(["featured", "overlay", "columns", "cards", "numbered", "list"]).optional(),
  eyebrow: teks(60),
  heading: teks(160),
  body: teks(1200),
  image_url: z.string().url().max(600).nullable().optional(),
  image_side: z.enum(["left", "right"]).optional(),
  items: z.array(z.object({
    image_url: z.string().url().max(600).nullable().optional(),
    label: teks(160),
    title: teks(160),
    body: teks(400),
    value: teks(30),
    href: tautan.optional(),
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
  en: blockEnSchema.optional(),
}).superRefine((block, ctx) => {
  const batas = landingBlockLimits(block);
  const periksa = (nilai: string | undefined, limit: LandingTextLimit | undefined, path: (string | number)[]) => {
    if (nilai && limit && nilai.length > limit.max) {
      ctx.addIssue({ code: "custom", path, message: `Maximum ${limit.max} characters` });
    }
  };
  (["eyebrow", "heading", "body", "link_label", "link2_label", "fact_title", "fact_body", "source", "quote", "name", "role"] as const).forEach((key) => {
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
const gambar = z.string().url().max(600).nullable().optional();
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
  gallery: z.array(z.string().url().max(600)).max(6).optional(),
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
  feedback_url: z.string().trim().url().max(600).nullable().optional(),
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
  photo_url: z.string().trim().max(600).regex(/^(https?:\/\/[^\s"'<>]+|\/(?!\/)[^\s"'<>]*)$/, "Photos must be an https:// address").nullable().optional(),
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
  venue_map_url: z.string().url().max(600).nullable(),

  // ---- Konten halaman -----------------------------------------------------
  landing: z.object({
    banner_url: z.string().url().max(600).nullable().optional(),
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
      logo_url: z.string().url().max(600).nullable().optional(),
    }).optional(),
    about_heading: z.string().trim().max(160).optional(),
    about_media: z.enum(LANDING_ABOUT_MEDIA).optional(),
    speaker_frame: z.enum(LANDING_SPEAKER_FRAMES).optional(),
    about_image_url: z.string().url().max(600).nullable().optional(),
    about_image_alt: teks(LANDING_IMAGE_ALT_MAX),
    about_cards: z.array(z.object({
      title: z.string().trim().max(LANDING_ABOUT_CARDS.title),
      body: z.string().trim().max(LANDING_ABOUT_CARDS.body),
      icon: z.string().regex(LANDING_CARD_ICON_POLA).optional(),
      tone: z.enum(LANDING_CARD_TONES).optional(),
      // Hanya https (QA #115 L1): gambar dari unggahan CMS selalu https.
      icon_url: z.string().trim().max(600).regex(/^https:\/\/[^\s"'<>]+$/, "Icon images must be an https:// address").nullable().optional(),
    })).max(LANDING_ABOUT_CARDS.max).optional(),
    program_heading: z.string().trim().max(120).optional(),
    program_intro: z.string().trim().max(400).optional(),
    program_notes: z.array(z.string().trim().max(600)).max(10).optional(),
    program_hidden: z.boolean().optional(),
    agenda_note: z.string().trim().max(140).optional(),
    ...JUDUL_BAGIAN,
    eyebrow_shown: z.object({ about: z.boolean(), agenda: z.boolean(), speakers: z.boolean(), venue: z.boolean(), faq: z.boolean() }).partial().optional(),
    section_tone: z.object({ about: NADA_BAGIAN, agenda: NADA_BAGIAN, speakers: NADA_BAGIAN, venue: NADA_BAGIAN, faq: NADA_BAGIAN }).partial().optional(),
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
    hero_logo_url: z.string().url().max(600).nullable().optional(),
    accent: warna,
    button_color: warna,
    hero_note: teks(240),
    hero_eyebrow: teks(60),
    portal_preview: z.boolean().optional(),
    portal_section: z.boolean().optional(),
    hero_bg_url: z.string().url().max(600).nullable().optional(),
    hero_bg_on: z.boolean().optional(),
    hero_bg_opacity: z.number().int().min(5).max(50).optional(),
    hero_bg_color: warna,
    hero_bg_terang: z.string().regex(/^#[0-9a-fA-F]{8}$/).optional(),
    hero_bg_terang_src: z.string().url().max(600).optional(),
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
      en: z.object({ q: teks(200), a: teks(2000) }).optional(),
    })).max(20).optional(),
    contact_name: z.string().trim().max(120).optional(),
    contact_phone: z.string().trim().max(40).optional(),
    contact_email: z.string().trim().max(160).optional(),
    sponsors: z.array(z.object({
      name: z.string().trim().max(120).optional(),
      logo_url: z.string().url().max(600),
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

