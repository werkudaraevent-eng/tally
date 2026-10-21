import assert from "node:assert/strict";
import { faseBeranda } from "./fase-beranda.ts";

// KSO: Jumat 6 sampai Minggu 8 November, mulai 08.00 WIB.
const kso = { event_date: "2026-11-06", end_date: "2026-11-08", start_time: "08:00", end_time: "17:00", time_zone: "Asia/Jakarta" as const };
const pada = (iso: string) => Date.parse(iso);

assert.deepEqual(faseBeranda(kso, pada("2026-11-02T09:00:00+07:00"), "2026-11-02"), { fase: "sebelum", sisaHari: 4 });
// Kamis, hari ambil badge: masih sebelum acara, besok berangkat.
assert.deepEqual(faseBeranda(kso, pada("2026-11-05T10:00:00+07:00"), "2026-11-05"), { fase: "sebelum", sisaHari: 1 });
// Hari pertama sebelum jam mulai: sebelum, sisa 0.
assert.deepEqual(faseBeranda(kso, pada("2026-11-06T06:30:00+07:00"), "2026-11-06"), { fase: "sebelum", sisaHari: 0 });
assert.deepEqual(faseBeranda(kso, pada("2026-11-06T08:00:00+07:00"), "2026-11-06"), { fase: "saat", hariKe: 1, lama: 3 });
assert.deepEqual(faseBeranda(kso, pada("2026-11-07T07:30:00+07:00"), "2026-11-07"), { fase: "saat", hariKe: 2, lama: 3 });
// Hari terakhir sesudah jam selesai: masih saat (perjalanan pulang), sesudah baru esoknya.
assert.deepEqual(faseBeranda(kso, pada("2026-11-08T23:00:00+07:00"), "2026-11-08"), { fase: "saat", hariKe: 3, lama: 3 });
assert.deepEqual(faseBeranda(kso, pada("2026-11-09T00:30:00+07:00"), "2026-11-09"), { fase: "sesudah" });

// Acara sehari tanpa jam: saat sejak tengah malam, sesudah esok harinya.
const sehari = { event_date: "2026-12-01", end_date: null, start_time: null, end_time: null, time_zone: "Asia/Jakarta" as const };
assert.deepEqual(faseBeranda(sehari, pada("2026-12-01T00:10:00+07:00"), "2026-12-01"), { fase: "saat", hariKe: 1, lama: 1 });
assert.deepEqual(faseBeranda(sehari, pada("2026-11-30T23:50:00+07:00"), "2026-11-30"), { fase: "sebelum", sisaHari: 1 });
assert.deepEqual(faseBeranda(sehari, pada("2026-12-02T08:00:00+07:00"), "2026-12-02"), { fase: "sesudah" });

// Tanpa tanggal acara: tidak ada fase.
assert.equal(faseBeranda({ ...sehari, event_date: null }, pada("2026-12-01T08:00:00+07:00"), "2026-12-01"), null);

console.log("fase-beranda: ok");
