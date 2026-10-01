import { z } from "zod";
import { LANDING_FORUM_ICON_KEYS, LANDING_HEADING_FONT_KEYS, LANDING_HEADING_SIZE, LANDING_HERO_HEIGHT_PX, LANDING_NAV_HEIGHT_MAX, LANDING_NAV_HEIGHT_MIN, LANDING_NAV_LABEL_MAX, landingBlockLimits, type LandingTextLimit } from "@/lib/domain";

// Skema isi CMS Halaman acara. Dipakai PATCH /api/admin/landing saat menyimpan
// dan pratinjau langsung saat merender draf, supaya pratinjau menolak hal yang
// sama dengan yang ditolak saat Simpan.


// ---- Pustaka blok (lihat LandingBlock di domain.ts) ---------------------------
const MAX_BLOCKS = 30;
const blockId = z.string().regex(/^blk_[a-z0-9]{6,24}$/) as z.ZodType<`blk_${string}`>;
// Tautan opsional: kosong boleh, selain itu http(s) atau jangkar di halaman yang
// sama (#agenda). Bukan `z.string().url()` saja karena kolom yang dikosongkan
// admin terkirim sebagai "".
const tautan = z.string().trim().max(600).refine((value) => value === "" || /^(https?:\/\/\S+|#[A-Za-z][\w-]*)$/.test(value), "Tautan harus diawali http://, https://, atau # untuk bagian di halaman ini");
// Batas luar. Batas per jenis blok (lebih ketat) diperiksa di superRefine dengan
// landingBlockLimits, sumber yang sama dengan penghitung di CMS.
const teks = (max: number) => z.string().trim().max(max).optional();
const blockSchema = z.object({
  id: blockId,
  type: z.enum(["text_image", "cards", "points", "gallery", "stats", "quote", "logos", "download", "cta"]),
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
}).superRefine((block, ctx) => {
  const batas = landingBlockLimits(block);
  const periksa = (nilai: string | undefined, limit: LandingTextLimit | undefined, path: (string | number)[]) => {
    if (nilai && limit && nilai.length > limit.max) {
      ctx.addIssue({ code: "custom", path, message: `Maksimal ${limit.max} karakter` });
    }
  };
  (["eyebrow", "heading", "body", "link_label", "link2_label", "fact_title", "fact_body", "source", "quote", "name", "role"] as const).forEach((key) =>
    periksa(block[key], batas[key], [key]),
  );
  const items = block.items ?? [];
  if (items.length > (batas.items?.max ?? 0)) {
    ctx.addIssue({ code: "custom", path: ["items"], message: `Maksimal ${batas.items?.max ?? 0} butir` });
  }
  items.forEach((item, index) =>
    (["label", "title", "body", "value"] as const).forEach((key) => periksa(item[key], batas.item?.[key], ["items", index, key])),
  );
});

// ---- Tata letak Forum (lihat LandingForumConfig di domain.ts) ----------------
const gambar = z.string().url().max(600).nullable().optional();
const warna = z.string().regex(/^#[0-9a-fA-F]{6}$/).optional();
// Tautan penuh saja: tautan Forum keluar dari halaman (sosmed, situs tempat).
const tautanLuar = z.string().trim().max(600).refine((value) => value === "" || /^https?:\/\/\S+\.\S+/.test(value), "Tautan harus diawali http:// atau https://");
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
  venue_name: z.string().trim().max(200).nullable(),
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
    layout: z.enum(["editorial", "modern", "forum"]).optional(),
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
    program_heading: z.string().trim().max(120).optional(),
    program_intro: z.string().trim().max(400).optional(),
    program_notes: z.array(z.string().trim().max(600)).max(10).optional(),
    program_hidden: z.boolean().optional(),
    agenda_note: z.string().trim().max(140).optional(),
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
        ]),
        enabled: z.boolean(),
      }))
      .max(10 + MAX_BLOCKS),
    blocks: z.array(blockSchema).max(MAX_BLOCKS).optional(),
    highlights: z.array(z.object({
      label: z.string().trim().min(1).max(60),
      value: z.string().trim().min(1).max(30),
    })).max(8).optional(),
    speakers: z.array(z.object({
      name: z.string().trim().min(1).max(120),
      title: z.string().trim().max(200).optional(),
      company: z.string().trim().max(120).optional(),
      role: z.string().trim().max(60).optional(),
      photo_url: z.string().url().max(600).nullable().optional(),
      featured: z.boolean().optional(),
      session: z.string().trim().max(40).optional(),
    })).max(60).optional(),
    faq: z.array(z.object({
      q: z.string().trim().min(1).max(200),
      a: z.string().trim().min(1).max(2000),
    })).max(20).optional(),
    contact_name: z.string().trim().max(120).optional(),
    contact_phone: z.string().trim().max(40).optional(),
    contact_email: z.string().trim().max(160).optional(),
    sponsors: z.array(z.object({
      name: z.string().trim().max(120).optional(),
      logo_url: z.string().url().max(600),
    })).max(40).optional(),
    theme: z.object({ seed: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).optional(),
    member: z.object({
      enabled: z.boolean(),
      audience: z.enum(["approved", "all"]).optional(),
      show_code: z.boolean().optional(),
      show_seat: z.boolean().optional(),
      show_schedule: z.boolean().optional(),
      show_vote: z.boolean().optional(),
      feedback_url: z.string().trim().url().max(600).nullable().optional(),
    }).optional(),
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

