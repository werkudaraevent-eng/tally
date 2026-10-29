import assert from "node:assert/strict";
import { hariDressCode, ringkasanHariDressCode, type BarisDressCode, type TabDressCode } from "./dress-code-publik.ts";

const tab = (id: number, event_date: string | null, outfit: unknown, is_published = true, show_before_sign_in?: boolean): TabDressCode => ({ id, name: `Tab ${id}`, title: null, event_date, is_published, show_before_sign_in, outfit });
const baris = (id: number, section_id: number, is_published = true, title: string | null = "Gala Dinner"): BarisDressCode => ({ id, section_id, title, is_published });

const tabs = [
  tab(1, "2026-11-05", [{ what: "Kaos KSO" }]),
  tab(2, "2026-11-06", [
    { item_id: 20, when: "17.30 Gala Dinner", what: "Colonial Elegance", options: [{ name: "Priyayi Jawa" }] },
    { what: "Casual" },
    { item_id: 21, when: "20.00 Rapat panitia", what: "Seragam rahasia" },
  ]),
  // Batch 2 di tanggal yang sama: tab sendiri dengan nomornya sendiri di agenda.
  tab(3, "2026-11-06", [{ what: "Polo biru" }]),
  tab(4, "2026-11-07", [{ what: "Draf" }], false),
  tab(5, "2026-11-08", []),
  tab(6, null, [{ what: "Tanpa tanggal" }]),
  // Show before sign-in mati: hari ini disembunyikan agenda publik, jadi dress code-nya juga.
  tab(10, "2026-11-07", [{ what: "Kostum kejutan" }], true, false),
];
const semuaBaris = [baris(20, 2), baris(21, 2, false), baris(22, 3)];

// Nomor dari Susunan acara halaman yang sama (urutan tab yang ditampilkan agenda).
const hasil = hariDressCode(tabs, semuaBaris, null, new Map([[2, 2], [3, 3], [1, 1]]));
// Tab draf dan tab tanpa dress code tidak tampil.
assert.deepEqual(hasil.map((hari) => hari.id), [1, 2, 3, 6]);
// Tab yang tidak ada di agenda publik tidak bernomor.
assert.deepEqual(hasil.map((hari) => hari.nomor), [1, 2, 3, null]);
// Dipilih pun, hari yang tidak tampil sebelum masuk tetap tidak tampil.
assert.deepEqual(hariDressCode(tabs, semuaBaris, [10]), []);
// Seharian di depan; isian ke baris yang disembunyikan dibuang; item_id tidak dikirim.
assert.deepEqual(hasil[1].isian, [
  { what: "Casual" },
  { when: "17.30 Gala Dinner", what: "Colonial Elegance", options: [{ name: "Priyayi Jawa" }] },
]);
// Isian ke baris yang tidak ada di tab itu (salinan acara) juga dibuang.
assert.deepEqual(hariDressCode([tab(7, null, [{ item_id: 22, what: "Salah tab" }])], semuaBaris), []);
// Baris tanpa judul dibuang, seperti agenda publik.
assert.deepEqual(hariDressCode([tab(8, null, [{ item_id: 30, what: "X" }])], [baris(30, 8, true, " ")]), []);
// Pilihan hari: hanya tab itu; kosong = semua.
assert.deepEqual(hariDressCode(tabs, semuaBaris, [3, 4]).map((hari) => hari.id), [3]);
assert.deepEqual(hariDressCode(tabs, semuaBaris, []).map((hari) => hari.id), [1, 2, 3, 6]);
// Kolom rusak tidak menggagalkan halaman.
assert.deepEqual(hariDressCode([tab(9, null, "bukan daftar")], []), []);

assert.equal(ringkasanHariDressCode(undefined), "All days with a dress code");
assert.equal(ringkasanHariDressCode([4]), "1 day");
assert.equal(ringkasanHariDressCode([4, 5]), "2 days");

console.log("dress-code-publik.check: ok");
