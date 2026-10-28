import assert from "node:assert/strict";
import { labelRentang, labelTanggal, malamIso, potonganStay, puncakHuni, rentangStay, stayPadaTanggal, stayPerPeserta, tanggalZona, type Stay } from "./stay.ts";

const WIB = "+07:00";
const hotelById = new Map([
  [1, { id: 1, check_in_at: "2026-11-05T07:00:00.000Z", check_out_at: "2026-11-08T05:00:00.000Z" }],
  [2, { id: 2, check_in_at: null, check_out_at: null }],
]);

// Zona acara: 23.30 UTC = besok pagi WIB.
assert.equal(tanggalZona("2026-11-05T23:30:00.000Z", WIB), "2026-11-06");

// Malam memakai jam hotel (14.00 / 12.00 WIB), atau jam bawaan bila kosong.
assert.deepEqual(malamIso(hotelById.get(1), "2026-11-06", "2026-11-08", WIB), { check_in_at: "2026-11-06T07:00:00.000Z", check_out_at: "2026-11-08T05:00:00.000Z" });
assert.deepEqual(malamIso(undefined, "2026-11-06", "2026-11-08", "+08:00"), { check_in_at: "2026-11-06T06:00:00.000Z", check_out_at: "2026-11-08T04:00:00.000Z" });

// Urut tanggal masuk; tanpa tanggal lebih dulu.
const stays: Stay[] = [
  { id: 1, participant_id: "a", hotel_id: 2, room_id: null, check_in_at: "2026-11-06T07:00:00.000Z", check_out_at: "2026-11-08T05:00:00.000Z" },
  { id: 2, participant_id: "a", hotel_id: 1, room_id: 5, check_in_at: null, check_out_at: "2026-11-06T05:00:00.000Z" },
];
assert.deepEqual(stayPerPeserta(stays, hotelById).get("a")!.map((s) => s.hotel_id), [1, 2]);

// Hari pindah berlaku untuk kedua hotel; tanpa tanggal berlaku setiap hari.
assert.equal(stayPadaTanggal("2026-11-05T07:00:00.000Z", "2026-11-06T05:00:00.000Z", "2026-11-06", WIB), true);
assert.equal(stayPadaTanggal("2026-11-06T07:00:00.000Z", "2026-11-08T05:00:00.000Z", "2026-11-06", WIB), true);
assert.equal(stayPadaTanggal("2026-11-06T07:00:00.000Z", "2026-11-08T05:00:00.000Z", "2026-11-05", WIB), false);
assert.equal(stayPadaTanggal("2026-11-05T07:00:00.000Z", "2026-11-06T05:00:00.000Z", "2026-11-07", WIB), false);
assert.equal(stayPadaTanggal(null, null, "2026-12-31", WIB), true);

// Potongan, cermin set_stay: yang lebih awal berakhir, yang lebih akhir mulai belakangan, yang di dalam dihapus.
const satu: Stay[] = [{ id: 7, participant_id: "a", hotel_id: 1, room_id: null, check_in_at: null, check_out_at: null }];
assert.deepEqual(potonganStay(satu, null, "2026-11-06T07:00:00.000Z", "2026-11-08T05:00:00.000Z", hotelById, WIB), [{ jenis: "akhir", stay_id: 7, hotel_id: 1, tanggal: "2026-11-06", sisaHilang: null }]);
assert.deepEqual(potonganStay(satu, null, "2026-11-05T07:00:00.000Z", "2026-11-06T05:00:00.000Z", hotelById, WIB), [{ jenis: "awal", stay_id: 7, hotel_id: 1, tanggal: "2026-11-06" }]);
assert.deepEqual(potonganStay(satu, null, "2026-11-04T07:00:00.000Z", "2026-11-09T05:00:00.000Z", hotelById, WIB), [{ jenis: "hapus", stay_id: 7, hotel_id: 1 }]);
// Malam baru di tengah stay lama: stay lama berakhir, malam sesudahnya hilang.
assert.deepEqual(potonganStay(satu, null, "2026-11-06T07:00:00.000Z", "2026-11-07T05:00:00.000Z", hotelById, WIB), [{ jenis: "akhir", stay_id: 7, hotel_id: 1, tanggal: "2026-11-06", sisaHilang: "2026-11-07" }]);
// Stay yang sedang diubah tidak dipotong; stay lain di hotel yang sama ikut dipotong (pindah kamar).
assert.deepEqual(potonganStay(stays, 1, "2026-11-04T07:00:00.000Z", "2026-11-05T05:00:00.000Z", hotelById, WIB), []);
const kamarPindah: Stay[] = [
  { id: 3, participant_id: "a", hotel_id: 1, room_id: 5, check_in_at: "2026-11-05T07:00:00.000Z", check_out_at: "2026-11-06T05:00:00.000Z" },
  { id: 4, participant_id: "a", hotel_id: 1, room_id: 6, check_in_at: "2026-11-06T07:00:00.000Z", check_out_at: "2026-11-08T05:00:00.000Z" },
];
assert.deepEqual(potonganStay(kamarPindah, 4, "2026-11-05T07:00:00.000Z", "2026-11-08T05:00:00.000Z", hotelById, WIB), [{ jenis: "hapus", stay_id: 3, hotel_id: 1 }]);
assert.deepEqual(potonganStay(kamarPindah, 4, "2026-11-06T07:00:00.000Z", "2026-11-08T05:00:00.000Z", hotelById, WIB), []);

// Rentang efektif: stay, lalu kamar, lalu hotel; terbalik = kosong.
assert.deepEqual(rentangStay({ check_in_at: null, check_out_at: null }, undefined, hotelById.get(1)), [Date.parse("2026-11-05T07:00:00.000Z"), Date.parse("2026-11-08T05:00:00.000Z")]);
assert.deepEqual(rentangStay({ check_in_at: null, check_out_at: null }, undefined, hotelById.get(2)), [-Infinity, Infinity]);
assert.equal(rentangStay({ check_in_at: "2026-11-09T07:00:00.000Z", check_out_at: null }, undefined, hotelById.get(1)), null);

// Puncak penghuni per malam: kamar 1208 dua tempat, A keluar 6 Nov, B dan C masuk 6 Nov.
const r = (a: string, b: string): [number, number] => [Date.parse(a), Date.parse(b)];
const a5 = r("2026-11-05T07:00:00.000Z", "2026-11-06T05:00:00.000Z");
const b6 = r("2026-11-06T07:00:00.000Z", "2026-11-08T05:00:00.000Z");
assert.equal(puncakHuni([a5], b6), 0);
assert.equal(puncakHuni([a5, b6], b6), 1);
assert.equal(puncakHuni([a5, b6], r("2026-11-05T07:00:00.000Z", "2026-11-08T05:00:00.000Z")), 1);
assert.equal(puncakHuni([a5, b6, b6], r("2026-11-04T07:00:00.000Z", "2026-11-08T05:00:00.000Z")), 2);
assert.equal(puncakHuni([[-Infinity, Infinity]], a5), 1);

assert.equal(labelTanggal("2026-11-06"), "Fri 6 Nov");
assert.equal(labelRentang("2026-11-05T07:00:00.000Z", "2026-11-06T05:00:00.000Z", WIB), "5–6 Nov");
assert.equal(labelRentang("2026-11-30T07:00:00.000Z", "2026-12-02T05:00:00.000Z", WIB), "30 Nov – 2 Dec");
assert.equal(labelRentang(null, null, WIB), null);

console.log("stay.check: ok");
