import assert from "node:assert/strict";
import { letakkanHorizon, pindahHorizon, simpananBebas, urutanHorizon } from "./susunan-horizon.ts";

const blok = ["blk_a", "blk_b"];

// Tanpa simpanan: bawaan, Announcements paling atas, blok sebelum Help card.
assert.deepEqual(urutanHorizon(undefined, blok), ["announcements", "next", "outfit", "checkpoints", "logistics", "roommates", "blk_a", "blk_b", "help"]);

// Simpanan lama (editor sebelum seret di pratinjau) dibaca persis seperti Beranda #243.
const lama = (urutan: string[]) => urutanHorizon({ order: urutan }, blok);
assert.deepEqual(lama(["announcements", "checkpoints", "logistics", "next", "roommates", "blk_b", "blk_a"]), ["announcements", "next", "outfit", "checkpoints", "logistics", "roommates", "blk_b", "blk_a", "help"]);
assert.deepEqual(lama(["checkpoints", "logistics", "next", "announcements", "roommates"]), ["next", "announcements", "outfit", "checkpoints", "logistics", "roommates", "blk_a", "blk_b", "help"]);
assert.deepEqual(lama(["checkpoints", "logistics", "announcements", "next", "roommates"]), ["next", "outfit", "checkpoints", "logistics", "roommates", "announcements", "blk_a", "blk_b", "help"]);
// Urutan lama Gathering klasik (Next up di depan): di ponsel Announcements tetap paling atas.
assert.deepEqual(lama(["quick", "next", "announcements", "checkpoints", "logistics", "roommates", "agenda"]).slice(0, 2), ["announcements", "next"]);
assert.equal(simpananBebas({ order: ["announcements", "next"] }), false);

// Simpanan baru (memuat "help"): urutan tampil apa adanya.
const baru = ["next", "checkpoints", "announcements", "logistics", "roommates", "blk_b", "outfit", "blk_a", "help"];
assert.equal(simpananBebas({ order: baru }), true);
assert.deepEqual(urutanHorizon({ order: baru }, blok), baru);
// Blok baru di bawah, sebelum Help card; isi bawaan yang hilang di tempat bawaannya; id asing dibuang.
assert.deepEqual(urutanHorizon({ order: ["next", "logistics", "announcements", "quick", "agenda", "blk_lama", "help"] }, ["blk_a"]), ["next", "outfit", "checkpoints", "logistics", "roommates", "announcements", "blk_a", "help"]);
// Simpanan yang melanggar aturan dirapikan: hanya Announcements di atas Next up, Help card di bawah.
assert.deepEqual(urutanHorizon({ order: ["help", "outfit", "next", "announcements", "roommates", "logistics"] }, []), ["next", "outfit", "announcements", "checkpoints", "logistics", "roommates", "help"]);

// Pindah (daftar CMS dan panah).
const awal = urutanHorizon(undefined, blok);
assert.deepEqual(pindahHorizon(awal, "checkpoints", 2), ["announcements", "next", "checkpoints", "outfit", "logistics", "roommates", "blk_a", "blk_b", "help"]);
// Isi tetap tidak bergerak.
assert.deepEqual(pindahHorizon(awal, "next", 5), awal);
assert.deepEqual(pindahHorizon(awal, "help", 0), awal);
assert.deepEqual(pindahHorizon(awal, "roommates", 0), awal);
// Selain Announcements, ke atas Next up menjadi tepat di bawahnya.
assert.deepEqual(pindahHorizon(awal, "outfit", 0), awal);
assert.deepEqual(pindahHorizon(awal, "blk_b", 0).slice(0, 3), ["announcements", "next", "blk_b"]);
// Announcements boleh pindah ke bawah Next up, lalu kembali ke atas.
const turun = pindahHorizon(awal, "announcements", 2);
assert.deepEqual(turun.slice(0, 3), ["next", "outfit", "announcements"]);
assert.deepEqual(pindahHorizon(turun, "announcements", 0), awal);
// Ke bawah Help card menjadi tepat di atasnya; di antara Bus and room dan Roommates menjadi sesudah Roommates.
assert.deepEqual(pindahHorizon(awal, "outfit", 99).slice(-2), ["outfit", "help"]);
assert.deepEqual(pindahHorizon(awal, "blk_a", 5), ["announcements", "next", "outfit", "checkpoints", "logistics", "roommates", "blk_a", "blk_b", "help"]);

// Seret di pratinjau: letakkan sebelum kartu lain, atau paling bawah.
assert.deepEqual(letakkanHorizon(awal, "logistics", "outfit"), ["announcements", "next", "logistics", "roommates", "outfit", "checkpoints", "blk_a", "blk_b", "help"]);
assert.deepEqual(letakkanHorizon(awal, "announcements", null).slice(-2), ["announcements", "help"]);
assert.deepEqual(letakkanHorizon(awal, "outfit", "next"), awal);
assert.deepEqual(letakkanHorizon(awal, "next", "help"), awal);

console.log("susunan-horizon: ok");
