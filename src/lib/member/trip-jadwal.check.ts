import assert from "node:assert/strict";
import { pencocokBarisTrip } from "./trip-jadwal.ts";

// Jam dinding WIB (+07:00, tanpa DST) dari ISO.
const wib = (iso: string) => {
  const waktu = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return { tanggal: waktu.toISOString().slice(0, 10), menit: waktu.getUTCHours() * 60 + waktu.getUTCMinutes() };
};

// KSO Jumat: Batch 1 dan Batch 2 punya baris "Perjalanan Menuju Hotel" sendiri.
const batch1 = { id: 1006, time: "13.00" };
const batch2Sama = { id: 1013, time: "13.00" };
const batch2 = { id: 1014, time: "14.20" };
const gala = { id: 1020, time: "19.00" };

// Trip tertaut menunjuk barisnya lewat id saja: baris Batch 2 di jam yang sama tidak ikut.
const tertaut = pencocokBarisTrip([{ bus: "Bus 1", depart_at: "2026-11-06T13:00:00+07:00", rundown_item_id: 1006 }], wib);
assert.equal(tertaut("2026-11-06", batch1), true);
assert.equal(tertaut("2026-11-06", batch2Sama), false);
assert.equal(tertaut("2026-11-06", batch2), false);
// Bus 45 menit sebelum barisnya tetap menautkan baris itu.
const lebihAwal = pencocokBarisTrip([{ bus: "Bus 2", depart_at: "2026-11-06T18:15:00+07:00", rundown_item_id: 1020 }], wib);
assert.equal(lebihAwal("2026-11-06", gala), true);
// Trip tertaut tanpa jam berangkat tetap menautkan barisnya.
assert.equal(pencocokBarisTrip([{ bus: "Bus 2", depart_at: null, rundown_item_id: 1020 }], wib)("2026-11-06", gala), true);

// Trip tanpa tautan (dan data sebelum migrasi, tanpa kunci rundown_item_id): tanggal dan jam yang sama, seperti sebelumnya.
const lama = pencocokBarisTrip([{ bus: "Bus 1", depart_at: "2026-11-06T06:00:00Z" }, { bus: "Bus 3", depart_at: "2026-11-06T14:20:00+07:00", rundown_item_id: null }], wib);
assert.equal(lama("2026-11-06", batch1), true);
assert.equal(lama("2026-11-06", batch2Sama), true);
assert.equal(lama("2026-11-06", batch2), true);
assert.equal(lama("2026-11-07", batch1), false);
assert.equal(lama(null, batch1), false);

// Peserta tanpa bus di perjalanan itu: tidak ditautkan.
const tanpaBus = pencocokBarisTrip([{ bus: null, depart_at: "2026-11-06T13:00:00+07:00", rundown_item_id: 1006 }, { bus: null, depart_at: "2026-11-06T14:20:00+07:00" }], wib);
assert.equal(tanpaBus("2026-11-06", batch1), false);
assert.equal(tanpaBus("2026-11-06", batch2), false);

console.log("trip-jadwal: ok");
