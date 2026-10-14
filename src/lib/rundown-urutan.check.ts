import assert from "node:assert/strict";
import { bandingkanBaris, bandingkanBagian, geserBagian, geserDalamSlot, pindahDalamSlot, susunUlangBagian, susunUlangSlot, urutBagianMenurutTanggal, type BagianUrut, type BarisUrut } from "./rundown-urutan.ts";

// Kasus ILO: End of Forum dibuat sebelum Breakout 2 dan 3.
const ilo: BarisUrut[] = [
  { id: 1, start_time: "10:40:00", sort_order: 1 },
  { id: 2, start_time: "12:00:00", sort_order: 2 },
  { id: 3, start_time: "13:00:00", sort_order: 3 }, // Breakout 1
  { id: 4, start_time: "15:30:00", sort_order: 4 }, // End of Forum
  { id: 5, start_time: "13:00:00", sort_order: 5 }, // Breakout 2
  { id: 6, start_time: "13:00:00", sort_order: 6 }, // Breakout 3
];
assert.deepEqual([...ilo].sort(bandingkanBaris).map((row) => row.id), [1, 2, 3, 5, 6, 4]);

// Breakout 3 ke posisi kedua: semua baris dinomori ulang mengikuti jadwal.
const ubah = susunUlangSlot(ilo, [3, 6, 5])!;
const hasil = ilo.map((row) => ({ ...row, sort_order: ubah.find((u) => u.id === row.id)?.sort_order ?? row.sort_order }));
assert.deepEqual([...hasil].sort(bandingkanBaris).map((row) => row.id), [1, 2, 3, 6, 5, 4]);

// Hanya baris yang nomornya berubah yang ditulis.
assert.deepEqual(susunUlangSlot(ilo, [3, 5, 6]), [{ id: 5, sort_order: 4 }, { id: 6, sort_order: 5 }, { id: 4, sort_order: 6 }]);

// sort_order kembar dari data lama tetap bisa disusun.
const kembar: BarisUrut[] = [
  { id: 10, start_time: "09:00", sort_order: 1 },
  { id: 11, start_time: "09:00", sort_order: 1 },
];
assert.deepEqual(susunUlangSlot(kembar, [11, 10]), [{ id: 10, sort_order: 2 }]);

// Ditolak: slot tidak lengkap, id asing, id dobel, campur slot, satu baris.
assert.equal(susunUlangSlot(ilo, [3, 5]), null);
assert.equal(susunUlangSlot(ilo, [3, 5, 99]), null);
assert.equal(susunUlangSlot(ilo, [3, 3, 5]), null);
assert.equal(susunUlangSlot(ilo, [3, 5, 4]), null);
assert.equal(susunUlangSlot(ilo, [4]), null);

assert.deepEqual(geserDalamSlot([3, 5, 6], 5, -1), [5, 3, 6]);
assert.deepEqual(geserDalamSlot([3, 5, 6], 5, 1), [3, 6, 5]);
assert.equal(geserDalamSlot([3, 5, 6], 3, -1), null);
assert.equal(geserDalamSlot([3, 5, 6], 6, 1), null);

assert.deepEqual(pindahDalamSlot([3, 5, 6], 6, 0), [6, 3, 5]);
assert.deepEqual(pindahDalamSlot([3, 5, 6], 3, 2), [5, 6, 3]);
assert.equal(pindahDalamSlot([3, 5, 6], 5, 1), null);

// "HH:MM" dari suntingan CMS sama dengan "HH:MM:00" dari database; detik dibedakan.
assert.equal(bandingkanBaris({ id: 1, start_time: "13:00", sort_order: 9 }, { id: 2, start_time: "13:00:00", sort_order: 1 }) > 0, true);
assert.equal(bandingkanBaris({ id: 1, start_time: "13:00:30", sort_order: 1 }, { id: 2, start_time: "13:00:00", sort_order: 9 }) > 0, true);


// ---- Bagian (tab) ----------------------------------------------------------
// Kasus KSO: tab dibuat tidak urut, Batch 1 hari Jumat dibuat paling akhir.
const kso: BagianUrut[] = [
  { id: 21, sort_order: 1, event_date: "2026-11-05", name: "Kamis, 05 November 2026" },
  { id: 22, sort_order: 2, event_date: "2026-11-06", name: "Jumat, 06 November 2026 (Batch 2)" },
  { id: 23, sort_order: 3, event_date: "2026-11-07", name: "Sabtu, 07 November 2026" },
  { id: 24, sort_order: 4, event_date: "2026-11-08", name: "Minggu, 08 November 2026 (Batch 1)" },
  { id: 25, sort_order: 5, event_date: "2026-11-06", name: "Jumat, 06 November 2026 (Batch 1)" },
];
assert.deepEqual(urutBagianMenurutTanggal(kso), [21, 25, 22, 23, 24]);
// Angka dibaca sebagai angka; tanggal dan label sama ikut urutan sekarang.
assert.deepEqual(urutBagianMenurutTanggal([
  { id: 1, sort_order: 1, event_date: "2026-11-06", name: "Batch 10" },
  { id: 2, sort_order: 2, event_date: "2026-11-06", name: "Batch 2" },
  { id: 3, sort_order: 4, event_date: "2026-11-06", name: "Sesi" },
  { id: 4, sort_order: 3, event_date: "2026-11-06", name: "sesi" },
]), [2, 1, 4, 3]);

// Hanya yang berubah ditulis; kembar dari data lama tetap bisa disusun.
assert.deepEqual(susunUlangBagian(kso, [21, 25, 22, 23, 24]), [{ id: 25, sort_order: 2 }, { id: 22, sort_order: 3 }, { id: 23, sort_order: 4 }, { id: 24, sort_order: 5 }]);
assert.deepEqual(susunUlangBagian([{ id: 1, sort_order: 0 }, { id: 2, sort_order: 0 }], [2, 1]), [{ id: 2, sort_order: 1 }, { id: 1, sort_order: 2 }]);
assert.deepEqual(susunUlangBagian(kso, [21, 22, 23, 24, 25]), []);
// Ditolak: kurang, id asing, id dobel.
assert.equal(susunUlangBagian(kso, [21, 22, 23, 24]), null);
assert.equal(susunUlangBagian(kso, [21, 22, 23, 24, 99]), null);
assert.equal(susunUlangBagian(kso, [21, 22, 23, 24, 24]), null);

assert.deepEqual(geserBagian([1, 2, 3], 3, -1), [1, 3, 2]);
assert.equal(geserBagian([1, 2, 3], 1, -1), null);
assert.deepEqual([{ id: 5, sort_order: 1 }, { id: 2, sort_order: 1 }, { id: 9, sort_order: 0 }].sort(bandingkanBagian).map((r) => r.id), [9, 2, 5]);
console.log("rundown-urutan ok");
