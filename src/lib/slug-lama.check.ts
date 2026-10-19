import assert from "node:assert/strict";
import { alamatSlugBaru, petaSlugLama, swSlugLama } from "./slug-lama.ts";

const peta = new Map([["acara-lama", "acara-baru"]]);
const alihkan = (path: string, search = "") => alamatSlugBaru(path, search, peta);

// Halaman acara, bahasa, dan halaman di bawahnya.
assert.equal(alihkan("/e/acara-lama"), "/e/acara-baru");
assert.equal(alihkan("/e/acara-lama/"), "/e/acara-baru/");
assert.equal(alihkan("/e/acara-lama/en"), "/e/acara-baru/en");
assert.equal(alihkan("/e/acara-lama/peserta", "?tab=qr"), "/e/acara-baru/peserta?tab=qr");
// Tautan email: token dan query lain utuh.
assert.equal(alihkan("/e/acara-lama/kode/AbC_-123"), "/e/acara-baru/kode/AbC_-123");
assert.equal(alihkan("/e/acara-lama/en/kode/tok"), "/e/acara-baru/en/kode/tok");
assert.equal(alihkan("/e/acara-lama/masuk", "?sandi=xyz"), "/e/acara-baru/masuk?sandi=xyz");
assert.equal(alihkan("/e/acara-lama/api/peserta/konfirmasi", "?token=t&bahasa=en"), "/e/acara-baru/api/peserta/konfirmasi?token=t&bahasa=en");
assert.equal(alihkan("/e/acara-lama/daftar", "?undangan=id.sig"), "/e/acara-baru/daftar?undangan=id.sig");
// Query byte-identik (temuan QA L1): encoding nilai lain tidak disentuh.
assert.equal(alihkan("/e/acara-lama/pindai", "?s=1&k=a%2Bb+c&x=%7e"), "/e/acara-baru/pindai?s=1&k=a%2Bb+c&x=%7e");
assert.equal(alihkan("/daftar", "?a=%2B&eventSlug=acara-lama&b=1+2"), "/daftar?a=%2B&eventSlug=acara-baru&b=1+2");
// Staf, area peserta internal dan slug di query.
assert.equal(alihkan("/e/acara-lama/admin/participants"), "/e/acara-baru/admin/participants");
assert.equal(alihkan("/peserta/e/acara-lama/en"), "/peserta/e/acara-baru/en");
assert.equal(alihkan("/daftar", "?eventSlug=acara-lama&bahasa=en"), "/daftar?eventSlug=acara-baru&bahasa=en");
assert.equal(alihkan("/scan", "eventSlug=acara-lama"), "/scan?eventSlug=acara-baru");
assert.equal(alihkan("/scan", "?eventSlug=acara%2Dlama"), "/scan?eventSlug=acara-baru");
// Slug ter-encode tetap dikenali.
assert.equal(alihkan("/e/acara%2Dlama/rundown"), "/e/acara-baru/rundown");

// Tidak disentuh: slug sekarang, acara lain, awalan yang mirip, path lain.
for (const [p, q] of [
  ["/e/acara-baru/peserta", ""],
  ["/e/ilo/peserta", ""],
  ["/e/acara-lama-2/peserta", ""],
  ["/x/e/acara-lama", ""],
  ["/api/peserta/sesi", "?eventSlug=ilo"],
  ["/api/peserta/sesi", "?xeventSlug=acara-lama"],
  ["/", ""],
  ["/e/%E0%A4%A", ""],
]) {
  assert.equal(alihkan(p, q), null, `${p}${q}`);
}
assert.equal(alamatSlugBaru("/e/acara-lama", "", new Map()), null);

// Service worker di slug lama diganti skrip pensiun, bukan dialihkan (temuan QA M1).
assert.equal(swSlugLama("/e/acara-lama/peserta-sw.js", peta), true);
assert.equal(swSlugLama("/e/acara-lama/en/peserta-sw.js", peta), true);
assert.equal(swSlugLama("/e/acara%2Dlama/peserta-sw.js", peta), true);
assert.equal(swSlugLama("/e/acara-baru/peserta-sw.js", peta), false);
assert.equal(swSlugLama("/e/acara-lama/peserta", peta), false);
assert.equal(swSlugLama("/e/acara-lama/peserta-sw.jsx", peta), false);

// Peta: acara yang hidup menang; baris tanpa acara atau menunjuk diri dibuang.
const p = petaSlugLama(
  [
    { old_slug: "lama", slug: "baru" },
    { old_slug: "dipakai-lagi", slug: "baru" },
    { old_slug: "yatim", slug: null },
    { old_slug: "sama", slug: "sama" },
  ],
  new Set(["baru", "dipakai-lagi"]),
);
assert.deepEqual([...p], [["lama", "baru"]]);

console.log("slug-lama: ok");
