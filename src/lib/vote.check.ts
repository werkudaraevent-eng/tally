import assert from "node:assert/strict";
import { votePercentages } from "./vote.ts";

const jumlah = (values: number[]) => values.reduce((sum, value) => sum + value, 0);

// Kasus yang memicu fungsi ini: tiga suara sama banyak. Pembulatan per opsi
// menghasilkan 33+33+33 = 99, dan di layar besar angka itu terbaca seperti ada
// satu suara yang hilang.
assert.deepEqual(votePercentages([1, 1, 1]), [34, 33, 33]);
assert.equal(jumlah(votePercentages([1, 1, 1])), 100);

// Enam opsi sama banyak: 16.67 masing-masing, empat opsi pertama dapat sisa.
assert.equal(jumlah(votePercentages([1, 1, 1, 1, 1, 1])), 100);

// Belum ada suara sama sekali: semuanya nol, BUKAN NaN. Pembagian dengan nol di
// sini akan menghasilkan lebar bar `NaN%` yang dibuang browser tanpa pesan.
assert.deepEqual(votePercentages([0, 0, 0]), [0, 0, 0]);

// Satu opsi menyapu semuanya.
assert.deepEqual(votePercentages([5, 0, 0]), [100, 0, 0]);

// Pembagian yang sudah bulat tidak diganggu sisa.
assert.deepEqual(votePercentages([1, 3]), [25, 75]);

// Angka besar tetap berjumlah 100.
assert.equal(jumlah(votePercentages([137, 862, 41, 7])), 100);

// Satu opsi saja: tetap 100, bukan pembagian dengan nol.
assert.deepEqual(votePercentages([9]), [100]);

// Daftar kosong tidak melempar.
assert.deepEqual(votePercentages([]), []);

console.log("vote.check.ts OK");
