import assert from "node:assert/strict";
import { barisLogo, barisLogoPonsel, logoPerBaris } from "./landing-logo-baris.ts";

// Layar lebar: sesedikit mungkin baris, isi dibagi rata.
assert.equal(logoPerBaris(5, 6), 5);
assert.equal(logoPerBaris(6, 6), 6);
assert.equal(logoPerBaris(7, 6), 4, "7 = 4 + 3");
assert.equal(logoPerBaris(6, 5), 3, "6 = 3 + 3");
assert.equal(logoPerBaris(11, 6), 6, "11 = 6 + 5");
assert.equal(logoPerBaris(0, 6), 1);

// Ponsel: tidak ada baris bawah yang berisi satu logo bila jumlahnya lebih dari 1.
assert.deepEqual(barisLogoPonsel(5), [3, 2]);
assert.deepEqual(barisLogoPonsel(6), [2, 2, 2]);
assert.deepEqual(barisLogoPonsel(7), [3, 2, 2]);
assert.deepEqual(barisLogoPonsel(9), [3, 3, 3]);
for (let n = 2; n <= 16; n++) {
  const baris = barisLogoPonsel(n);
  assert.equal(baris.reduce((a, b) => a + b, 0), n);
  assert.ok(baris.every((isi) => isi >= 2 && isi <= 3), `n=${n}: ${baris}`);
}

// Tablet (3 sebaris): 7 = 3 + 2 + 2, bukan 3 + 3 + 1.
assert.deepEqual(barisLogo(7, 3), [3, 2, 2]);
assert.deepEqual(barisLogo(6, 3), [3, 3]);
// Layar lebar juga tidak menyisakan satu logo sendirian sampai 16 logo.
for (const maks of [5, 6]) for (let n = 2; n <= 16; n++) {
  const per = logoPerBaris(n, maks);
  assert.ok(n % per !== 1, `maks=${maks} n=${n}: ${per} sebaris`);
}

console.log("landing-logo-baris: ok");
