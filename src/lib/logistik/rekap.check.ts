import assert from "node:assert/strict";
import { geserTanggal, rekapInap, rekapKendaraan, selisihHari } from "./rekap.ts";

const off = "+07:00";
assert.equal(geserTanggal("2026-11-30", 1), "2026-12-01");
assert.equal(selisihHari("2026-11-05", "2026-11-08"), 3);

// Dua hotel bertanggal 6-8 Nov. Tamu malam pertama memakai tanggal stay sendiri.
const hotels = [
  { id: 1, name: "RAY", check_in_at: "2026-11-06T07:00:00Z", check_out_at: "2026-11-08T05:00:00Z" },
  { id: 2, name: "GRAMM", check_in_at: "2026-11-06T07:00:00Z", check_out_at: "2026-11-08T05:00:00Z" },
  { id: 3, name: "Tanpa tanggal", check_in_at: null, check_out_at: null },
];
const malam1 = { check_in_at: "2026-11-05T07:00:00Z", check_out_at: "2026-11-06T05:00:00Z" };
const lodging = [
  // a: GRAMM 5-6 kamar 10, lalu pindah ke kamar 11 GRAMM 6-8 (stay bertanggal sendiri)
  { id: 1, participant_id: "a", hotel_id: 2, room_id: 10, ...malam1 },
  { id: 2, participant_id: "a", hotel_id: 2, room_id: 11, check_in_at: "2026-11-06T07:00:00Z", check_out_at: null },
  // b: sekamar dengan a malam pertama, lalu RAY tanpa kamar
  { id: 3, participant_id: "b", hotel_id: 2, room_id: 10, ...malam1 },
  { id: 4, participant_id: "b", hotel_id: 1, room_id: null, check_in_at: "2026-11-06T07:00:00Z", check_out_at: null },
  // c, d: RAY 6-8 ikut tanggal hotel, c berkamar 20, d menunggu
  { id: 5, participant_id: "c", hotel_id: 1, room_id: 20, check_in_at: null, check_out_at: null },
  { id: 6, participant_id: "d", hotel_id: 1, room_id: null, check_in_at: null, check_out_at: null },
  // e: dihapus di sumber, tidak dihitung
  { id: 7, participant_id: "e", hotel_id: 1, room_id: 20, check_in_at: null, check_out_at: null },
  // f: hotel tanpa tanggal
  { id: 8, participant_id: "f", hotel_id: 3, room_id: null, check_in_at: null, check_out_at: null },
];
const r = rekapInap(hotels, lodging, new Set(["a", "b", "c", "d", "f"]), off);
assert.deepEqual(r.malam, ["2026-11-05", "2026-11-06", "2026-11-07"]);
const [ray, gramm, tanpa] = r.hotel;
assert.deepEqual(gramm.perMalam, [{ kamar: 1, tamu: 2, tanpaKamar: 0 }, { kamar: 1, tamu: 1, tanpaKamar: 0 }, { kamar: 1, tamu: 1, tanpaKamar: 0 }]);
assert.equal(gramm.roomNights, 3);
assert.equal(gramm.tamu, 1 + 1);
assert.deepEqual(gramm.periode.map((p) => [p.masuk, p.keluar, p.malam, p.kamar, p.tamu, p.tanpaKamar]), [
  ["2026-11-05", "2026-11-06", 1, 1, 2, 0],
  ["2026-11-06", "2026-11-08", 2, 1, 1, 0],
]);
assert.deepEqual(ray.perMalam, [{ kamar: 0, tamu: 0, tanpaKamar: 0 }, { kamar: 1, tamu: 3, tanpaKamar: 2 }, { kamar: 1, tamu: 3, tanpaKamar: 2 }]);
// b (tanggal sendiri) dan c, d (tanggal hotel) sama-sama 6-8: satu periode.
assert.deepEqual(ray.periode.map((p) => [p.masuk, p.keluar, p.kamar, p.tamu, p.tanpaKamar]), [["2026-11-06", "2026-11-08", 1, 3, 2]]);
assert.deepEqual(tanpa.periode.map((p) => [p.masuk, p.malam, p.tamu]), [[null, null, 1]]);
assert.deepEqual(tanpa.perMalam.map((m) => m.tamu), [0, 0, 0]);
assert.deepEqual(r.total.map((m) => [m.kamar, m.tamu, m.tanpaKamar]), [[1, 2, 0], [2, 4, 2], [2, 4, 2]]);
assert.equal(r.roomNights, 5);

// Tanpa stay bertanggal: tidak ada kolom malam.
assert.deepEqual(rekapInap([hotels[2]], [lodging[7]], new Set(["f"]), off).malam, []);

// Kendaraan: Trip urut jam, dikelompokkan per tanggal acara.
const trips = [
  { id: 2, name: "Jeep", depart_at: "2026-11-07T01:00:00Z", follows_default: false },
  { id: 1, name: "Ke hotel", depart_at: "2026-11-06T06:15:00Z", follows_default: true },
  { id: 3, name: "Gala", depart_at: "2026-11-06T11:00:00Z", follows_default: true },
  { id: 4, name: "Belum dijadwal", depart_at: null, follows_default: false },
];
const vehicles = [{ id: 10, code: "BUS 10", capacity: 40 }, { id: 2, code: "BUS 2", capacity: null }, { id: 9, code: "bus 9", capacity: 40 }];
const overview = [
  { trip_id: 1, vehicle_id: 10, load: 41, over_capacity: true },
  { trip_id: 1, vehicle_id: 2, load: 3, over_capacity: false },
  { trip_id: 2, vehicle_id: 9, load: 5, over_capacity: false },
];
const transport = [
  { trip_id: null, participant_id: "a", vehicle_id: 10 },
  { trip_id: 3, participant_id: "a", vehicle_id: null },
];
const k = rekapKendaraan(trips, vehicles, overview, transport, ["a", "b"], off);
assert.deepEqual(k.kendaraan.map((v) => v.code), ["BUS 2", "bus 9", "BUS 10"]);
assert.deepEqual(k.hari.map((h) => [h.tanggal, h.trips.map((t) => t.trip.id)]), [["2026-11-06", [1, 3]], ["2026-11-07", [2]], [null, [4]]]);
const keHotel = k.hari[0].trips[0];
assert.deepEqual([keHotel.total, keHotel.kendaraan, keHotel.tanpa], [44, 2, 1]);
// Gala: a sengaja "No vehicle", b tanpa kendaraan utama.
assert.equal(k.hari[0].trips[1].tanpa, 1);
// Own list tidak pernah "tanpa".
assert.equal(k.hari[1].trips[0].tanpa, 0);
assert.deepEqual(k.isi(10, 1), { load: 41, lebih: true });
assert.deepEqual(k.isi(10, 2), { load: 0, lebih: false });

console.log("rekap.check.ts OK");
