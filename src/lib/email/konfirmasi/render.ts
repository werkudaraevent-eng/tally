import { mixHex } from "@/lib/color";
import { LANDING_HEADING_FONTS, type LandingHeadingFont } from "@/lib/domain";
import { FIELDS, type FieldKey } from "@/lib/pesan/bawaan";
import { escapeHtml, formatHtml, formatText } from "@/lib/pesan/format";
import { TEKS_TETAP, untukBahasa, type EmailLang } from "./bahasa";
import { DEFAULT_PEMBUKA, SALINAN_DITOLAK, type Block, type Font, type Templat } from "./templat";

export { escapeHtml };

/**
 * Penyusun HTML email Konfirmasi pendaftaran.
 *
 * Murni: tanpa impor server, dipakai pratinjau editor dan pengirim yang sama.
 *
 * Aturan email yang dipegang di sini (alasannya di rekomendasi rev 1):
 *   * Tabel dan gaya inline. Gmail membuang sebagian besar `<style>`, Outlook
 *     desktop merender lewat Word dan tidak mengenal flexbox/grid.
 *   * Tanpa gambar latar. Warna di belakang kepala ditulis sebagai `bgcolor`
 *     sehingga, saat gambar diblokir, yang tampil adalah pita warna acara dan
 *     teks alternatifnya.
 *   * Kode peserta selalu berupa TEKS besar. QR, logo, dan KV boleh hilang
 *     (Outlook kantor memblokir gambar); kodenya tidak.
 */

/** Disetujui (ber-QR), Menunggu persetujuan, atau Tidak disetujui. */
export type RenderState = "approved" | "pending" | "rejected";

export type RenderContext = {
  state: RenderState;
  /** Warna utama acara untuk tombol, label, dan tautan; sudah dijamin >= 4,5:1 terhadap putih. */
  brand: string;
  /** Warna teks di atas `brand`. */
  onBrand: string;
  eventName: string;
  /** Logo acara berwarna (Tema > bilah atas). */
  logoUrl: string | null;
  /** Logo terang untuk latar warna (Forum: logo_light_url). */
  logoPutihUrl: string | null;
  headingFont: LandingHeadingFont | null;
  values: Record<FieldKey, string>;
  /** Approved: kode dan sumber gambar QR (`cid:` di email, URL data di pratinjau). */
  qr: { code: string; src: string | null } | null;
  /** Halaman kode permanen, cadangan bila QR tidak tampil. */
  codeUrl: string | null;
  detail: {
    tanggal: string | null;
    waktu: string | null;
    tempat: string | null;
    alamat: string | null;
    petaUrl: string | null;
    kalenderUrl: string | null;
  };
  dashboardUrl: string | null;
  halamanUrl: string;
  mitra: { name: string; url: string }[];
  /**
   * Tautan konfirmasi akun Area peserta yang baru dibuat dari formulir. Bila
   * ada, kotak "Konfirmasi email akun" ikut di email ini, supaya pendaftar
   * tidak menerima dua email sekaligus saat mendaftar.
   */
  akunUrl?: string | null;
  /** Ada alamat Balas-ke (Pengaturan > Pengirim email). */
  bisaDibalas: boolean;
  test?: boolean;
  /** Bahasa email. Bawaan Indonesia; konteks (nama acara, tempat, tanggal) sudah disusun dalam bahasa yang sama. */
  lang?: EmailLang;
};

const teksTetap = (ctx: RenderContext) => TEKS_TETAP[ctx.lang ?? "id"];

export type RenderedEmail = { subject: string; html: string; text: string };

const INK = "#1F2328";
const MUTED = "#5F6368";
const RULE = "#E3E5E8";
const AMBER_BG = "#FFF7E0";
const AMBER_INK = "#7A4F00";

