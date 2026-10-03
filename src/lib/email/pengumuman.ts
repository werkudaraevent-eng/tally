import { escapeHtml } from "./registration-code";

/**
 * Salinan email pengumuman panitia. Isinya sama dengan yang tampil di lonceng
 * dan Dashboard saya, ditambah tombol ke Dashboard saya. Gayanya sama dengan
 * email tautan area peserta (member-links.ts).
 */
export function emailPengumuman(input: {
  eventName: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  dashboardUrl: string;
}) {
  const subject = `${input.title} — ${input.eventName}`;
  const paragraf = input.body
    .split(/\n{2,}/)
    .map((isi) => isi.trim())
    .filter(Boolean)
    .map((isi) => `<p style="margin:16px 0 0;font-size:15px;line-height:1.6;">${escapeHtml(isi).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const tautan = input.linkUrl
    ? `<p style="margin:16px 0 0;font-size:15px;line-height:1.6;"><a href="${escapeHtml(input.linkUrl)}" style="color:#2649D0;font-weight:600;">${escapeHtml(input.linkLabel?.trim() || input.linkUrl)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#F5F4F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17211D;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D9DDD7;padding:32px;">
    <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#2649D0;font-weight:600;">Pengumuman panitia · ${escapeHtml(input.eventName)}</p>
    <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;font-weight:600;">${escapeHtml(input.title)}</h1>
    ${paragraf}
    ${tautan}
    <p style="margin:28px 0 0;"><a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;padding:14px 28px;background:#2649D0;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Buka Dashboard saya</a></p>
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #D9DDD7;font-size:13px;line-height:1.6;color:#66736C;">Anda menerima email ini karena punya akun area peserta di acara ini. Pengumuman yang sama ada di Dashboard saya.</p>
  </div>
</body></html>`;

  const text = [
    `Pengumuman panitia · ${input.eventName}`,
    "",
    input.title,
    "",
    input.body.trim(),
    ...(input.linkUrl ? ["", `${input.linkLabel?.trim() || "Tautan"}: ${input.linkUrl}`] : []),
    "",
    `Buka Dashboard saya: ${input.dashboardUrl}`,
  ].join("\n");

  return { subject, html, text };
}
