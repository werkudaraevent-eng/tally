import assert from "node:assert/strict";
import { bandingkanBaris, geserDalamSlot, pindahDalamSlot, susunUlangSlot, type BarisUrut } from "./rundown-urutan.ts";

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

console.log("rundown-urutan ok");