const GOOGLE_FONT: Partial<Record<LandingHeadingFont, string>> = {
  serif: "Playfair+Display:wght@400;700",
  geometric: "Montserrat:wght@400;700",
  condensed: "Oswald:wght@400;700",
  grotesk: "Space+Grotesk:wght@400;700",
  source: "Source+Sans+3:wght@400;700",
  ubuntu: "Ubuntu:wght@400;700",
  jakarta: "Plus+Jakarta+Sans:wght@400;700",
  fraunces: "Fraunces:wght@400;700",
  sourceserif: "Source+Serif+4:wght@400;700",
  archivo: "Archivo+Narrow:wght@400;700",
  nunito: "Nunito:wght@400;700",
};
const FONT_NAME: Record<LandingHeadingFont, string> = {
  serif: "'Playfair Display'",
  sans: "Inter",
  geometric: "Montserrat",
  condensed: "Oswald",
  grotesk: "'Space Grotesk'",
  source: "'Source Sans 3'",
  ubuntu: "Ubuntu",
  jakarta: "'Plus Jakarta Sans'",
  fraunces: "Fraunces",
  sourceserif: "'Source Serif 4'",
  archivo: "'Archivo Narrow'",
  nunito: "Nunito",
};
const SANS = "Arial, Helvetica, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

function fontStacks(font: Font, heading: LandingHeadingFont | null) {
  if (font === "serif") return { body: SERIF, heading: SERIF, link: null };
  if (font === "tema" && heading) {
    const fallback = LANDING_HEADING_FONTS[heading].category === "Serif" ? SERIF : SANS;
    const stack = `${FONT_NAME[heading]}, ${fallback}`;
    const family = GOOGLE_FONT[heading];
    return { body: stack, heading: stack, link: family ? `https://fonts.googleapis.com/css2?family=${family}&display=swap` : null };
  }
  return { body: SANS, heading: SANS, link: null };
}

const FIELD_RE = new RegExp(`\\{(${FIELDS.map((field) => field.key).join("|")})\\}`, "g");

export function fill(template: string, values: Record<FieldKey, string>) {
  return template.replace(FIELD_RE, (_, key: FieldKey) => values[key]);
}

/** Teks panitia ke HTML. Kolom diisi di potongan teks SETELAH diurai: nama peserta adalah isian bebas. */
function richHtml(source: string, ctx: RenderContext, size = 16, firstMargin?: number) {
  return formatHtml(source, { fill: (teks) => fill(teks, ctx.values), linkColor: ctx.brand, color: INK, size, firstMargin });
}

function richText(source: string, values: Record<FieldKey, string>) {
  return formatText(source, (teks) => fill(teks, values));
}

