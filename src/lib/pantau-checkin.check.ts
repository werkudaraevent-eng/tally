import assert from "node:assert/strict";
import { hitungPantau, rincianPantau, type PesertaPantau } from "./pantau-checkin.ts";
import { bacaSyaratBaris } from "./sasaran-baris.ts";

const kolom = [{ key: "batch", options: ["Batch 1", "Batch 2"] }];
const orang = (id: string, batch?: string): PesertaPantau => ({ id, data: { jawaban: batch ? { batch } : {}, stays: [], offset: "+07:00", kolom } });
const peserta = [orang("a", "Batch 1"), orang("b", "Batch 1"), orang("c", "Batch 2"), orang("d")];
const sekarang = new Date("2026-11-06T00:00:00Z");
const agenda = new Map([
  [10, { id: 10, tanggal: "2026-11-06", jam: "05:00:00", syarat: bacaSyaratBaris([{ field: "batch", values: ["Batch 1"] }]) }],
  [11, { id: 11, tanggal: "2026-11-06", jam: "06:00:00", syarat: bacaSyaratBaris([{ field: "batch", values: ["Batch 2"] }]) }],
  [12, { id: 12, tanggal: "2026-11-06", jam: "19:00:00", syarat: null }],
]);
const sesi = [
  { id: 1, name: "Gambir B1", is_active: true, sort_order: 0 },
  { id: 2, name: "Luggage", is_active: true, sort_order: 1 },
  { id: 3, name: "Souvenir", is_active: false, sort_order: 2 },
];
const checkpoints = [
  { id: 100, title: "Gala dinner", place: null, session_id: 2, item_id: null, agenda_item_ids: [12] },
  { id: 101, title: "Meet Batch 1", place: "North Hall", session_id: 1, item_id: null, agenda_item_ids: [10] },
  { id: 102, title: "ID card", place: null, session_id: null, item_id: 7, agenda_item_ids: [10, 11] },
];
const scans = [
  { kunci: 1, participant_id: "a", at: "2026-11-05T22:00:00Z" },
  { kunci: 1, participant_id: "a", at: "2026-11-05T23:55:00Z" }, // ulang: satu orang
  { kunci: 1, participant_id: "c", at: "2026-11-05T23:50:00Z" }, // Batch 2 di titik Batch 1
  { kunci: 1, participant_id: "x", at: "2026-11-05T23:59:00Z" }, // dihapus dari sumber: tidak dihitung
  { kunci: 3, participant_id: "d", at: "2026-11-05T21:00:00Z" },
];
const pickups = [{ kunci: 7, participant_id: "b", at: "2026-11-05T23:58:00Z" }];

const bahan = { sesi, checkpoints, agenda, peserta, scans, pickups, barang: new Map([[7, "ID card"]]), sekarang };
const hasil = hitungPantau(bahan);

// Urut jam Agenda, tanpa tautan di belakang.
assert.deepEqual(hasil.map((b) => b.key), ["cp-101", "cp-102", "cp-100", "sesi-3"]);

const b1 = hasil[0];
assert.equal(b1.diharapkan, 2); // a, b
assert.equal(b1.sudah, 1); // a sekali, walau dua pindaian
assert.equal(b1.lainnya, 1); // c
assert.equal(b1.terakhir, "2026-11-05T23:55:00Z"); // peserta terhapus (23:59) disaring dulu
assert.equal(b1.menurut_agenda, true);
assert.equal(b1.baru_15, 1); // c pertama 23:50; a pertama 22:00
assert.equal(b1.jam, "05:00:00");

// Barang dengan dua baris Agenda: yang melihat salah satunya (Batch 1 atau 2), jawaban kosong tidak.
const kartu = hasil[1];
assert.equal(kartu.jenis, "barang");
assert.equal(kartu.diharapkan, 3);
assert.equal(kartu.sudah, 1);
assert.equal(kartu.tempat, "ID card");

// Baris Agenda tanpa Who sees it: semua peserta aktif.
assert.equal(hasil[2].diharapkan, 4);
assert.equal(hasil[2].menurut_agenda, false);
assert.equal(hasil[2].sudah, 0);
assert.equal(hasil[2].terakhir, null);

// Sesi tanpa checkpoint: semua peserta, status sesi ikut.
assert.equal(hasil[3].nama, "Souvenir");
assert.equal(hasil[3].aktif, false);
assert.equal(hasil[3].diharapkan, 4);
assert.equal(hasil[3].sudah, 1);
assert.equal(hasil[3].tanggal, null);

// Rincian untuk panitia: angka dan orangnya cocok dengan baris ringkasan.
const r1 = rincianPantau(bahan, "cp-101");
assert.ok(r1);
assert.deepEqual(r1.sudah, [{ id: "a", at: "2026-11-05T22:00:00Z" }]); // pencatatan pertama
assert.deepEqual(r1.belum, ["b"]);
assert.deepEqual(r1.lainnya.map((isi) => isi.id), ["c"]);
const r3 = rincianPantau(bahan, "sesi-3");
assert.ok(r3);
assert.deepEqual(r3.belum, ["a", "b", "c"]);
assert.equal(r3.sudah.length, hasil[3].sudah);
assert.equal(rincianPantau(bahan, "cp-999"), null);

console.log("pantau-checkin ok");
