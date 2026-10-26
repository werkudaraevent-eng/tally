import assert from "node:assert/strict";
import { barisCocok, labelTerjawab, pilihanSah } from "./agenda-kelompok.ts";

const b1 = [{ grup: 0, nilai: ["Batch 1"] }];
const b12 = [{ grup: 0, nilai: ["Batch 1", "Batch 2"] }];
// Semua: semua baris tampil.
assert.equal(barisCocok(b1, {}), true);
assert.equal(barisCocok(null, { 0: "Batch 2" }), true);
// Batch 2 dipilih: baris Batch 1 hilang, baris Batch 1 / Batch 2 tetap.
assert.equal(barisCocok(b1, { 0: "Batch 2" }), false);
assert.equal(barisCocok(b12, { 0: "Batch 2" }), true);
// Kelompok lain yang tidak dipilih tidak menyaring.
assert.equal(barisCocok([{ grup: 1, nilai: ["Jakarta"] }], { 0: "Batch 2" }), true);
// Label hilang hanya bila semua kelompok baris itu dipilih.
assert.equal(labelTerjawab(b1, {}), false);
assert.equal(labelTerjawab(b1, { 0: "Batch 1" }), true);
assert.equal(labelTerjawab([...b1, { grup: 1, nilai: ["Jakarta"] }], { 0: "Batch 1" }), false);
assert.equal(labelTerjawab(null, { 0: "Batch 1" }), false);
// Pilihan lama yang jawabannya sudah hilang dibuang.
assert.deepEqual(pilihanSah({ 0: "Batch 9", 1: "Jakarta" }, [["Batch 1"], ["Jakarta"]]), { 1: "Jakarta" });
assert.deepEqual(pilihanSah({ 3: "X" }, [["Batch 1"]]), {});
console.log("agenda-kelompok ok");
