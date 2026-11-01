import assert from "node:assert/strict";
import { isianAngka, LAYOUT_FIELDS, nilaiBawaan, pakaiMejaBulat, SEMUA_LAYOUT } from "./seat-map-layout-fields.ts";

// Setiap tata ruang punya entri, setiap batas memuat nilai bawaannya, dan
// meja bulat tetap tiga yang lama (dipakai untuk baris meja dan aturan kursi).
for (const layout of SEMUA_LAYOUT) {
  assert.ok(LAYOUT_FIELDS[layout], `${layout} has no editor fields`);
  for (const isian of isianAngka(layout)) {
    const bawaan = nilaiBawaan(layout, isian.key);
    assert.ok(isian.min <= bawaan && bawaan <= isian.max, `${layout}.${isian.key}: default ${bawaan} outside ${isian.min}-${isian.max}`);
  }
}
assert.deepEqual(SEMUA_LAYOUT.filter(pakaiMejaBulat), ["banquet_round", "cabaret", "head_table"]);
assert.equal(LAYOUT_FIELDS.theater.some((item) => item.kind === "aisles"), true);
console.log("seat-map-layout-fields OK");
