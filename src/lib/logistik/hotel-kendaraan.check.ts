import assert from "node:assert/strict";
import { hotelDiTrip, jumlahHotel, kelompokHotel } from "./hotel-kendaraan.ts";

const off = "+07:00";
// GRAMM (1) 5-6 Nov, lalu RAY (2) 6-8 Nov. Jam check-in 14.00, check-out 12.00 WIB.
const pindah = [
  { hotel_id: 2, masuk: "2026-11-06T07:00:00Z", keluar: "2026-11-08T05:00:00Z" },
  { hotel_id: 1, masuk: "2026-11-05T07:00:00Z", keluar: "2026-11-06T05:00:00Z" },
];
// 5 Nov 13.15 menuju hotel: malam 5 Nov di GRAMM.
assert.equal(hotelDiTrip(pindah, "2026-11-05T06:15:00Z", off), 1);
// 6 Nov 13.15 (hari pindah, sesudah check-out GRAMM): malam 6 Nov di RAY.
assert.equal(hotelDiTrip(pindah, "2026-11-06T06:15:00Z", off), 2);
// 7 Nov 08.00 ke Merapi: bangun di RAY.
assert.equal(hotelDiTrip(pindah, "2026-11-07T01:00:00Z", off), 2);
// 8 Nov 13.00 ke stasiun, sesudah check-out: hotel yang ditinggalkan.
assert.equal(hotelDiTrip(pindah, "2026-11-08T06:00:00Z", off), 2);
// 6 Nov 08.00 (hari pindah, sebelum check-out GRAMM 12.00): dijemput di GRAMM.
assert.equal(hotelDiTrip(pindah, "2026-11-06T01:00:00Z", off), 1);
// 8 Nov 10.00 ke stasiun, sebelum check-out: masih RAY.
assert.equal(hotelDiTrip(pindah, "2026-11-08T03:00:00Z", off), 2);
// Berangkat sebelum semua stay: stay paling awal.
assert.equal(hotelDiTrip(pindah, "2026-11-03T01:00:00Z", off), 1);
// Trip tanpa jam: stay pertama.
assert.equal(hotelDiTrip(pindah, null, off), 1);
// Tanpa stay.
assert.equal(hotelDiTrip([], "2026-11-06T06:15:00Z", off), null);
// Stay tanpa tanggal berlaku setiap hari.
assert.equal(hotelDiTrip([{ hotel_id: 3, masuk: null, keluar: null }], "2026-11-07T01:00:00Z", off), 3);
// Batas tanggal mengikuti zona acara: 5 Nov 23.30 WIB masih malam 5 Nov.
assert.equal(hotelDiTrip(pindah, "2026-11-05T16:30:00Z", off), 1);

const hotel: Record<string, number | null> = { a: 2, b: 2, c: 1, d: null, e: 2 };
const k = kelompokHotel(["a", "b", "c", "d", "e"], (id) => hotel[id]);
assert.deepEqual(k.map((x) => x.hotel_id), [null, 1, 2]);
assert.deepEqual(k[2].ids, ["a", "b", "e"]);
assert.equal(jumlahHotel(k), 2);
assert.equal(jumlahHotel(kelompokHotel(["a", "b"], (id) => hotel[id])), 1);
assert.equal(jumlahHotel([]), 0);
console.log("hotel-kendaraan ok");
