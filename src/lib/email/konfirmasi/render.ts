import { mixHex } from "@/lib/color";
import type { LandingHeadingFont } from "@/lib/domain";
import { FIELDS, type FieldKey } from "@/lib/pesan/bawaan";
import { escapeHtml, formatHtml, formatText } from "@/lib/pesan/format";
import type { Block, Font, Templat } from "./templat";

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

export type RenderState = "approved" | "pending";

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
  /** Ada alamat Balas-ke (Pengaturan > Pengirim email). */
  bisaDibalas: boolean;
  test?: boolean;
};

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
};
const FONT_NAME: Record<LandingHeadingFont, string> = {
  serif: "'Playfair Display'",
  sans: "Inter",
  geometric: "Montserrat",
  condensed: "Oswald",
  grotesk: "'Space Grotesk'",
  source: "'Source Sans 3'",
  ubuntu: "Ubuntu",
};
const SANS = "Arial, Helvetica, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

function fontStacks(font: Font, heading: LandingHeadingFont | null) {
  if (font === "serif") return { body: SERIF, heading: SERIF, link: null };
  if (font === "tema" && heading) {
    const fallback = heading === "serif" ? SERIF : SANS;
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
  if (ctx.state === "pending" || !ctx.qr) {
    return (
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;"><tr>` +
      `<td bgcolor="${AMBER_BG}" style="background:${AMBER_BG};border-radius:12px;padding:20px 24px;">` +
      `<p style="margin:0;font-size:13px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${AMBER_INK};">Menunggu persetujuan</p>` +
      `<p style="margin:8px 0 0;font-size:15px;line-height:22px;color:${INK};">Panitia sedang meninjau pendaftaran Anda. QR masuk dikirim ke email ini setelah disetujui.</p>` +
      `</td></tr></table>`
    );
  }
  const border = garisPutus ? `2px dashed ${RULE}` : `1px solid ${RULE}`;
  // Dua sel yang ditumpuk di ponsel (kelas .stack): QR 160px di atas kode.
  const qr = ctx.qr.src
    ? `<td width="164" class="stack" style="padding:20px 0 20px 20px;width:164px;vertical-align:middle;"><img src="${escapeHtml(ctx.qr.src)}" width="160" height="160" alt="QR kode peserta ${escapeHtml(ctx.qr.code)}" style="display:block;width:160px;height:160px;border:0;font-size:13px;color:${INK};"></td>`
    : "";
  // Tombol halaman kode permanen: lapis ketiga bila QR tidak tampil. Selalu ada, tidak bisa dimatikan.
  const cadangan = ctx.codeUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;"><tr><td style="border:1px solid ${ctx.brand};border-radius:10px;">` +
      `<a href="${escapeHtml(ctx.codeUrl)}" style="display:block;padding:12px 18px;font-size:15px;line-height:20px;font-weight:700;color:${ctx.brand};text-decoration:none;">Buka kode &amp; QR</a></td></tr></table>`
    : "";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;border:${border};border-radius:12px;border-collapse:separate;"><tr>` +
    qr +
    `<td class="stack" style="padding:20px;vertical-align:middle;">` +
    `<p style="margin:0;font-size:13px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">Kode peserta</p>` +
    `<p style="margin:6px 0 0;font-family:Consolas,Menlo,'Courier New',monospace;font-size:24px;line-height:30px;font-weight:700;letter-spacing:.06em;color:${INK};white-space:nowrap;">${escapeHtml(ctx.qr.code)}</p>` +
    `<p style="margin:8px 0 0;font-size:14px;line-height:20px;color:${MUTED};">Tunjukkan QR ini di meja registrasi. Kode ini khusus untuk Anda.</p>` +
    cadangan +
    `</td></tr></table>`
  );
}

