import assert from "node:assert/strict";
import { rencanaBatal, staySama, staysPerOrang, type KamarJejak, type Sebelum, type Sesudah } from "./batal-impor.ts";

// Data palsu. Hotel 1. Kamar 10 = label GH20 tanpa nomor, 11 = label GH21.
// Impor memberi GH20 nomor 1208, membuat kamar 50 (nomor 1300) untuk C,
// dan memindah A dan B ke kamar bernomor.
const k = (id: number, room_number: string | null, label: string | null): KamarJejak => ({ id, hotel_id: 1, room_number, label, room_type: null, bed_type: null, capacity: 2 });
const s = (room_id: number | null, masuk: string | null = null, keluar: string | null = null) => ({ hotel_id: 1, room_id, check_in_at: masuk, check_out_at: keluar });

const sebelum: Sebelum = {
  rooms: [k(10, null, "GH20"), k(11, null, "GH21")],
  stays: { A: [s(10)], B: [s(10)], C: [], D: [s(11)] },
};
const sesudah: Sesudah = {
  rooms: [k(10, "1208", "GH20"), k(11, "1209", "GH21")],
  stays: { A: [s(10)], B: [s(10)], C: [s(50)], D: [s(11)] },
  rooms_created: [50],
  hotels_created: [],
  rooms_deleted: [],
};

// 1. Tidak ada yang berubah sesudah impor: semua kembali.
{
  const r = rencanaBatal(sebelum, sesudah, { rooms: [...sesudah.rooms, k(50, "1300", null)], stays: sesudah.stays });
  assert.deepEqual(r.kamarKembali.map((x) => x.id).sort(), [10, 11]);
  assert.deepEqual(r.stays.map((x) => x.participant_id), ["C"], "A, B, D tidak berubah oleh impor: tidak ditulis");
  assert.deepEqual(r.stays[0].stays, []);
  assert.deepEqual(r.kamarHapus, [50]);
  assert.deepEqual(r.orangDilewati, []);
  assert.deepEqual(r.kamarDilewati, []);
  assert.deepEqual(r.duaTahap, []);
}

// 2. Sesudah impor, panitia mengganti nomor kamar 11 dan memindah C: keduanya dibiarkan.
{
  const r = rencanaBatal(sebelum, sesudah, {
    rooms: [k(10, "1208", "GH20"), k(11, "1210", "GH21"), k(50, "1300", null)],
    stays: { ...sesudah.stays, C: [s(11)] },
  });
  assert.deepEqual(r.kamarKembali.map((x) => x.id), [10]);
  assert.deepEqual(r.kamarDilewati, [11]);
  assert.deepEqual(r.orangDilewati, ["C"]);
  assert.deepEqual(r.stays, []);
}

// 3. Waktu ditulis berbeda (Z vs +00:00) dan urutan stay lain: tetap sama.
assert.ok(staySama([s(1, "2026-11-06T07:00:00Z"), s(2)], [s(2), s(1, "2026-11-06T07:00:00+00:00")]));
assert.ok(!staySama([s(1)], [s(1), s(2)]));

// 4. Label diserahkan: kamar 20 (label GH30, dibuat dialog Stays) diganti " (old)"
//    lalu dihapus karena kosong; kamar 21 (nomor 1401) mendapat label GH30.
{
  const sb: Sebelum = { rooms: [k(20, null, "GH30"), k(21, "1401", null)], stays: { E: [s(20)] } };
  const ss: Sesudah = { rooms: [k(21, "1401", "GH30")], stays: { E: [s(21)] }, rooms_created: [], hotels_created: [], rooms_deleted: [20] };
  const r = rencanaBatal(sb, ss, { rooms: [k(21, "1401", "GH30")], stays: { E: [s(21)] } });
  assert.deepEqual(r.kamarBuatLagi.map((x) => x.id), [20]);
  assert.deepEqual(r.kamarKembali.map((x) => x.id), [21]);
  assert.deepEqual(r.duaTahap, [21], "label GH30 harus dilepas kamar 21 dulu sebelum kamar 20 dibuat lagi");
  assert.deepEqual(r.stays, [{ participant_id: "E", stays: [s(20)] }]);
}

// 5. Nomor lama sudah dipakai kamar lain yang dibuat panitia sesudah impor: kamar dilewati.
{
  const r = rencanaBatal(
    { rooms: [k(30, "500", null)], stays: {} },
    { rooms: [k(30, "501", null)], stays: {}, rooms_created: [], hotels_created: [], rooms_deleted: [] },
    { rooms: [k(30, "501", null), k(31, "500", null)], stays: {} },
  );
  assert.deepEqual(r.kamarKembali, []);
  assert.deepEqual(r.kamarDilewati, [30]);
}

// 6. Kamar lama seseorang sudah dihapus panitia: orang itu dilewati.
{
  const r = rencanaBatal(
    { rooms: [], stays: { F: [s(40)] } },
    { rooms: [], stays: { F: [s(41)] }, rooms_created: [], hotels_created: [], rooms_deleted: [] },
    { rooms: [k(41, "9", null)], stays: { F: [s(41)] } },
  );
  assert.deepEqual(r.orangDilewati, ["F"]);
}

// 7. staysPerOrang: orang tanpa stay tetap ada dengan daftar kosong; nama "constructor" aman.
assert.deepEqual(staysPerOrang(["X", "constructor"], [{ participant_id: "X", hotel_id: 1, room_id: 2 }]), { X: [s(2)], constructor: [] });

console.log("batal-impor ok");