function button(label: string, url: string, ctx: RenderContext, margin = 28) {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="margin:${margin}px 0 0;"><tr>` +
    `<td bgcolor="${ctx.brand}" align="center" style="background:${ctx.brand};border-radius:12px;">` +
    `<a href="${escapeHtml(url)}" style="display:block;padding:14px 28px;font-size:16px;line-height:20px;font-weight:700;color:${ctx.onBrand};text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

function kepala(templat: Templat, ctx: RenderContext, fonts: { heading: string }) {
  const ink = ctx.onBrand;
  const nama = escapeHtml(ctx.eventName);
  if (templat.preset === "banner" && templat.kepala_url) {
    return (
      `<tr><td bgcolor="${ctx.brand}" align="center" style="background:${ctx.brand};color:${ink};font-family:${fonts.heading};font-size:20px;font-weight:700;line-height:26px;">` +
      `<img src="${escapeHtml(templat.kepala_url)}" width="600" height="200" alt="${nama}" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>`
    );
  }
  if (templat.preset === "polos") {
    const logo = ctx.logoUrl
      ? `<img src="${escapeHtml(ctx.logoUrl)}" height="40" alt="${nama}" style="display:block;height:40px;width:auto;border:0;font-size:16px;font-weight:700;color:${INK};">`
      : `<p style="margin:0;font-family:${fonts.heading};font-size:18px;font-weight:700;color:${INK};">${nama}</p>`;
    return `<tr><td style="padding:32px 40px 0;" class="px">${logo}<div style="margin-top:24px;height:3px;line-height:3px;font-size:0;width:48px;background:${ctx.brand};">&nbsp;</div></td></tr>`;
  }
  // Pita warna, juga cadangan Banner KV yang gambar kepalanya belum dibuat.
  const logoSrc = templat.logo_putih_url ?? ctx.logoPutihUrl ?? (ink === "#FFFFFF" ? null : ctx.logoUrl);
  const logo = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" height="36" alt="" style="display:block;height:36px;width:auto;border:0;margin:0 0 20px;">`
    : "";
  const sub = [ctx.detail.tanggal, ctx.detail.tempat].filter(Boolean).join(" · ");
  return (
    `<tr><td bgcolor="${ctx.brand}" style="background:${ctx.brand};padding:28px 40px 30px;" class="px">${logo}` +
    `<p style="margin:0;font-family:${fonts.heading};font-size:24px;line-height:30px;font-weight:700;color:${ink};">${nama}</p>` +
    (sub ? `<p style="margin:4px 0 0;font-size:15px;line-height:22px;color:${ink};opacity:.85;">${escapeHtml(sub)}</p>` : "") +
    `</td></tr>`
  );
}

function tiket(ctx: RenderContext, garisPutus: boolean) {
  const t = teksTetap(ctx);
  if (ctx.state === "pending" || !ctx.qr) {
    return (
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;"><tr>` +
      `<td bgcolor="${AMBER_BG}" style="background:${AMBER_BG};border-radius:12px;padding:20px 24px;">` +
      `<p style="margin:0;font-size:13px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${AMBER_INK};">${t.menungguJudul}</p>` +
      `<p style="margin:8px 0 0;font-size:15px;line-height:22px;color:${INK};">${t.menungguIsi}</p>` +
      `</td></tr></table>`
    );
  }
  const border = garisPutus ? `2px dashed ${RULE}` : `1px solid ${RULE}`;
  // Dua sel yang ditumpuk di ponsel (kelas .stack): QR 160px di atas kode.
  const qr = ctx.qr.src
    ? `<td width="164" class="stack" style="padding:20px 0 20px 20px;width:164px;vertical-align:middle;"><img src="${escapeHtml(ctx.qr.src)}" width="160" height="160" alt="${escapeHtml(t.qrAlt(ctx.qr.code))}" style="display:block;width:160px;height:160px;border:0;font-size:13px;color:${INK};"></td>`
    : "";
  // Tombol halaman kode permanen: lapis ketiga bila QR tidak tampil. Selalu ada, tidak bisa dimatikan.
  const cadangan = ctx.codeUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;"><tr><td style="border:1px solid ${ctx.brand};border-radius:10px;">` +
      `<a href="${escapeHtml(ctx.codeUrl)}" style="display:block;padding:12px 18px;font-size:15px;line-height:20px;font-weight:700;color:${ctx.brand};text-decoration:none;">${t.bukaKode}</a></td></tr></table>`
    : "";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;border:${border};border-radius:12px;border-collapse:separate;"><tr>` +
    qr +
    `<td class="stack" style="padding:20px;vertical-align:middle;">` +
    `<p style="margin:0;font-size:13px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${t.kodePeserta}</p>` +
    `<p style="margin:6px 0 0;font-family:Consolas,Menlo,'Courier New',monospace;font-size:24px;line-height:30px;font-weight:700;letter-spacing:.06em;color:${INK};white-space:nowrap;">${escapeHtml(ctx.qr.code)}</p>` +
    `<p style="margin:8px 0 0;font-size:14px;line-height:20px;color:${MUTED};">${t.tunjukkan}</p>` +
    cadangan +
    `</td></tr></table>`
  );
}

