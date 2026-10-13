import assert from "node:assert/strict";
import { kontras, TINTA } from "./landing-hitung-mundur.ts";
import { gayaBlokLatarSendiri, hexLatarSendiri, warnaLatarSendiri } from "./landing-latar-sendiri.ts";

// Hex sah saja; selain itu latar sendiri dianggap kosong (pakai Light/Grey/Dark brand).
assert.equal(hexLatarSendiri("#7a1f2b"), "#7A1F2B");
assert.equal(hexLatarSendiri("7A1F2B"), null);
assert.equal(hexLatarSendiri("#fff"), null);
assert.equal(hexLatarSendiri(undefined), null);

// Gelap -> teks putih; terang -> tinta.
assert.equal(warnaLatarSendiri("#7A1F2B").teks, "#FFFFFF");
assert.equal(warnaLatarSendiri("#F5C451").teks, TINTA);
assert.equal(gayaBlokLatarSendiri("#F5C451")["--blok-tombol"], TINTA);

// Seluruh ruang warna (langkah 15 per kanal, 5.832 warna): teks utama dan
// teks redup 4,5:1 ke atas di latar DAN di isi kartu, garis tab dan kartu
// 3:1 ke atas, jadi CMS tidak perlu peringatan. QA #157 M1, L1.
for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 15) for (let b = 0; b <= 255; b += 15) {
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  const w = warnaLatarSendiri(hex);
  for (const [nama, latar] of [["latar", hex], ["kartu", w.kartu]] as const) {
    assert.ok(kontras(w.teks, latar) >= 4.5, `${hex} teks di ${nama}`);
    assert.ok(kontras(w.redup, latar) >= 4.5, `${hex} redup di ${nama}`);
  }
  assert.ok(kontras(w.garisTegas, hex) >= 3, `${hex} garis`);
}
// Merek umum dari laporan QA.
for (const hex of ["#3F51B5", "#2E7D32", "#767676", "#FF0000"]) {
  const w = warnaLatarSendiri(hex);
  assert.ok(kontras(w.teks, w.kartu) >= 4.5 && kontras(w.redup, w.kartu) >= 4.5, hex);
}
// Kartu tetap terlihat: berbeda dari latar.
assert.notEqual(warnaLatarSendiri("#0F5257").kartu, "#0F5257");
