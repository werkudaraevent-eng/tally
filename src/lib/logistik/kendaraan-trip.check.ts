import assert from "node:assert/strict";
import { kurangKendaraan, labelTripPendek, lengkapKendaraan, petaKendaraan, ringkasKendaraan, teksKendaraan } from "./kendaraan-trip.ts";

const kode = (id: number) => `BUS ${id}`;
const trips = [
  { id: 3, name: "Pulang", depart_at: "2026-11-08T06:00:00Z", follows_default: true },
  { id: 1, name: "Ke venue", depart_at: "2026-11-06T00:00:00Z", follows_default: true },
  { id: 2, name: "Jeep Merapi", depart_at: "2026-11-06T22:00:00Z", follows_default: true },
  { id: 4, name: "Golf", depart_at: "2026-11-07T01:00:00Z", follows_default: false },
];
const baca = petaKendaraan([
  // a: kendaraan utama saja (sama di semua trip yang mengikutinya)
  { trip_id: null, participant_id: "a", vehicle_id: 5 },
  // b: tanpa kendaraan utama, per trip saja; Pulang belum diisi
  { trip_id: 1, participant_id: "b", vehicle_id: 2 },
  { trip_id: 2, participant_id: "b", vehicle_id: null },
  // c: kendaraan utama + pengecualian di Jeep Merapi
  { trip_id: null, participant_id: "c", vehicle_id: 5 },
  { trip_id: 2, participant_id: "c", vehicle_id: 7 },
  // e: per trip saja, lengkap dan sama semua
  { trip_id: 1, participant_id: "e", vehicle_id: 2 },
  { trip_id: 2, participant_id: "e", vehicle_id: 2 },
  { trip_id: 3, participant_id: "e", vehicle_id: 2 },
], trips);

// Urut jam berangkat; Golf ("Own list") tidak menempatkan a, jadi "tidak".
const a = baca("a");
assert.deepEqual(a.trips.map((t) => `${t.trip.name}:${t.status}:${t.vehicle_id}`), ["Ke venue:naik:5", "Jeep Merapi:naik:5", "Golf:tidak:null", "Pulang:naik:5"]);
assert.equal(kurangKendaraan(a), false);
assert.equal(lengkapKendaraan(a), true);
// Golf ("Own list") tidak menempatkan a: diabaikan, jadi cukup satu kode.
assert.equal(teksKendaraan(a, kode), "BUS 5");

// Tanpa trip "Own list": cukup satu kode.
const tanpaGolf = petaKendaraan([{ trip_id: null, participant_id: "a", vehicle_id: 5 }], trips.filter((t) => t.id !== 4));
assert.deepEqual(ringkasKendaraan(tanpaGolf("a"), kode), { satu: "BUS 5", baris: [] });

const b = baca("b");
assert.equal(kurangKendaraan(b), true);
assert.equal(lengkapKendaraan(b), false);
assert.equal(teksKendaraan(b, kode), "Ke venue: BUS 2 · Jeep Merapi: Not riding · Pulang: No vehicle yet");

assert.equal(teksKendaraan(baca("c"), kode), "Ke venue: BUS 5 · Jeep Merapi: BUS 7 · Pulang: BUS 5");
assert.equal(kurangKendaraan(baca("c")), false);

// d: tidak ada apa pun = kurang di setiap trip yang mengikuti utama, tanpa teks kendaraan.
const d = baca("d");
assert.equal(kurangKendaraan(d), true);
assert.equal(teksKendaraan(d, kode), null);

// Tanpa Trip: persis seperti sebelumnya (kendaraan utama saja).
const polos = petaKendaraan([{ trip_id: null, participant_id: "a", vehicle_id: 5 }], []);
assert.equal(teksKendaraan(polos("a"), kode), "BUS 5");
assert.equal(kurangKendaraan(polos("a")), false);
assert.equal(kurangKendaraan(polos("x")), true);
assert.equal(teksKendaraan(polos("x"), kode), null);

// Per trip saja, sama di semua trip yang mengikuti utama (tanpa Own list): satu kode.
const ePolos = petaKendaraan([
  { trip_id: 1, participant_id: "e", vehicle_id: 2 },
  { trip_id: 2, participant_id: "e", vehicle_id: 2 },
  { trip_id: 3, participant_id: "e", vehicle_id: 2 },
], trips.filter((t) => t.id !== 4));
assert.deepEqual(ringkasKendaraan(ePolos("e"), kode), { satu: "BUS 2", baris: [] });
assert.equal(kurangKendaraan(ePolos("e")), false);

assert.equal(labelTripPendek(trips[2], "+07:00"), "7 Nov · Jeep Merapi");
assert.equal(labelTripPendek({ ...trips[2], depart_at: null }, "+07:00"), "Jeep Merapi");

// "No vehicle" yang sengaja diisi tetap tampil, meski hanya satu trip berbeda.
const f = petaKendaraan([{ trip_id: null, participant_id: "f", vehicle_id: 5 }, { trip_id: 3, participant_id: "f", vehicle_id: null }], trips);
assert.equal(teksKendaraan(f("f"), kode), "Ke venue: BUS 5 · Jeep Merapi: BUS 5 · Pulang: Not riding");
// Ditempatkan di trip Own list: ikut dirinci.
const g = petaKendaraan([{ trip_id: null, participant_id: "g", vehicle_id: 5 }, { trip_id: 4, participant_id: "g", vehicle_id: 9 }], trips);
assert.equal(teksKendaraan(g("g"), kode), "Ke venue: BUS 5 · Jeep Merapi: BUS 5 · Golf: BUS 9 · Pulang: BUS 5");

console.log("kendaraan-trip.check: ok");