function detail(ctx: RenderContext) {
  const d = ctx.detail;
  const baris: [string, string][] = [];
  if (d.tanggal) baris.push(["Tanggal", d.tanggal]);
  if (d.waktu) baris.push(["Waktu", d.waktu]);
  if (d.tempat || d.alamat) baris.push(["Tempat", [d.tempat, d.alamat].filter(Boolean).join(", ")]);
  if (!baris.length) return "";
  const rows = baris
    .map(
      ([label, nilai]) =>
        `<tr><td width="84" style="padding:10px 12px 10px 0;border-top:1px solid ${RULE};width:84px;font-size:13px;line-height:22px;color:${MUTED};vertical-align:top;">${label}</td>` +
        `<td style="padding:10px 0;border-top:1px solid ${RULE};font-size:15px;line-height:22px;color:${INK};">${escapeHtml(nilai)}</td></tr>`,
    )
    .join("");
  const tautan = [
    d.kalenderUrl ? `<a href="${escapeHtml(d.kalenderUrl)}" class="tap" style="display:inline-block;padding:12px 0;color:${ctx.brand};font-weight:700;text-decoration:underline;">Tambah ke kalender</a>` : "",
    d.petaUrl ? `<a href="${escapeHtml(d.petaUrl)}" class="tap" style="display:inline-block;padding:12px 0;color:${ctx.brand};font-weight:700;text-decoration:underline;">Lihat peta</a>` : "",
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

function blockHtml(block: Block, templat: Templat, ctx: RenderContext, fonts: { heading: string }): string {
  if (!block.on) return "";
  switch (block.type) {
    case "kepala":
      return "";
    case "pembuka": {
      const menunggu = ctx.state === "pending";
      const eyebrow = menunggu ? "Pendaftaran diterima" : "Pendaftaran berhasil";
      const judul = fill(menunggu ? block.judul_menunggu : block.judul, ctx.values);
      return (
        `<p style="margin:0;font-size:13px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${ctx.brand};">${eyebrow}</p>` +
        (judul ? `<h1 style="margin:8px 0 0;font-family:${fonts.heading};font-size:26px;line-height:32px;font-weight:700;color:${INK};">${escapeHtml(judul)}</h1>` : "") +
        richHtml(menunggu ? block.isi_menunggu : block.isi, ctx, 16, 16)
      );
    }
    case "tiket":
      return tiket(ctx, templat.preset === "pita");
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
        .map((logo) => `<td style="padding:0 16px 12px 0;vertical-align:middle;"><img src="${escapeHtml(logo.url)}" height="40" alt="${escapeHtml(logo.name || "Logo mitra")}" style="display:block;height:40px;width:auto;max-width:140px;border:0;font-size:12px;color:${MUTED};"></td>`);
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
  if (!block.on) return "";
  switch (block.type) {
    case "pembuka": {
      const menunggu = ctx.state === "pending";
      return [fill(menunggu ? block.judul_menunggu : block.judul, ctx.values), richText(menunggu ? block.isi_menunggu : block.isi, ctx.values)].filter(Boolean).join("\n\n");
    }
    case "tiket":
      if (ctx.state === "pending" || !ctx.qr) return "MENUNGGU PERSETUJUAN\nPanitia sedang meninjau pendaftaran Anda. QR masuk dikirim ke email ini setelah disetujui.";
      return [`KODE PESERTA: ${ctx.qr.code}`, "Tunjukkan QR ini di meja registrasi. Kode ini khusus untuk Anda.", ctx.codeUrl ? `Kode dan QR: ${ctx.codeUrl}` : ""].filter(Boolean).join("\n");
    case "detail": {
      const d = ctx.detail;
      return [
        d.tanggal ? `Tanggal: ${d.tanggal}` : "",
        d.waktu ? `Waktu: ${d.waktu}` : "",
        d.tempat || d.alamat ? `Tempat: ${[d.tempat, d.alamat].filter(Boolean).join(", ")}` : "",
        d.petaUrl ? `Peta: ${d.petaUrl}` : "",
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
  const acara = ctx.eventName;
  return `Anda menerima email ini karena mendaftar di ${acara}. ${ctx.bisaDibalas ? "Ada pertanyaan? Balas email ini untuk menghubungi panitia." : "Ada pertanyaan? Hubungi panitia acara."}`;
}

export function renderKonfirmasi(templat: Templat, ctx: RenderContext): RenderedEmail {
  const fonts = fontStacks(templat.font, ctx.headingFont);
  const subjekDasar = fill(ctx.state === "pending" ? templat.subjek_menunggu : templat.subjek, ctx.values).trim() || ctx.eventName;
  const subject = `${ctx.test ? "[TES] " : ""}${subjekDasar}`;
  const uji = ctx.test
    ? `<p style="margin:0 0 20px;padding:10px 12px;background:${AMBER_BG};color:${AMBER_INK};font-size:13px;line-height:18px;border-radius:6px;">Email tes. QR dan tautan di email ini contoh dan tidak bisa dipakai masuk.</p>`
    : "";
  const isi = templat.blocks.map((block) => blockHtml(block, templat, ctx, fonts)).join("");
  const latarLuar = templat.preset === "polos" ? "#F4F4F5" : mixHex(ctx.brand, "#FFFFFF", 0.93);

  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subjekDasar)}</title>
${fonts.link ? `<link href="${fonts.link}" rel="stylesheet">` : ""}
<!--[if mso]><style>body,table,td,p,a,h1,li{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
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
    ...(ctx.test ? ["[EMAIL TES: QR dan tautan di email ini contoh]", ""] : []),
    ctx.eventName,
    "",
    ...templat.blocks.map((block) => blockText(block, ctx)).filter(Boolean).flatMap((bagian) => [bagian, ""]),
    kaki(ctx),
  ].join("\n");

  return { subject, html, text };
}
