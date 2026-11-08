/**
 * Gaya kanvas slide 1280×720. Ditulis sekali sebagai CSS biasa dengan awalan
 * `lp-` supaya sama persis di admin, tab klien dan halaman cetak, dan tidak
 * bocor ke layar lain. Warna aksen datang dari variabel `--lp-aksen`.
 */
export const GAYA_LAPORAN = `
.lp-stage{box-sizing:border-box;position:relative;width:1280px;height:720px;overflow:hidden;background:#fff;color:#16181d;font-family:var(--font-sans),Inter,system-ui,sans-serif;
  padding:56px 64px 32px;display:grid;grid-template-rows:auto 1fr auto;gap:28px;font-size:22px;line-height:1.4;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.lp-stage *{box-sizing:border-box}
.lp-h{margin:0;font-size:40px;line-height:1.15;font-weight:600;letter-spacing:-.015em;max-width:1060px;text-wrap:balance}
.lp-body{min-height:0;display:grid;gap:28px;align-content:start}
.lp-dua{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:56px;align-items:start}
.lp-sisi{display:grid;gap:20px;align-content:start}
.lp-foot{display:flex;justify-content:space-between;gap:32px;font-size:15px;color:#646a79;border-top:1px solid #e3e6eb;padding-top:12px}
.lp-foot span:last-child{flex:none;font-variant-numeric:tabular-nums}
.lp-p{margin:0}
.lp-kecil{margin:0;font-size:17px;color:#646a79}
.lp-catatan{margin:0;font-size:18px;color:#16181d;max-width:70ch}
.lp-catatan b{font-weight:600}
.lp-poin{margin:0;padding:0;list-style:none;display:grid;gap:16px}
.lp-poin li{border-bottom:1px solid #e3e6eb;padding-bottom:14px}
.lp-angka{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);border-block:1px solid #e3e6eb}
.lp-angka>div{display:grid;gap:8px;align-content:start;padding:22px 24px 22px 0}
.lp-angka>div+div{padding-left:24px;border-left:1px solid #e3e6eb}
.lp-fig{font-size:64px;font-weight:600;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.lp-fig.lp-m{color:#b3261e}
.lp-lbl{font-size:18px;font-weight:500}
.lp-tbl{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:19px}
.lp-tbl th,.lp-tbl td{padding:10px 10px;border-bottom:1px solid #e3e6eb;text-align:left;white-space:nowrap}
.lp-tbl th{font-weight:500;color:#646a79;font-size:16px}
.lp-tbl td.lp-w{white-space:normal}
.lp-tbl .lp-n{text-align:right}
.lp-tbl tr.lp-total td{font-weight:600;border-bottom:0}
.lp-tbl tr.lp-mr td:first-child{color:#b3261e}
.lp-bar{width:180px;height:12px;background:#e3e6eb}
.lp-bar i{display:block;height:100%;background:var(--lp-aksen)}
.lp-bar i.lp-m{background:#b3261e}
.lp-bar i.lp-k{background:#cdd2db}
.lp-svg{display:block;width:100%;height:auto;overflow:visible}
.lp-svg text{font-family:inherit;fill:#646a79;font-size:17px}
.lp-svg .lp-v{fill:#16181d;font-weight:600;font-size:20px}
.lp-key{display:flex;gap:28px;font-size:16px;color:#646a79}
.lp-key i{display:inline-block;width:12px;height:12px;margin-right:8px;vertical-align:-1px}
.lp-sampul{background:var(--lp-aksen);color:#fff;grid-template-rows:1fr auto}
.lp-sampul .lp-h{font-size:68px;letter-spacing:-.02em;max-width:960px}
.lp-sampul .lp-foot{color:#fff;border-top-color:rgb(255 255 255 / .3);opacity:.85}
.lp-lead{display:grid;gap:28px;align-content:center}
.lp-meta{display:grid;gap:6px;font-size:24px}
.lp-logo{height:64px;width:auto;max-width:280px;object-fit:contain;justify-self:start;background:#fff;border-radius:8px;padding:8px}
.lp-petunjuk{display:grid;place-items:center;border:1px solid #e3e6eb;border-radius:8px;color:#646a79;font-size:20px;min-height:280px;text-align:center;padding:32px}
`;
