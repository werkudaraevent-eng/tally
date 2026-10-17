import assert from "node:assert/strict";
import { halamanQrLuring, kunciQrLuring } from "./halaman-qr-luring.ts";

const dasar = {
  lang: "id" as const,
  judul: "QR kehadiran",
  baris: "24 Fly Beyond Limit · 6–8 Nov 2026",
  nama: "Hanung <script>alert(1)</script>",
  sub: `IT • "WG" & co`,
  pil: "Bus 3",
  kode: "REG000123",
  qr: "data:image/png;base64,iVBORw0KGgo=",
  luring: "Kamu sedang offline.",
  luringCatatan: "QR yang tersimpan tetap bisa ditunjukkan ke panitia.",
  kodeLabel: "Kode, bila QR tidak terbaca",
  petunjuk: "Tunjukkan QR ini ke panitia",
  petunjukCatatan: "saat registrasi",
  tersimpan: "Tersimpan Kam, 5 Nov 19.12 di ponsel ini",
  kecerahan: "Naikkan kecerahan layar.",
  cobaLagi: "Coba lagi",
  portal: "/e/kso/peserta",
};

const html = halamanQrLuring(dasar);
// Teks panitia dan peserta selalu di-escape.
assert.ok(!html.includes("<script>alert(1)</script>"));
assert.ok(html.includes("Hanung &lt;script&gt;alert(1)&lt;/script&gt;"));
assert.ok(html.includes("IT • &quot;WG&quot; &amp; co"));
assert.ok(html.includes('src="data:image/png;base64,iVBORw0KGgo="'));
assert.ok(html.includes('<html lang="id">'));
assert.ok(html.includes('href="/e/kso/peserta"'));
// Gambar hanya data URL PNG.
for (const qr of ["javascript:alert(1)", "https://x.test/a.png", 'data:image/png;base64,AAA" onerror="x', "data:image/svg+xml;base64,PHN2Zz4="]) {
  assert.ok(!halamanQrLuring({ ...dasar, qr }).includes("<img"), qr);
}
// Tanpa sub dan pil: barisnya tidak ada.
const polos = halamanQrLuring({ ...dasar, sub: null, pil: null, baris: null });
assert.ok(!polos.includes('class="sub"') && !polos.includes('class="pil"') && !polos.includes('class="baris"'));

assert.equal(kunciQrLuring("https://event.test", "/e/kso/peserta"), "https://event.test/e/kso/peserta?tally-qr-luring");

console.log("halaman-qr-luring: ok");
