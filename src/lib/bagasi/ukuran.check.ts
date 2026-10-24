import assert from "node:assert/strict";
import { ukuranBaru } from "./ukuran.ts";

// Foto 12 MP tegak dan mendatar: sisi terpanjang menjadi 1280, rasio tetap.
assert.deepEqual(ukuranBaru(4032, 3024), { lebar: 1280, tinggi: 960 });
assert.deepEqual(ukuranBaru(3024, 4032), { lebar: 960, tinggi: 1280 });
// Foto yang sudah kecil tidak dibesarkan.
assert.deepEqual(ukuranBaru(800, 600), { lebar: 800, tinggi: 600 });
// Panorama sangat lebar: sisi pendek tidak pernah nol.
assert.deepEqual(ukuranBaru(20000, 10), { lebar: 1280, tinggi: 1 });
// Ukuran nol (gambar rusak) tidak membagi dengan nol.
assert.deepEqual(ukuranBaru(0, 0), { lebar: 1, tinggi: 1 });

console.log("bagasi/ukuran ok");
