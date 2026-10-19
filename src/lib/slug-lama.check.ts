import assert from "node:assert/strict";
import { alamatSlugBaru, petaSlugLama } from "./slug-lama.ts";

const peta = new Map([["kso-21-fly-beyond-limit", "kso-24-fly-beyond-limit"]]);
const alihkan = (path: string, search = "") => alamatSlugBaru(path, search, peta);

// Halaman acara, bahasa, dan halaman di bawahnya.
assert.equal(alihkan("/e/kso-21-fly-beyond-limit"), "/e/kso-24-fly-beyond-limit");
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/"), "/e/kso-24-fly-beyond-limit/");
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/en"), "/e/kso-24-fly-beyond-limit/en");
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/peserta", "?tab=qr"), "/e/kso-24-fly-beyond-limit/peserta?tab=qr");
// Tautan email: token dan query lain utuh.
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/kode/AbC_-123"), "/e/kso-24-fly-beyond-limit/kode/AbC_-123");
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/en/kode/tok"), "/e/kso-24-fly-beyond-limit/en/kode/tok");
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/masuk", "?sandi=xyz"), "/e/kso-24-fly-beyond-limit/masuk?sandi=xyz");
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/api/peserta/konfirmasi", "?token=t&bahasa=en"), "/e/kso-24-fly-beyond-limit/api/peserta/konfirmasi?token=t&bahasa=en");
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/daftar", "?undangan=id.sig"), "/e/kso-24-fly-beyond-limit/daftar?undangan=id.sig");
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/pindai", "?s=1&k=a%2Bb"), "/e/kso-24-fly-beyond-limit/pindai?s=1&k=a%2Bb");
// Service worker dan staf.
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/peserta-sw.js"), "/e/kso-24-fly-beyond-limit/peserta-sw.js");
assert.equal(alihkan("/e/kso-21-fly-beyond-limit/admin/participants"), "/e/kso-24-fly-beyond-limit/admin/participants");
// Area peserta internal dan slug di query.
assert.equal(alihkan("/peserta/e/kso-21-fly-beyond-limit/en"), "/peserta/e/kso-24-fly-beyond-limit/en");
assert.equal(alihkan("/daftar", "?eventSlug=kso-21-fly-beyond-limit&bahasa=en"), "/daftar?eventSlug=kso-24-fly-beyond-limit&bahasa=en");
assert.equal(alihkan("/scan", "eventSlug=kso-21-fly-beyond-limit"), "/scan?eventSlug=kso-24-fly-beyond-limit");
// Slug ter-encode tetap dikenali.
assert.equal(alihkan("/e/kso%2D21-fly-beyond-limit/rundown"), "/e/kso-24-fly-beyond-limit/rundown");

// Tidak disentuh: slug sekarang, acara lain, awalan yang mirip, path lain.
for (const [p, q] of [
  ["/e/kso-24-fly-beyond-limit/peserta", ""],
  ["/e/ilo/peserta", ""],
  ["/e/kso-21-fly-beyond-limit-2/peserta", ""],
  ["/x/e/kso-21-fly-beyond-limit", ""],
  ["/api/peserta/sesi", "?eventSlug=ilo"],
  ["/", ""],
  ["/e/%E0%A4%A", ""],
]) {
  assert.equal(alihkan(p, q), null, `${p}${q}`);
}
assert.equal(alamatSlugBaru("/e/kso-21-fly-beyond-limit", "", new Map()), null);

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
