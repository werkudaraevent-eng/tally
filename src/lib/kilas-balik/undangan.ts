/**
 * Undangan dan pengingat Kilas balik (Admin > Feedback > Send). Fungsi murni:
 * teks bawaan lonceng dan isi email, diuji di alur.check.ts.
 *
 * Satu tombol untuk keduanya: yang dikirimi selalu peserta yang BELUM
 * menjawab, jadi kiriman pertama adalah undangan dan kiriman berikutnya
 * pengingat, tanpa ada yang menerima dua kali sesudah menjawab.
 */

export type BahasaUndangan = "id" | "en";

export const JUDUL_MAX = 120;
export const ISI_MAX = 600;

export const UNDANGAN_AWAL = {
  id: {
    undang: {
      title: "Kilas balikmu sudah siap",
      body: "Terima kasih sudah ikut! Sambil di perjalanan pulang, yuk lihat lagi perjalananmu dan bantu kami dengan beberapa pertanyaan ringan. Hanya sekitar 2 menit, dan bisa dilanjut nanti.",
    },
    ingat: {
      title: "Masih ada kilas balik untukmu",
      body: "Kalau sempat, kilas balikmu masih menunggu. Jawabanmu membantu kami menyiapkan acara berikutnya. Terima kasih!",
    },
    link: "Buka kilas balik",
  },
  en: {
    undang: {
      title: "Your recap is ready",
      body: "Thank you for joining us! On your way home, take a look back at your trip and help us with a few quick questions. It takes about 2 minutes, and you can finish later.",
    },
    ingat: {
      title: "Your recap is still waiting",
      body: "If you have a moment, your recap is still waiting. Your answers help us plan the next event. Thank you!",
    },
    link: "Open my recap",
  },
} as const;

/** Teks bawaan: undangan bila belum pernah dikirim, pengingat bila sudah. */
export function teksAwal(bahasa: BahasaUndangan, sudahPernah: boolean): { title: string; body: string } {
  const t = UNDANGAN_AWAL[bahasa];
  return { ...(sudahPernah ? t.ingat : t.undang) };
}

function esc(teks: string): string {
  return teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Email pribadi: sapaan dengan nama, teks panitia, satu tombol ke Kilas balik. */
export function emailUndangan(input: { bahasa: BahasaUndangan; eventName: string; nama: string; title: string; body: string; url: string; warna?: string | null }) {
  const t = UNDANGAN_AWAL[input.bahasa];
  const sapa = input.bahasa === "id" ? `Halo ${input.nama},` : `Hi ${input.nama},`;
  const aksen = input.warna && /^#[0-9a-fA-F]{6}$/.test(input.warna) ? input.warna : "#2649D0";
  const subject = `${input.title} · ${input.eventName}`;
  const paragraf = input.body.split(/\n{2,}/).map((p) => `<p style="margin:16px 0 0;font-size:15px;line-height:1.6;">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<!doctype html>
<html lang="${input.bahasa}"><body style="margin:0;padding:24px;background:#F5F4F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17211D;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D9DDD7;padding:32px;">
    <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${aksen};font-weight:600;">${esc(input.eventName)}</p>
    <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;font-weight:600;">${esc(input.title)}</h1>
    <p style="margin:16px 0 0;font-size:15px;line-height:1.6;">${esc(sapa)}</p>
    ${paragraf}
    <p style="margin:28px 0 0;"><a href="${esc(input.url)}" style="display:inline-block;padding:14px 28px;background:${aksen};color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;">${esc(t.link)}</a></p>
  </div>
</body></html>`;
  const text = [input.eventName, "", input.title, "", sapa, "", input.body, "", `${t.link}: ${input.url}`].join("\n");
  return { subject, html, text };
}
