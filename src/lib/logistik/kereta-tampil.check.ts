import assert from "node:assert/strict";
import { legSelesai } from "./kereta-tampil.ts";

const WIB = "Asia/Jakarta";
const pergi = { depart_date: "2026-11-05", depart_time: "06:30", arrive_time: "12:10" };
// 12.10 WIB = 05.10 UTC.
assert.equal(legSelesai(pergi, WIB, new Date("2026-11-05T05:09:00Z")), false);
assert.equal(legSelesai(pergi, WIB, new Date("2026-11-05T05:10:00Z")), true);
// Kereta malam: tiba esok pagi, 04.30 WIB tanggal 6 = 21.30 UTC tanggal 5.
const malam = { depart_date: "2026-11-05", depart_time: "21:00", arrive_time: "04:30" };
assert.equal(legSelesai(malam, WIB, new Date("2026-11-05T21:29:00Z")), false);
assert.equal(legSelesai(malam, WIB, new Date("2026-11-05T21:30:00Z")), true);
// Tanpa jam tiba: jam berangkat.
assert.equal(legSelesai({ depart_date: "2026-11-08", depart_time: "10:00", arrive_time: null }, WIB, new Date("2026-11-08T03:00:00Z")), true);
// Tanpa tanggal atau jam: tidak pernah.
assert.equal(legSelesai({ depart_date: null, depart_time: "10:00", arrive_time: null }, WIB, new Date("2030-01-01T00:00:00Z")), false);
assert.equal(legSelesai({ depart_date: "2026-11-08", depart_time: null, arrive_time: null }, WIB, new Date("2030-01-01T00:00:00Z")), false);
// Zona lain (WITA, +8).
assert.equal(legSelesai(pergi, "Asia/Makassar", new Date("2026-11-05T04:10:00Z")), true);
console.log("kereta-tampil ok");
