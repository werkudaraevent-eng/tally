import assert from "node:assert/strict";
import { rentangPerjalanan } from "./rentang-perjalanan.ts";

const kso = { mulai: "2026-11-06", selesai: "2026-11-08" };

// Batch yang tiba 5 Nov (hotel pertama 5-6, kereta berangkat 5): 5-8 Nov.
assert.deepEqual(rentangPerjalanan(kso, ["2026-11-05", "2026-11-06", "2026-11-06", "2026-11-08", "2026-11-05"]), { mulai: "2026-11-05", selesai: "2026-11-08", berbeda: true });
// Perjalanan di dalam tanggal acara: tetap tanggal acara.
assert.deepEqual(rentangPerjalanan(kso, ["2026-11-06", "2026-11-08"]), { mulai: "2026-11-06", selesai: "2026-11-08", berbeda: false });
// Data sebagian (tiket berangkat saja) tidak menyempitkan: 5-8, bukan 5 saja.
assert.deepEqual(rentangPerjalanan(kso, ["2026-11-05"]), { mulai: "2026-11-05", selesai: "2026-11-08", berbeda: true });
// Pulang sesudah acara.
assert.deepEqual(rentangPerjalanan(kso, ["2026-11-09"]), { mulai: "2026-11-06", selesai: "2026-11-09", berbeda: true });
// Tanpa data peserta, atau tanggal rusak: tanggal acara.
assert.deepEqual(rentangPerjalanan(kso, []), { mulai: "2026-11-06", selesai: "2026-11-08", berbeda: false });
assert.deepEqual(rentangPerjalanan(kso, [null, undefined, "", "5 Nov", "2026-11-5"]), { mulai: "2026-11-06", selesai: "2026-11-08", berbeda: false });
// Acara satu hari (tanpa end_date atau end_date sebelum mulai).
assert.deepEqual(rentangPerjalanan({ mulai: "2026-11-06", selesai: null }, ["2026-11-05"]), { mulai: "2026-11-05", selesai: "2026-11-06", berbeda: true });
assert.deepEqual(rentangPerjalanan({ mulai: "2026-11-06", selesai: "2026-11-01" }, []), { mulai: "2026-11-06", selesai: "2026-11-06", berbeda: false });
// Acara tanpa tanggal: tidak ada rentang (kartu tanpa tanggal seperti sebelumnya).
assert.equal(rentangPerjalanan({ mulai: null, selesai: null }, ["2026-11-05"]), null);

console.log("rentang-perjalanan ok");