function detail(ctx: RenderContext) {
  const d = ctx.detail;
  const t = teksTetap(ctx);
  const baris: [string, string][] = [];
  if (d.tanggal) baris.push([t.tanggal, d.tanggal]);
  if (d.waktu) baris.push([t.waktu, d.waktu]);
  if (d.tempat || d.alamat) baris.push([t.tempat, [d.tempat, d.alamat].filter(Boolean).join(", ")]);
  if (!baris.length) return "";
  const rows = baris
    .map(
      ([label, nilai]) =>
        `<tr><td width="84" style="padding:10px 12px 10px 0;border-top:1px solid ${RULE};width:84px;font-size:13px;line-height:22px;color:${MUTED};vertical-align:top;">${label}</td>` +
        `<td style="padding:10px 0;border-top:1px solid ${RULE};font-size:15px;line-height:22px;color:${INK};">${escapeHtml(nilai)}</td></tr>`,
    )
    .join("");
  const tautan = [
    d.kalenderUrl ? `<a href="${escapeHtml(d.kalenderUrl)}" class="tap" style="display:inline-block;padding:12px 0;color:${ctx.brand};font-weight:700;text-decoration:underline;">${t.kalender}</a>` : "",
    d.petaUrl ? `<a href="${escapeHtml(d.petaUrl)}" class="tap" style="display:inline-block;padding:12px 0;color:${ctx.brand};font-weight:700;text-decoration:underline;">${t.peta}</a>` : "",
  ].filter(Boolean);
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;border-collapse:collapse;">${rows}</table>` +
    (tautan.length ? `<p style="margin:0;font-size:15px;line-height:20px;">${tautan.join(`<span class="dot" style="color:${MUTED};padding:0 8px;">&middot;</span>`)}</p>` : "")
  );
}

/** Garis sebagai border sel, bukan <hr>: Outlook menggambar <hr> dengan tebal dan warnanya sendiri. */
function garis() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;"><tr><td style="border-top:1px solid ${RULE};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`;
}

type Pembuka = Extract<Block, { type: "pembuka" }>;

/** Judul dan sapaan untuk keadaan ini. Judul yang dikosongkan diisi bawaan: email tanpa judul terbaca seperti email rusak. */
function salinan(block: Pembuka, state: RenderState, ctx: RenderContext): { eyebrow: string; judul: string; isi: string } {
  const t = teksTetap(ctx);
  if (state === "pending") return { eyebrow: t.eyebrow.pending, judul: block.judul_menunggu.trim() || DEFAULT_PEMBUKA.judul_menunggu, isi: block.isi_menunggu };
  if (state === "rejected") return { eyebrow: t.eyebrow.rejected, judul: block.judul_ditolak.trim() || SALINAN_DITOLAK.judul, isi: block.isi_ditolak };
  return { eyebrow: t.eyebrow.approved, judul: block.judul.trim() || DEFAULT_PEMBUKA.judul, isi: block.isi };
}

function kotakAkun(url: string, ctx: RenderContext) {
  const t = teksTetap(ctx);
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;border:1px solid ${RULE};border-radius:12px;border-collapse:separate;"><tr>` +
    `<td style="padding:20px 24px;">` +
    `<p style="margin:0;font-size:13px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${t.akunJudul}</p>` +
    `<p style="margin:8px 0 0;font-size:15px;line-height:22px;color:${INK};">${t.akunIsi}</p>` +
    // Tombol bergaris, bukan isi warna: tombol utama email tetap milik panitia (blok Tombol).
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;"><tr><td style="border:1px solid ${ctx.brand};border-radius:10px;">` +
    `<a href="${escapeHtml(url)}" style="display:block;padding:12px 18px;font-size:15px;line-height:20px;font-weight:700;color:${ctx.brand};text-decoration:none;">${t.akunTombol}</a></td></tr></table>` +
    `</td></tr></table>`
  );
}

/** Email Tidak disetujui hanya membawa kepala dan pembuka: Tiket, detail, dan tombol acara tidak berlaku lagi untuk penerimanya. */
function tampil(block: Block, state: RenderState) {
  return block.on && (state !== "rejected" || block.type === "pembuka");
}

