import assert from "node:assert/strict";
import { ringkasReset } from "./reset-check-in.ts";

const hasil = ringkasReset(
  [
    { session_id: 900, scanned_at: "2026-10-19T07:31:00Z" },
    { session_id: 901, scanned_at: "2026-10-19T07:28:00Z" },
    { session_id: 900, scanned_at: "2026-10-19T07:27:00Z" },
  ],
  [{ item_id: 700, session_id: 900, size: "L" }, { item_id: 799, session_id: null, size: null }],
  new Map([[700, "Badge ID"]]),
);

// Scan pertama adalah yang paling awal, bukan yang pertama terbaca.
assert.deepEqual(hasil.scans, [
  { session_id: 900, count: 2, first: "2026-10-19T07:27:00Z" },
  { session_id: 901, count: 1, first: "2026-10-19T07:28:00Z" },
]);
// Barang yang namanya sudah tidak ada tetap disebut, bukan dilewati.
assert.deepEqual(hasil.pickups, [
  { item: "Badge ID", size: "L", session_id: 900 },
  { item: "Kit item", size: null, session_id: null },
]);
assert.deepEqual(ringkasReset([], [], new Map()), { scans: [], pickups: [] });

console.log("reset-check-in.check: ok");
