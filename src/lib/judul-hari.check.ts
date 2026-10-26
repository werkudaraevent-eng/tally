import assert from "node:assert/strict";
import { judulMemuatTanggal } from "./judul-hari.ts";

assert.equal(judulMemuatTanggal("Jumat, 06 November 2026", "2026-11-06"), true);
assert.equal(judulMemuatTanggal("Friday 6 Nov", "2026-11-06"), true);
assert.equal(judulMemuatTanggal("6 Nov · Kedatangan", "2026-11-06"), true);
assert.equal(judulMemuatTanggal("Kedatangan", "2026-11-06"), false);
assert.equal(judulMemuatTanggal("Hari 16 November", "2026-11-06"), false, "16 bukan 6");
assert.equal(judulMemuatTanggal("Jumat, 06 Desember", "2026-11-06"), false, "bulan lain");
assert.equal(judulMemuatTanggal("Novena 6", "2026-11-06"), false, "nov di dalam kata");
assert.equal(judulMemuatTanggal("Jumat, 06 November 2026", null), false);
assert.equal(judulMemuatTanggal(null, "2026-11-06"), false);
assert.equal(judulMemuatTanggal("1 Mei", "2026-05-01"), true);
console.log("judul-hari.check ok");
