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

// Seluruh ruang warna (langkah 17 per kanal): teks utama dan teks redup
// tidak pernah di bawah 4,5:1, jadi CMS tidak perlu peringatan.
for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  const w = warnaLatarSendiri(hex);
  assert.ok(kontras(w.teks, hex) >= 4.5, `${hex} teks`);
  assert.ok(kontras(w.redup, hex) >= 4.5, `${hex} redup`);
}
