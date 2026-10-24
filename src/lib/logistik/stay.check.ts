import assert from "node:assert/strict";
import { labelRentang, labelTanggal, malamIso, potonganStay, stayPadaTanggal, stayPerPeserta, tanggalZona, type Stay } from "./stay.ts";

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
  { participant_id: "a", hotel_id: 2, room_id: null, check_in_at: "2026-11-06T07:00:00.000Z", check_out_at: "2026-11-08T05:00:00.000Z" },
  { participant_id: "a", hotel_id: 1, room_id: 5, check_in_at: null, check_out_at: "2026-11-06T05:00:00.000Z" },
];
assert.deepEqual(stayPerPeserta(stays, hotelById).get("a")!.map((s) => s.hotel_id), [1, 2]);

// Hari pindah berlaku untuk kedua hotel; tanpa tanggal berlaku setiap hari.
assert.equal(stayPadaTanggal("2026-11-05T07:00:00.000Z", "2026-11-06T05:00:00.000Z", "2026-11-06", WIB), true);
assert.equal(stayPadaTanggal("2026-11-06T07:00:00.000Z", "2026-11-08T05:00:00.000Z", "2026-11-06", WIB), true);
assert.equal(stayPadaTanggal("2026-11-06T07:00:00.000Z", "2026-11-08T05:00:00.000Z", "2026-11-05", WIB), false);
assert.equal(stayPadaTanggal("2026-11-05T07:00:00.000Z", "2026-11-06T05:00:00.000Z", "2026-11-07", WIB), false);
assert.equal(stayPadaTanggal(null, null, "2026-12-31", WIB), true);

// Potongan, cermin set_stay: yang lebih awal berakhir, yang lebih akhir mulai belakangan, yang di dalam dihapus.
const satu: Stay[] = [{ participant_id: "a", hotel_id: 1, room_id: null, check_in_at: null, check_out_at: null }];
assert.deepEqual(potonganStay(satu, 2, "2026-11-06T07:00:00.000Z", "2026-11-08T05:00:00.000Z", hotelById, WIB), [{ jenis: "akhir", hotel_id: 1, tanggal: "2026-11-06", sisaHilang: null }]);
assert.deepEqual(potonganStay(satu, 2, "2026-11-05T07:00:00.000Z", "2026-11-06T05:00:00.000Z", hotelById, WIB), [{ jenis: "awal", hotel_id: 1, tanggal: "2026-11-06" }]);
assert.deepEqual(potonganStay(satu, 2, "2026-11-04T07:00:00.000Z", "2026-11-09T05:00:00.000Z", hotelById, WIB), [{ jenis: "hapus", hotel_id: 1 }]);
// Malam baru di tengah stay lama: stay lama berakhir, malam sesudahnya hilang.
assert.deepEqual(potonganStay(satu, 2, "2026-11-06T07:00:00.000Z", "2026-11-07T05:00:00.000Z", hotelById, WIB), [{ jenis: "akhir", hotel_id: 1, tanggal: "2026-11-06", sisaHilang: "2026-11-07" }]);
// Tidak bertabrakan, dan stay di hotel yang sama, tidak dipotong.
assert.deepEqual(potonganStay(stays, 1, "2026-11-04T07:00:00.000Z", "2026-11-05T05:00:00.000Z", hotelById, WIB), []);

assert.equal(labelTanggal("2026-11-06"), "Fri 6 Nov");
assert.equal(labelRentang("2026-11-05T07:00:00.000Z", "2026-11-06T05:00:00.000Z", WIB), "5–6 Nov");
assert.equal(labelRentang("2026-11-30T07:00:00.000Z", "2026-12-02T05:00:00.000Z", WIB), "30 Nov – 2 Dec");
assert.equal(labelRentang(null, null, WIB), null);

console.log("stay.check: ok");
