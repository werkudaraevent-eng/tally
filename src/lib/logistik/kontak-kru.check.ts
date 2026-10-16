import assert from "node:assert/strict";
import { nomorKru } from "./kontak-kru.ts";

const hadi = { tel: "+628112836676", wa: "https://wa.me/628112836676" };
const budi = { tel: "+6281234567890", wa: "https://wa.me/6281234567890" };

assert.deepEqual(nomorKru("Hadi - 08112836676"), hadi);
assert.deepEqual(nomorKru("Pak Budi +62 812-3456-7890"), budi);
assert.deepEqual(nomorKru("Sopir: 0811 2836 676\nKernet: 0812 0000 111"), hadi);
assert.deepEqual(nomorKru("6281234567890"), budi);
assert.deepEqual(nomorKru("+62 0812 3456 7890"), budi);
assert.deepEqual(nomorKru("+62 (0) 812 3456 7890"), budi);
assert.deepEqual(nomorKru("0062 812 3456 7890"), budi);
assert.deepEqual(nomorKru("0812.3456.7890"), budi);

// Angka di sekitar nomor tidak boleh ikut digabung (QA #192 M1).
assert.deepEqual(nomorKru("Sopir 1 - 0812 3456 7890"), budi);
assert.deepEqual(nomorKru("Bus 3 - 0811 2836 676"), hadi);
assert.deepEqual(nomorKru("Hadi 0811 2836 676 (2 orang)"), hadi);
assert.deepEqual(nomorKru("Hadi 0811 2836 676 - 24 jam"), hadi);
assert.deepEqual(nomorKru("Siaga 16-10-2026, Hadi 0811 2836 676"), hadi);

// Tanpa awalan Indonesia yang jelas: tanpa tombol (QA #192 L1).
assert.equal(nomorKru("812-3456-7890"), null);
assert.equal(nomorKru("Hadi"), null);
assert.equal(nomorKru("Bus 3"), null);
assert.equal(nomorKru("Kamar 1203"), null);
assert.equal(nomorKru("Siaga 16-10-2026"), null);
assert.equal(nomorKru("0274 512345"), null);
assert.equal(nomorKru(null), null);
assert.equal(nomorKru("1234567890123456789"), null);
console.log("kontak-kru ok");
