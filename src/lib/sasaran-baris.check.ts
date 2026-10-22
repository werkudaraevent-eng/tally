import assert from "node:assert/strict";
import { bacaSyaratBaris, barisUntukPeserta, SYARAT_MAX } from "./sasaran-baris.ts";
import { KOLOM_HOTEL } from "./sasaran-blok.ts";

const RUSAK = { field: "", values: [] };

// Kosong: semua. Rusak: tidak cocok dengan siapa pun.
assert.equal(bacaSyaratBaris(null), null);
assert.equal(bacaSyaratBaris(undefined), null);
assert.deepEqual(bacaSyaratBaris([]), [RUSAK]);
assert.deepEqual(bacaSyaratBaris({ field: "batch", values: ["Batch 1"] }), [RUSAK]);
assert.deepEqual(bacaSyaratBaris("batch"), [RUSAK]);
assert.deepEqual(bacaSyaratBaris(Array.from({ length: SYARAT_MAX + 1 }, () => ({ field: "batch", values: ["Batch 1"] }))), [RUSAK]);
assert.deepEqual(bacaSyaratBaris([null, { field: "batch", values: ["Batch 1"] }]), [RUSAK, { field: "batch", values: ["Batch 1"] }]);
assert.deepEqual(bacaSyaratBaris([{ field: "batch", values: [" Batch 1 ", "batch 1"] }]), [{ field: "batch", values: ["Batch 1"] }]);

const kolom = [{ key: "batch", options: ["Batch 1", "Batch 2", "Batch 3"] }, { key: "kota", options: ["Jakarta", "Surabaya"] }];
const data = (jawaban: Record<string, unknown>, hotelId: number | null = null) => ({ jawaban, hotelId, kolom });

// Tanpa syarat: semua, juga tanpa data peserta (halaman publik).
assert.equal(barisUntukPeserta(null, null), true);
// Satu syarat, beberapa jawaban: salah satu cukup.
const b12 = bacaSyaratBaris([{ field: "batch", values: ["Batch 1", "Batch 2"] }]);
assert.equal(barisUntukPeserta(b12, data({ batch: "batch 2" })), true);
assert.equal(barisUntukPeserta(b12, data({ batch: "Batch 3" })), false);
assert.equal(barisUntukPeserta(b12, data({})), false);
// Bersyarat tanpa data peserta: disembunyikan.
assert.equal(barisUntukPeserta(b12, null), false);
// Beberapa syarat: semua harus cocok.
const b2Gramm = bacaSyaratBaris([{ field: "batch", values: ["Batch 2"] }, { field: KOLOM_HOTEL, values: ["7"] }]);
assert.equal(barisUntukPeserta(b2Gramm, data({ batch: "Batch 2" }, 7)), true);
assert.equal(barisUntukPeserta(b2Gramm, data({ batch: "Batch 2" }, 8)), false);
assert.equal(barisUntukPeserta(b2Gramm, data({ batch: "Batch 2" }, null)), false);
assert.equal(barisUntukPeserta(b2Gramm, data({ batch: "Batch 1" }, 7)), false);
const tiga = bacaSyaratBaris([{ field: "batch", values: ["Batch 1"] }, { field: "kota", values: ["Jakarta"] }, { field: KOLOM_HOTEL, values: ["7"] }]);
assert.equal(barisUntukPeserta(tiga, data({ batch: "Batch 1", kota: "Jakarta" }, 7)), true);
assert.equal(barisUntukPeserta(tiga, data({ batch: "Batch 1", kota: "Surabaya" }, 7)), false);
// Satu syarat rusak menyembunyikan baris dari semua.
assert.equal(barisUntukPeserta(bacaSyaratBaris([null, { field: "batch", values: ["Batch 1"] }]), data({ batch: "Batch 1" })), false);
// Kolom atau jawaban yang sudah dihapus dari formulir: disembunyikan.
assert.equal(barisUntukPeserta(bacaSyaratBaris([{ field: "bus", values: ["Bus 3"] }]), data({ bus: "Bus 3" })), false);
assert.equal(barisUntukPeserta(bacaSyaratBaris([{ field: "batch", values: ["Batch 9"] }]), data({ batch: "Batch 9" })), false);

console.log("sasaran-baris ok");
