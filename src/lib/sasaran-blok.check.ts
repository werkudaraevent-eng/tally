import assert from "node:assert/strict";
import { bacaSasaranBlok, bacaTautanAgenda, blokUntukPeserta, KOLOM_HOTEL } from "./sasaran-blok.ts";

// Bentuk tersimpan: kosong atau rusak berarti semua peserta.
assert.equal(bacaSasaranBlok(undefined), null);
assert.equal(bacaSasaranBlok({ field: "batch", values: [] }), null);
assert.equal(bacaSasaranBlok({ field: "@lain", values: ["1"] }), null);
assert.deepEqual(bacaSasaranBlok({ field: "batch", values: [" Batch 1 ", "batch 1", ""] }), { field: "batch", values: ["Batch 1"] });
// Hotel: hanya id angka.
assert.deepEqual(bacaSasaranBlok({ field: KOLOM_HOTEL, values: [3, "4", "GRAMM", "0", "-1"] }), { field: KOLOM_HOTEL, values: ["3", "4"] });
assert.equal(bacaSasaranBlok({ field: KOLOM_HOTEL, values: ["GRAMM"] }), null);

assert.deepEqual(bacaTautanAgenda([5008, 5008, 0, -2, 1.5, "7", 12]), [5008, 12]);
assert.deepEqual(bacaTautanAgenda(null), []);

const kolom = [{ key: "batch" }];
const data = (jawaban: Record<string, unknown>, hotelId: number | null = null) => ({ jawaban, hotelId, kolom });

// Tanpa sasaran: semua peserta, juga tanpa data.
assert.equal(blokUntukPeserta(null, null), true);
// Kolom pertanyaan: cocok tanpa peduli huruf besar; kosong atau lain disembunyikan.
const b1 = { field: "batch", values: ["Batch 1"] };
assert.equal(blokUntukPeserta(b1, data({ batch: "batch 1" })), true);
assert.equal(blokUntukPeserta(b1, data({ batch: "Batch 2" })), false);
assert.equal(blokUntukPeserta(b1, data({})), false);
assert.equal(blokUntukPeserta(b1, null), false);
// Kolom yang sudah dihapus dari formulir: disembunyikan, bukan tampil ke semua.
assert.equal(blokUntukPeserta({ field: "bus", values: ["Bus 3"] }, data({ bus: "Bus 3" })), false);
// Hotel: cocok dengan id hotel peserta; tanpa kamar atau kamar tidak ditampilkan, disembunyikan.
const gramm = { field: KOLOM_HOTEL, values: ["1"] };
assert.equal(blokUntukPeserta(gramm, data({}, 1)), true);
assert.equal(blokUntukPeserta(gramm, data({}, 2)), false);
assert.equal(blokUntukPeserta(gramm, data({}, null)), false);

console.log("sasaran-blok ok");
