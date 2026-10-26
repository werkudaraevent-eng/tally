import assert from "node:assert/strict";
import { bacaSyaratBaris, barisUntukPeserta, labelAgendaPublik, SYARAT_MAX, syaratTanpaPeserta } from "./sasaran-baris.ts";
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
const data = (jawaban: Record<string, unknown>, hotelId: number | null = null) => ({ jawaban, stays: hotelId === null ? [] : [{ hotel_id: hotelId, masuk: null, keluar: null }], offset: "+07:00", kolom });

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

// Hotel ikut tanggal baris: GRAMM (7) sampai 6 Nov, RAY (8) dari 6 Nov.
const pindah = {
  jawaban: { batch: "Batch 2" },
  stays: [
    { hotel_id: 7, masuk: null, keluar: "2026-11-06T05:00:00.000Z" },
    { hotel_id: 8, masuk: "2026-11-06T07:00:00.000Z", keluar: null },
  ],
  offset: "+07:00",
  kolom,
};
assert.equal(barisUntukPeserta(b2Gramm, pindah, "2026-11-05"), true);
assert.equal(barisUntukPeserta(b2Gramm, pindah, "2026-11-07"), false);
assert.equal(barisUntukPeserta(bacaSyaratBaris([{ field: KOLOM_HOTEL, values: ["8"] }]), pindah, "2026-11-07"), true);

console.log("sasaran-baris ok");

// Label di halaman acara sebelum masuk: hanya kolom yang diizinkan, hanya jawaban.
{
  const kolomLabel = [
    { key: "batch", options: ["Batch 1", "Batch 2"], label_agenda: true },
    { key: "vip", options: ["VIP", "Reguler"], label_agenda: false },
  ];
  assert.equal(labelAgendaPublik(null, kolomLabel), null);
  assert.equal(labelAgendaPublik(bacaSyaratBaris([{ field: "batch", values: ["batch 1"] }]), kolomLabel), "Batch 1");
  assert.equal(labelAgendaPublik(bacaSyaratBaris([{ field: "batch", values: ["Batch 1", "Batch 2"] }]), kolomLabel), "Batch 1 / Batch 2");
  // Kolom tanpa izin (mis. khusus staf): tanpa label, juga bila syarat lain diizinkan.
  assert.equal(labelAgendaPublik(bacaSyaratBaris([{ field: "vip", values: ["VIP"] }]), kolomLabel), null);
  assert.equal(labelAgendaPublik(bacaSyaratBaris([{ field: "batch", values: ["Batch 1"] }, { field: "vip", values: ["VIP"] }]), kolomLabel), null);
  // Hotel tidak pernah menjadi label; jawaban yang sudah dihapus tidak ditulis.
  assert.equal(labelAgendaPublik(bacaSyaratBaris([{ field: KOLOM_HOTEL, values: ["7"] }]), kolomLabel), null);
  assert.equal(labelAgendaPublik(bacaSyaratBaris([{ field: "batch", values: ["Batch 9", "Batch 2"] }]), kolomLabel), "Batch 2");
  assert.equal(labelAgendaPublik(bacaSyaratBaris([{ field: "hilang", values: ["X"] }]), kolomLabel), null);

  // Syarat yang tidak cocok dengan siapa pun tetap tersembunyi sebelum masuk.
  assert.equal(syaratTanpaPeserta(null, kolomLabel), false);
  assert.equal(syaratTanpaPeserta(bacaSyaratBaris([]), kolomLabel), true);
  assert.equal(syaratTanpaPeserta(bacaSyaratBaris([{ field: "batch", values: [] }]), kolomLabel), true);
  assert.equal(syaratTanpaPeserta(bacaSyaratBaris([{ field: "hilang", values: ["X"] }]), kolomLabel), true);
  assert.equal(syaratTanpaPeserta(bacaSyaratBaris([{ field: "batch", values: ["Batch 9"] }]), kolomLabel), true);
  assert.equal(syaratTanpaPeserta(bacaSyaratBaris([{ field: "batch", values: ["Batch 9", "Batch 2"] }]), kolomLabel), false);
  assert.equal(syaratTanpaPeserta(bacaSyaratBaris([{ field: KOLOM_HOTEL, values: ["7"] }]), kolomLabel), false);
  // Hotel yang sudah dihapus dari Logistics: tidak cocok dengan siapa pun.
  assert.equal(syaratTanpaPeserta(bacaSyaratBaris([{ field: KOLOM_HOTEL, values: ["7"] }]), kolomLabel, new Set(["8"])), true);
  assert.equal(syaratTanpaPeserta(bacaSyaratBaris([{ field: KOLOM_HOTEL, values: ["7", "8"] }]), kolomLabel, new Set(["8"])), false);
  assert.equal(syaratTanpaPeserta(bacaSyaratBaris([{ field: KOLOM_HOTEL, values: ["7"] }]), kolomLabel, new Set()), true);
  assert.equal(syaratTanpaPeserta(bacaSyaratBaris([{ field: "vip", values: ["VIP"] }]), kolomLabel), false);
}
