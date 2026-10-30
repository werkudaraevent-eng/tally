import assert from "node:assert/strict";
import { labelBagasi, ringkasBagasi, statusBagasi } from "./ringkas.ts";

const peta = ringkasBagasi([
  { participant_id: "a", bag_count: 2, recorded_at: "2026-11-06T02:00:00Z", photo_path: "x.jpg", handed_over_at: null },
  { participant_id: "a", bag_count: 1, recorded_at: "2026-11-05T23:00:00Z", photo_path: null, handed_over_at: "2026-11-06T09:00:00Z" },
  { participant_id: "b", bag_count: 3, recorded_at: "2026-11-06T02:00:00Z", photo_path: "y.jpg", handed_over_at: "2026-11-06T09:00:00Z" },
  { participant_id: "c", bag_count: 0, recorded_at: "2026-11-06T02:00:00Z", photo_path: null },
  // Sebelum migrasi meja ambil: kolom handed_over_at belum ada.
  { participant_id: "d", bag_count: 1, recorded_at: "2026-11-06T02:00:00Z", photo_path: null },
]);

assert.deepEqual(peta.get("a"), { bags: 3, waiting: 2, photos: 1, first: "2026-11-05T23:00:00Z" });
assert.equal(statusBagasi(peta.get("a")), "At the desk");
assert.equal(labelBagasi(peta.get("a")), "3 · At the desk");
assert.equal(labelBagasi(peta.get("b")), "3 · Handed back");
assert.equal(labelBagasi(peta.get("c")), "No luggage");
assert.equal(statusBagasi(peta.get("d")), "At the desk");
assert.equal(labelBagasi(undefined), "");
assert.equal(statusBagasi(peta.get("zzz")), "");

console.log("bagasi/ringkas OK");
