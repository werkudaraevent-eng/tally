/**
 * Gaya kanvas slide 1280×720. Ditulis sekali sebagai CSS biasa dengan awalan
 * `lp-` supaya sama persis di admin, tab klien dan halaman cetak, dan tidak
 * bocor ke layar lain.
 *
 * Warna datang dari tema acara lewat variabel per slide (slide.tsx):
 * --lp-bg, --lp-teks, --lp-isi (batang utama), --lp-merah, --lp-angka, dan
 * warna tema mentah untuk stiker. Redup, garis dan batang biasa dicampur dari
 * teks dan latar, jadi terbaca di ketiga permukaan tanpa daftar warna kedua.
 */
export const GAYA_LAPORAN = `
.lp-stage{box-sizing:border-box;position:relative;width:1280px;height:720px;overflow:hidden;background:var(--lp-bg,#fff);color:var(--lp-teks,#16181d);font-family:var(--font-sans),Inter,system-ui,sans-serif;
  --lp-teks2:color-mix(in srgb,var(--lp-teks) 72%,var(--lp-bg));--lp-garis:color-mix(in srgb,var(--lp-teks) 20%,var(--lp-bg));--lp-trek:color-mix(in srgb,var(--lp-teks) 22%,var(--lp-bg));--lp-kartu:color-mix(in srgb,var(--lp-teks) 9%,var(--lp-bg));
  padding:56px 64px 32px;display:grid;grid-template-rows:auto 1fr auto;gap:24px;font-size:22px;line-height:1.4;-webkit-text-size-adjust:100%;text-size-adjust:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.lp-stage *{box-sizing:border-box}
.lp-kepala{display:grid;gap:10px;justify-items:start;min-width:0}
.lp-h{margin:0;font-family:var(--lp-judul);font-size:40px;line-height:1.12;font-weight:700;letter-spacing:-.02em;max-width:1080px;text-wrap:balance;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.lp-stiker{display:inline-block;font-weight:800;font-size:19px;line-height:1.2;text-transform:uppercase;letter-spacing:.04em;padding:7px 14px;border-radius:8px;background:var(--lp-aksen);color:var(--lp-aksen-teks);transform:rotate(-2deg);box-shadow:0 4px 0 rgb(0 0 0 / .18);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.lp-aksen .lp-stiker{background:var(--lp-latar);color:var(--lp-latar-teks)}
.lp-stiker.lp-merah{background:#B3261E;color:#fff}
.lp-body{min-height:0;overflow:hidden;display:grid;gap:28px;align-content:center}
.lp-bawah{display:grid;gap:14px}
.lp-dua{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:56px;align-items:start}
.lp-sisi{display:grid;gap:20px;align-content:start;min-width:0}
.lp-foot{display:flex;justify-content:space-between;gap:32px;font-size:15px;color:var(--lp-teks2);border-top:1px solid var(--lp-garis);padding-top:12px}
.lp-foot span:first-child{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.lp-foot span:last-child{flex:none;font-variant-numeric:tabular-nums}
.lp-p{margin:0}
.lp-kecil{margin:0;font-size:17px;color:var(--lp-teks2)}
.lp-catatan{margin:0;font-size:18px;max-width:1100px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.lp-catatan b{font-weight:700}
.lp-poin{margin:0;padding:0;list-style:none;display:grid;gap:16px}
.lp-poin li{border-bottom:1px solid var(--lp-garis);padding-bottom:14px}
.lp-kartu{margin:0;padding:0;list-style:none;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:20px;counter-reset:lp}
.lp-kartu li{counter-increment:lp;background:var(--lp-kartu);border-radius:14px;padding:16px 18px;display:grid;gap:6px;align-content:start;font-size:18px;line-height:1.35}
.lp-kartu li::before{content:counter(lp);font-family:var(--lp-judul);font-weight:700;font-size:26px;line-height:1;color:var(--lp-angka)}
.lp-kartu span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.lp-fig{font-family:var(--lp-judul);font-size:64px;font-weight:700;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--lp-angka)}
.lp-fig.lp-m{color:var(--lp-merah)}
.lp-lbl{font-size:18px;font-weight:600}
.lp-angka{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:24px}
.lp-angka>div{display:grid;gap:8px;align-content:start;border-top:2px solid var(--lp-garis);padding-top:14px;min-width:0}
.lp-angka .lp-kecil{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.lp-tumpuk .lp-kecil{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-tumpuk{display:grid;gap:16px}
.lp-tumpuk>div{display:grid;gap:4px;border-top:2px solid var(--lp-garis);padding-top:10px;min-width:0}
.lp-tumpuk .lp-lbl{font-size:15px;text-transform:uppercase;letter-spacing:.04em;color:var(--lp-teks2)}
.lp-tumpuk .lp-fig{font-size:46px}
.lp-raksasa{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center}
.lp-raksasa .lp-utama{display:grid;gap:8px;min-width:0}
.lp-raksasa .lp-utama .lp-fig{font-size:168px;line-height:.9;letter-spacing:-.05em}
.lp-raksasa .lp-utama .lp-ket{font-size:24px;font-weight:500}
.lp-kpi{margin:0;padding:0;list-style:none;display:grid;gap:12px}
.lp-kpi li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:baseline;border-top:2px solid var(--lp-garis);padding-top:10px}
.lp-kpi .lp-fig{font-size:40px}
.lp-kpi span{font-size:18px;line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.lp-tbl{width:100%;table-layout:fixed;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:19px}
.lp-tbl th,.lp-tbl td{padding:9px 10px;border-bottom:1px solid var(--lp-garis);text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-tbl th{font-weight:600;color:var(--lp-teks2);font-size:16px}
.lp-tbl-r{font-size:17px}
.lp-tbl-r th,.lp-tbl-r td{padding:5px 10px}
.lp-tbl-b{font-size:15px;line-height:1.3}
.lp-tbl-b th,.lp-tbl-b td{padding:6px 10px}
.lp-tbl-b td{white-space:normal;vertical-align:top;overflow-wrap:anywhere}
.lp-sel{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.lp-tbl .lp-n{text-align:right}
.lp-tbl tr.lp-total td{font-weight:700;border-bottom:0}
.lp-tbl tr.lp-mr td:first-child{color:var(--lp-merah);font-weight:600}
.lp-bar{width:180px;height:12px;background:var(--lp-trek);border-radius:6px;overflow:hidden}
.lp-bar i{display:block;height:100%;background:var(--lp-isi);border-radius:6px}
.lp-bar i.lp-m{background:var(--lp-merah)}
.lp-svg{display:block;width:100%;height:auto;overflow:visible}
.lp-svg text{font-family:inherit;fill:var(--lp-teks2);font-size:17px}
.lp-svg .lp-v{fill:var(--lp-teks);font-weight:700;font-size:20px}
.lp-svg .lp-pn{fill:var(--lp-teks);font-weight:700}
.lp-judul-kecil{margin:0;font-size:16px;color:var(--lp-teks2)}
.lp-key{display:flex;gap:28px;font-size:16px;color:var(--lp-teks2)}
.lp-key i{display:inline-block;width:12px;height:12px;margin-right:8px;vertical-align:-1px;border-radius:3px}
.lp-panas{display:grid;gap:6px;font-variant-numeric:tabular-nums;align-content:start}
.lp-panas .lp-jk{font-size:15px;text-align:center;color:var(--lp-teks2);align-self:end}
.lp-panas .lp-jk.lp-kanan{text-align:right}
.lp-panas .lp-nm{font-size:18px;font-weight:600;line-height:1.15;align-self:center;min-width:0;overflow:hidden}
.lp-panas .lp-nm span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-panas .lp-nm small{display:block;font-size:14px;font-weight:400;color:var(--lp-teks2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-panas .lp-c{border-radius:8px;display:grid;place-items:center;font-weight:700;font-size:17px;min-width:0;overflow:hidden}
.lp-panas .lp-tot{text-align:right;font-family:var(--lp-judul);font-weight:700;font-size:26px;line-height:1.05;align-self:center;color:var(--lp-angka)}
.lp-panas .lp-tot small{display:block;font-family:var(--font-sans),Inter,sans-serif;font-size:14px;font-weight:400;color:var(--lp-teks2)}
.lp-chip{display:flex;flex-wrap:wrap;gap:12px;max-width:1000px}
.lp-chip span{background:color-mix(in srgb,var(--lp-teks) 12%,transparent);border:1px solid color-mix(in srgb,var(--lp-teks) 30%,transparent);border-radius:999px;padding:9px 18px;font-size:20px;white-space:nowrap}
.lp-chip b{color:var(--lp-angka);margin-left:8px}
.lp-sampul,.lp-pembatas{grid-template-rows:1fr auto}
.lp-foto{position:absolute;inset:0 0 0 46%;overflow:hidden;background:repeating-linear-gradient(135deg,rgb(255 255 255 / .07) 0 18px,transparent 18px 36px),linear-gradient(160deg,var(--lp-aksen),var(--lp-latar2))}
.lp-foto img{width:100%;height:100%;object-fit:cover;display:block}
.lp-foto::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--lp-bg) 0,color-mix(in srgb,var(--lp-bg) 0%,transparent) 45%)}
.lp-pembatas .lp-foto{inset:0}
.lp-pembatas .lp-foto::after{background:color-mix(in srgb,var(--lp-bg) 80%,transparent)}
.lp-lead{position:relative;display:grid;gap:24px;align-content:center;justify-items:start;max-width:660px;min-width:0}
.lp-pembatas .lp-lead{max-width:1100px}
.lp-sampul .lp-h{font-size:76px;line-height:1.02;-webkit-line-clamp:4}
.lp-pembatas .lp-h{font-size:92px;line-height:1;max-width:900px}
.lp-sampul .lp-foot,.lp-pembatas .lp-foot{position:relative}
.lp-meta{display:grid;gap:6px;font-size:24px}
.lp-logo{height:64px;width:auto;max-width:280px;object-fit:contain;justify-self:start;background:#fff;border-radius:8px;padding:8px}
.lp-petunjuk{display:grid;place-items:center;border:1px solid var(--lp-garis);border-radius:8px;color:var(--lp-teks2);font-size:20px;min-height:280px;text-align:center;padding:32px}
`;
