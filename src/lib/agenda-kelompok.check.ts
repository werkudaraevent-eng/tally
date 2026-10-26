import assert from "node:assert/strict";
import { barisCocok, barisPilihan, labelTerjawab, pilihanSah } from "./agenda-kelompok.ts";

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

// Dua pertanyaan dengan jawaban sama jadi satu baris tombol; pertanyaan yang tidak dipakai hari itu disembunyikan.
{
  const p = [["Batch 1", "Batch 2"], ["Batch 1", "Batch 2"], ["Jakarta", "Surabaya"]];
  assert.deepEqual(barisPilihan(p), [{ grup: [0, 1], daftar: ["Batch 1", "Batch 2"] }, { grup: [2], daftar: ["Jakarta", "Surabaya"] }]);
  assert.deepEqual(barisPilihan(p, new Set([1])), [{ grup: [0, 1], daftar: ["Batch 1", "Batch 2"] }]);
  assert.deepEqual(barisPilihan(p, new Set([2])), [{ grup: [2], daftar: ["Jakarta", "Surabaya"] }]);
  assert.equal(barisPilihan(p, new Set()).length, 2);
  // Berbagi sebagian jawaban: tetap satu baris, gabungan jawabannya.
  assert.deepEqual(barisPilihan([["Batch 1", "Batch 2", "Batch 3"], ["Jakarta"], ["Batch 1"]]), [
    { grup: [0, 2], daftar: ["Batch 1", "Batch 2", "Batch 3"] },
    { grup: [1], daftar: ["Jakarta"] },
  ]);
  assert.deepEqual(barisPilihan([["Batch 2"], ["Batch 1", "Batch 2"]]), [{ grup: [0, 1], daftar: ["Batch 1", "Batch 2"] }]);
}

console.log("agenda-kelompok ok");
