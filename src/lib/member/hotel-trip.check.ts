import assert from "node:assert/strict";
import { staySaatBerangkat } from "./hotel-trip.ts";

// Peserta pindah hotel: A 5-6 Nov, B 6-8 Nov (WIB).
const a = { nama: "A", check_in_at: "2026-11-05T07:00:00Z", check_out_at: "2026-11-06T05:00:00Z" };
const b = { nama: "B", check_in_at: "2026-11-06T07:00:00Z", check_out_at: "2026-11-08T05:00:00Z" };
const stays = [a, b];

// Perjalanan 7 Nov 08.00 berangkat dari hotel B, bukan stay pertama.
assert.equal(staySaatBerangkat(stays, "2026-11-07T01:00:00Z")?.nama, "B");
// Urutan data tidak berpengaruh.
assert.equal(staySaatBerangkat([b, a], "2026-11-07T01:00:00Z")?.nama, "B");
// 6 Nov pagi, sebelum check-out hotel A: masih A.
assert.equal(staySaatBerangkat(stays, "2026-11-06T02:00:00Z")?.nama, "A");
// 6 Nov 12.30, sudah check-out A, belum check-in B: hotel terakhir yang ditempati (A).
assert.equal(staySaatBerangkat(stays, "2026-11-06T05:30:00Z")?.nama, "A");
// 8 Nov 13.00, sesudah check-out B: B.
assert.equal(staySaatBerangkat(stays, "2026-11-08T06:00:00Z")?.nama, "B");
// Sebelum semua check-in (perjalanan stasiun -> hotel 5 Nov 13.15): stay paling awal.
assert.equal(staySaatBerangkat(stays, "2026-11-05T06:15:00Z")?.nama, "A");
// Tanpa jam berangkat, atau stay tanpa tanggal: stay pertama seperti sebelumnya.
assert.equal(staySaatBerangkat(stays, null)?.nama, "A");
assert.equal(staySaatBerangkat([{ nama: "X", check_in_at: null, check_out_at: null }], "2026-11-07T01:00:00Z")?.nama, "X");
// Tanpa stay.
assert.equal(staySaatBerangkat([], "2026-11-07T01:00:00Z"), null);

console.log("hotel-trip ok");
