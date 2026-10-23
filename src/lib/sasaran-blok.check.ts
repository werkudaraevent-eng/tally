import assert from "node:assert/strict";
import { bacaSasaranBlok, bacaTautanAgenda, blokUntukPeserta, KOLOM_HOTEL, samaJawaban } from "./sasaran-blok.ts";

// Bentuk tersimpan: kosong atau rusak berarti semua peserta.
assert.equal(bacaSasaranBlok(undefined), null);
// Ada tapi rusak: sasaran tanpa jawaban (gagal tertutup), bukan null.
assert.deepEqual(bacaSasaranBlok({ field: "batch", values: [] }), { field: "batch", values: [] });
assert.deepEqual(bacaSasaranBlok({ field: "@lain", values: ["1"] }), { field: "", values: [] });
assert.deepEqual(bacaSasaranBlok({ field: "batch", values: [" Batch 1 ", "batch 1", ""] }), { field: "batch", values: ["Batch 1"] });
// Hotel: hanya id angka.
assert.deepEqual(bacaSasaranBlok({ field: KOLOM_HOTEL, values: [3, "4", "GRAMM", "0", "-1"] }), { field: KOLOM_HOTEL, values: ["3", "4"] });
assert.deepEqual(bacaSasaranBlok({ field: KOLOM_HOTEL, values: ["GRAMM"] }), { field: KOLOM_HOTEL, values: [] });
assert.equal(blokUntukPeserta(bacaSasaranBlok({ field: KOLOM_HOTEL, values: ["GRAMM"] }), { jawaban: {}, stays: [{ hotel_id: 1, masuk: null, keluar: null }], offset: "+07:00", kolom: [] }), false);
assert.equal(blokUntukPeserta(bacaSasaranBlok({ field: "Batch!", values: ["Batch 1"] }), { jawaban: { batch: "Batch 1" }, stays: [], offset: "+07:00", kolom: [{ key: "batch", options: ["Batch 1"] }] }), false);

assert.deepEqual(bacaTautanAgenda([5008, 5008, 0, -2, 1.5, "7", 12]), [5008, 12]);
assert.deepEqual(bacaTautanAgenda(null), []);

const kolom = [{ key: "batch", options: ["Batch 1", "Batch 2"] }];
const data = (jawaban: Record<string, unknown>, hotelId: number | null = null) => ({ jawaban, stays: hotelId === null ? [] : [{ hotel_id: hotelId, masuk: null, keluar: null }], offset: "+07:00", kolom });

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
// Jawaban yang sudah dihapus dari pilihan kolom: disembunyikan, sama dengan CMS.
assert.equal(blokUntukPeserta({ field: "batch", values: ["Batch 3"] }, data({ batch: "Batch 3" })), false);
// Hotel: cocok dengan id hotel peserta; tanpa kamar atau kamar tidak ditampilkan, disembunyikan.
const gramm = { field: KOLOM_HOTEL, values: ["1"] };
assert.equal(blokUntukPeserta(gramm, data({}, 1)), true);
assert.equal(blokUntukPeserta(gramm, data({}, 2)), false);
assert.equal(blokUntukPeserta(gramm, data({}, null)), false);

// Pindah hotel: GRAMM (1) 5-6 Nov lalu RAY (2) 6-8 Nov. Baris Agenda bertanggal
// mengikuti hotel pada tanggal itu; hari pindah cocok dengan keduanya; blok
// tanpa tanggal (Rute) cocok dengan hotel mana pun.
const pindah = {
  jawaban: {},
  stays: [
    { hotel_id: 1, masuk: "2026-11-05T07:00:00.000Z", keluar: "2026-11-06T05:00:00.000Z" },
    { hotel_id: 2, masuk: "2026-11-06T07:00:00.000Z", keluar: "2026-11-08T05:00:00.000Z" },
  ],
  offset: "+07:00",
  kolom: [],
};
const ray = { field: KOLOM_HOTEL, values: ["2"] };
assert.equal(blokUntukPeserta(ray, pindah, "2026-11-05"), false);
assert.equal(blokUntukPeserta(ray, pindah, "2026-11-06"), true);
assert.equal(blokUntukPeserta({ field: KOLOM_HOTEL, values: ["1"] }, pindah, "2026-11-06"), true);
assert.equal(blokUntukPeserta({ field: KOLOM_HOTEL, values: ["1"] }, pindah, "2026-11-07"), false);
assert.equal(blokUntukPeserta(ray, pindah), true);
assert.equal(blokUntukPeserta({ field: KOLOM_HOTEL, values: ["1"] }, pindah), true);

console.log("sasaran-blok ok");

// Editor dan portal memakai aturan jawaban yang sama (data dari impor bisa berhuruf besar).
assert.equal(samaJawaban("BATCH 1", " batch 1"), true);
assert.equal(samaJawaban("Batch 1", "Batch 2"), false);