function blockHtml(block: Block, templat: Templat, ctx: RenderContext, fonts: { heading: string }): string {
  if (!tampil(block, ctx.state)) return "";
  switch (block.type) {
    case "kepala":
      return "";
    case "pembuka": {
      const teks = salinan(block, ctx.state, ctx);
      const judul = fill(teks.judul, ctx.values);
      return (
        `<p style="margin:0;font-size:13px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${ctx.brand};">${teks.eyebrow}</p>` +
        (judul ? `<h1 style="margin:8px 0 0;font-family:${fonts.heading};font-size:26px;line-height:32px;font-weight:700;color:${INK};">${escapeHtml(judul)}</h1>` : "") +
        richHtml(teks.isi, ctx, 16, 16)
      );
    }
    case "tiket":
      // Kotak akun SESUDAH tiket: QR tetap hal pertama yang dilihat, konfirmasi akun menyusul.
      return tiket(ctx, templat.preset === "pita") + (ctx.akunUrl ? kotakAkun(ctx.akunUrl, ctx) : "");
    case "detail":
      return detail(ctx);
    case "teks":
      return `<div style="margin:12px 0 0;">${richHtml(block.isi, ctx)}</div>`;
    case "gambar": {
      if (!block.url) return "";
      const img = `<img src="${escapeHtml(block.url)}" width="520"${block.lebar && block.tinggi ? ` height="${Math.round((520 * block.tinggi) / block.lebar)}"` : ""} alt="${escapeHtml(block.alt)}" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:8px;font-size:14px;color:${MUTED};">`;
      return `<div style="margin:24px 0 0;">${block.href ? `<a href="${escapeHtml(block.href)}">${img}</a>` : img}</div>`;
    }
    case "tombol": {
      const url = block.tujuan === "url" ? block.url : block.tujuan === "dashboard" ? ctx.dashboardUrl ?? ctx.halamanUrl : ctx.halamanUrl;
      return url ? button(block.label, url, ctx) : "";
    }
    case "info": {
      const latar = mixHex(ctx.brand, "#FFFFFF", 0.9);
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;"><tr>` +
        `<td width="4" bgcolor="${ctx.brand}" style="width:4px;background:${ctx.brand};border-radius:4px 0 0 4px;font-size:0;">&nbsp;</td>` +
        `<td bgcolor="${latar}" style="background:${latar};padding:16px 20px;border-radius:0 8px 8px 0;">` +
        (block.judul ? `<p style="margin:0;font-size:15px;line-height:22px;font-weight:700;color:${INK};">${escapeHtml(fill(block.judul, ctx.values))}</p>` : "") +
        richHtml(block.isi, ctx, 15, block.judul ? 6 : 0) +
        `</td></tr></table>`
      );
    }
    case "mitra": {
      if (!ctx.mitra.length) return "";
      const sel = ctx.mitra
        .slice(0, 8)
        .map((logo) => `<td style="padding:0 16px 12px 0;vertical-align:middle;"><img src="${escapeHtml(logo.url)}" height="40" alt="${escapeHtml(logo.name || teksTetap(ctx).logoMitra)}" style="display:block;height:40px;width:auto;max-width:140px;border:0;font-size:12px;color:${MUTED};"></td>`);
      const baris: string[] = [];
      for (let i = 0; i < sel.length; i += 4) baris.push(`<tr>${sel.slice(i, i + 4).join("")}</tr>`);
      return (
        garis() +
        (block.judul ? `<p style="margin:20px 0 12px;font-size:13px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(block.judul)}</p>` : `<div style="height:20px;"></div>`) +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${baris.join("")}</table>`
      );
    }
    case "garis":
      return garis();
  }
}

function blockText(block: Block, ctx: RenderContext): string {
  if (!tampil(block, ctx.state)) return "";
  switch (block.type) {
    case "pembuka": {
      const teks = salinan(block, ctx.state, ctx);
      return [fill(teks.judul, ctx.values), richText(teks.isi, ctx.values)].filter(Boolean).join("\n\n");
    }
    case "tiket": {
      const t = teksTetap(ctx);
      const akun = ctx.akunUrl ? t.teks.akun(ctx.akunUrl) : "";
      if (ctx.state === "pending" || !ctx.qr) return `${t.teks.menunggu}${akun}`;
      return [t.teks.kode(ctx.qr.code), t.tunjukkan, ctx.codeUrl ? t.teks.kodeQr(ctx.codeUrl) : ""].filter(Boolean).join("\n") + akun;
    }
    case "detail": {
      const d = ctx.detail;
      const t = teksTetap(ctx);
      return [
        d.tanggal ? `${t.tanggal}: ${d.tanggal}` : "",
        d.waktu ? `${t.waktu}: ${d.waktu}` : "",
        d.tempat || d.alamat ? `${t.tempat}: ${[d.tempat, d.alamat].filter(Boolean).join(", ")}` : "",
        d.petaUrl ? `${t.teks.peta}: ${d.petaUrl}` : "",
      ].filter(Boolean).join("\n");
    }
    case "teks":
      return richText(block.isi, ctx.values);
    case "gambar":
      return "";
    case "tombol": {
      const url = block.tujuan === "url" ? block.url : block.tujuan === "dashboard" ? ctx.dashboardUrl ?? ctx.halamanUrl : ctx.halamanUrl;
      return url ? `${block.label}: ${url}` : "";
    }
    case "info":
      return [fill(block.judul, ctx.values).toUpperCase(), richText(block.isi, ctx.values)].filter(Boolean).join("\n");
    default:
      return "";
  }
}

function kaki(ctx: RenderContext) {
  return teksTetap(ctx).kaki(ctx.eventName, ctx.bisaDibalas);
}

export function renderKonfirmasi(templatAsli: Templat, ctx: RenderContext): RenderedEmail {
  const templat = untukBahasa(templatAsli, ctx.lang ?? "id");
  const fonts = fontStacks(templat.font, ctx.headingFont);
  const subjekMentah = ctx.state === "pending" ? templat.subjek_menunggu : ctx.state === "rejected" ? templat.subjek_ditolak : templat.subjek;
  const subjekDasar = fill(subjekMentah, ctx.values).trim() || ctx.eventName;
  const subject = `${ctx.test ? "[TEST] " : ""}${subjekDasar}`;
  const uji = ctx.test
    ? `<p lang="en" style="margin:0 0 20px;padding:10px 12px;background:${AMBER_BG};color:${AMBER_INK};font-size:13px;line-height:18px;border-radius:6px;">Test email. The QR code and links in this email are samples and can't be used to sign in.</p>`
    : "";
  const isi = templat.blocks.map((block) => blockHtml(block, templat, ctx, fonts)).join("");
  const latarLuar = templat.preset === "polos" ? "#F4F4F5" : mixHex(ctx.brand, "#FFFFFF", 0.93);

  const html = `<!doctype html>
<html lang="${teksTetap(ctx).htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subjekDasar)}</title>
${fonts.link ? `<link href="${fonts.link}" rel="stylesheet">` : ""}
<!--[if mso]><style>body,table,td,p,a,h1,li{font-family:${templat.font === "serif" ? SERIF : SANS} !important;}</style><![endif]-->
<style>:root{color-scheme:light;supported-color-schemes:light;}
@media (max-width:620px){.px{padding-left:20px !important;padding-right:20px !important;}
.stack{display:block !important;width:auto !important;padding:20px 20px 0 !important;}
.stack + .stack{padding:16px 20px 20px !important;}
.btn{width:100% !important;}.btn a{padding:16px 20px !important;}
.tap{display:block !important;}.dot{display:none !important;}}</style>
</head><body style="margin:0;padding:0;background:${latarLuar};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${latarLuar}" style="background:${latarLuar};"><tr><td align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;font-family:${fonts.body};color:${INK};">
${kepala(templat, ctx, fonts)}
<tr><td style="padding:32px 40px;font-family:${fonts.body};" class="px">
${uji}${isi}
<p style="margin:32px 0 0;padding-top:20px;border-top:1px solid ${RULE};font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(kaki(ctx))}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    ...(ctx.test ? ["[TEST EMAIL: the QR code and links in this email are samples]", ""] : []),
    ctx.eventName,
    "",
    ...templat.blocks.map((block) => blockText(block, ctx)).filter(Boolean).flatMap((bagian) => [bagian, ""]),
    kaki(ctx),
  ].join("\n");

  return { subject, html, text };
}
