/**
 * Halaman QR luring portal Horizon (U-02): satu berkas HTML utuh (gaya dan
 * gambar QR di dalamnya, tanpa skrip aplikasi) yang disimpan portal di Cache
 * Storage saat sinyal ada. Service worker peserta (app/peserta-sw.js)
 * menyajikannya bila halaman portal dibuka tanpa sinyal, jadi QR tetap bisa
 * ditunjukkan di stasiun atau di kereta.
 *
 * Fungsi murni tanpa impor (halaman-qr-luring.check.ts).
 */

export const CACHE_QR_LURING = "tally-qr-luring-v1";

/** Kunci Cache Storage untuk satu lingkup portal, mis. "https://host/e/kso/peserta?tally-qr-luring". */
export function kunciQrLuring(asal: string, lingkup: string): string {
  return `${asal}${lingkup}?tally-qr-luring`;
}

/**
 * Semua lingkup portal satu acara yang mungkin menyimpan salinan QR: portal
 * bahasa utama (`/e/<slug>/peserta`) dan portal bahasa kedua (`/e/<slug>/en`
 * atau `/e/<slug>/id`). Dipakai saat salinan harus hilang tanpa tahu bahasa
 * utamanya, mis. tepat setelah orang lain masuk di ponsel yang sama.
 */
export function lingkupSalinanQr(slug: string): string[] {
  return [`/e/${slug}/peserta`, `/e/${slug}/en/peserta`, `/e/${slug}/id/peserta`];
}

export type IsiQrLuring = {
  lang: "id" | "en";
  judul: string;
  baris: string | null;
  nama: string;
  sub: string | null;
  pil: string | null;
  kode: string;
  qr: string;
  luring: string;
  luringCatatan: string;
  kodeLabel: string;
  petunjuk: string;
  petunjukCatatan: string;
  tersimpan: string;
  kecerahan: string;
  cobaLagi: string;
  /** Alamat portal untuk "Coba lagi". */
  portal: string;
};

function aman(teks: string): string {
  return teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Gambar QR hanya dari data URL PNG milik sendiri; selain itu tanpa gambar. */
function gambarAman(src: string): string | null {
  return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src) ? src : null;
}

export function halamanQrLuring(isi: IsiQrLuring): string {
  const qr = gambarAman(isi.qr);
  const t = (teks: string | null) => (teks ? aman(teks) : "");
  return `<!doctype html>
<html lang="${isi.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${t(isi.judul)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;background:#0B182D;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:480px;margin:0 auto;padding:28px 24px calc(40px + env(safe-area-inset-bottom))}
h1{margin:0;font-size:20px;line-height:28px;font-weight:800}
.baris{margin:2px 0 0;font-size:14px;line-height:20px;color:#CDD7EA;overflow-wrap:anywhere}
.luring{margin:24px 0 0;border-radius:16px;background:#FAF3DE;color:#5E4A0E;padding:12px 16px;font-size:15px;line-height:22px}
.luring b{font-weight:700}
.kartu{margin:24px auto 0;max-width:340px;border-radius:24px;background:#fff;color:#101E38;padding:30px;text-align:center}
.nama{margin:0;font-size:20px;font-weight:800;overflow-wrap:anywhere}
.sub{margin:4px 0 0;font-size:13px;color:#526078}
.pil{display:inline-block;margin:8px 0 0;border-radius:999px;background:#FAF3DE;color:#5E4A0E;padding:6px 14px;font-size:13px;font-weight:700}
.qr{display:block;width:192px;height:192px;margin:16px auto 0;image-rendering:pixelated}
.label{margin:16px 0 0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#4D5D77}
.kode{margin:4px 0 0;font:700 15px/1.4 ui-monospace,monospace;letter-spacing:1px;color:#526078}
.bawah{margin:40px auto 0;max-width:340px;text-align:center}
.bawah p{margin:8px 0 0}
.petunjuk{font-size:15px;font-weight:700}
.catatan{font-size:13px;color:#C6D2E8}
.coba{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:24px;padding:0 24px;border-radius:999px;border:1px solid #405272;color:#fff;font-size:14px;font-weight:700;text-decoration:none}
</style>
</head>
<body>
<main>
<h1>${t(isi.judul)}</h1>
${isi.baris ? `<p class="baris">${t(isi.baris)}</p>` : ""}
<p class="luring" role="status"><b>${t(isi.luring)}</b> ${t(isi.luringCatatan)}</p>
<div class="kartu">
<p class="nama">${t(isi.nama)}</p>
${isi.sub ? `<p class="sub">${t(isi.sub)}</p>` : ""}
${isi.pil ? `<p class="pil">${t(isi.pil)}</p>` : ""}
${qr ? `<img class="qr" src="${qr}" alt="" width="192" height="192">` : ""}
<p class="label">${t(isi.kodeLabel)}</p>
<p class="kode">${t(isi.kode)}</p>
</div>
<div class="bawah">
<p class="petunjuk">${t(isi.petunjuk)}</p>
<p class="catatan">${t(isi.petunjukCatatan)}</p>
<p class="catatan">${t(isi.tersimpan)}</p>
<p class="catatan">${t(isi.kecerahan)}</p>
<a class="coba" href="${t(isi.portal)}">${t(isi.cobaLagi)}</a>
</div>
</main>
<script>
// Layar tetap menyala selama QR terbuka; diam bila peramban menolak.
try{navigator.wakeLock&&navigator.wakeLock.request("screen").catch(function(){})}catch(e){}
</script>
</body>
</html>`;
}
