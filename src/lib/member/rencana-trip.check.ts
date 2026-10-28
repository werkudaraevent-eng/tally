import assert from "node:assert/strict";
import { lamaPerjalanan, rencanaTrip } from "./rencana-trip.ts";
import type { LogistikKamar, LogistikKereta } from "../logistik/peserta.ts";

const teks = { trainLeg: (a: string, b: string) => `K ${a}-${b}`, checkInAt: (h: string) => `in ${h}`, moveTo: (h: string) => `pindah ${h}`, checkOutAt: (h: string) => `out ${h}`, roomOut: (k: string | null) => `keluar ${k ?? "-"}`, roomIn: (k: string | null) => `masuk lagi ${k ?? "-"}` };
const stay = (name: string, masuk: string | null, keluar: string | null): LogistikKamar => ({ hotel: { name, address: null, map_url: null }, room_number: "1", room_type: null, floor: null, check_in_at: masuk, check_out_at: keluar, roommates: null });
const kereta = (direction: "outbound" | "return", date: string | null, time: string | null): LogistikKereta => ({ direction, train_name: "Taksaka", travel_class: null, origin: direction === "outbound" ? "Gambir" : "Yogyakarta", destination: direction === "outbound" ? "Yogyakarta" : "Gambir", depart_date: date, depart_time: time, arrive_time: null, carriage: null, seat: null, booking_code: null });

// KSO: kereta 5 Nov, GRAMM 5-6, Alana 6-8, kereta pulang 8 Nov. Jam hotel dalam UTC, ditampilkan WIB.
const hasil = rencanaTrip(
  [stay("Alana", "2026-11-06T07:00:00Z", "2026-11-08T05:00:00Z"), stay("GRAMM", "2026-11-05T07:00:00Z", "2026-11-06T05:00:00Z")],
  [kereta("return", "2026-11-08", "15:30"), kereta("outbound", "2026-11-05", "06:30")],
  "Asia/Jakarta",
  teks,
);
assert.deepEqual(hasil.map((l) => [l.kunci, l.teks]), [
  ["2026-11-05 06:30", "K Gambir-Yogyakarta"],
  ["2026-11-05 14:00", "in GRAMM"],
  ["2026-11-06 14:00", "pindah Alana"],
  ["2026-11-08 12:00", "out Alana"],
  ["2026-11-08 15:30", "K Yogyakarta-Gambir"],
]);
// Pindah kamar di hotel yang sama: check-out kamar pertama, lalu check-in lagi.
const kamar = (no: string | null, masuk: string, keluar: string): LogistikKamar => ({ ...stay("Royal", masuk, keluar), room_number: no });
assert.deepEqual(rencanaTrip([kamar("1410", "2026-11-06T07:00:00Z", "2026-11-08T05:00:00Z"), kamar("1208", "2026-11-05T07:00:00Z", "2026-11-06T05:00:00Z")], [], "Asia/Jakarta", teks).map((l) => [l.kunci, l.jenis, l.teks]), [
  ["2026-11-05 14:00", "checkin", "in Royal"],
  ["2026-11-06 12:00", "checkout", "keluar 1208"],
  ["2026-11-06 14:00", "pindah", "masuk lagi 1410"],
  ["2026-11-08 12:00", "checkout", "out Royal"],
]);
assert.equal(rencanaTrip([kamar(null, "2026-11-05T07:00:00Z", "2026-11-06T05:00:00Z"), kamar(null, "2026-11-06T07:00:00Z", "2026-11-08T05:00:00Z")], [], "Asia/Jakarta", teks)[2].teks, "masuk lagi -");
// Tanpa tanggal: dilewati. Tanpa apa pun: kosong.
assert.deepEqual(rencanaTrip([stay("X", null, null)], [kereta("outbound", null, "06:30")], "Asia/Jakarta", teks), []);
assert.equal(lamaPerjalanan("06:30", "12:10"), 340);
assert.equal(lamaPerjalanan("06.30", "12.10"), 340);
assert.equal(lamaPerjalanan("22:00", "05:15"), 435);
assert.equal(lamaPerjalanan(null, "05:15"), null);
assert.equal(lamaPerjalanan("06:30", "06:30"), null);
console.log("rencana-trip.check.ts OK");
