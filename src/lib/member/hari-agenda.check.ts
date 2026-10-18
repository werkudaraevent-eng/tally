import assert from "node:assert/strict";
import { kelompokkanHari, labelPembeda, menitDari, ringkasanBeranda, statusHari, tanpaLabelBagian } from "./hari-agenda.ts";

// Label pembeda: kata awal dan akhir yang sama dibuang, angka membawa kata sebelumnya.
assert.deepEqual(labelPembeda(["Jumat, 06 November 2026 (Batch 1)", "Jumat, 06 November 2026 (Batch 2)"]), ["Batch 1", "Batch 2"]);
assert.deepEqual(labelPembeda(["Hari 2 · Pagi", "Hari 2 · Sore"]), ["Pagi", "Sore"]);
assert.deepEqual(labelPembeda(["Batch 1 (Jumat)", "Batch 2 (Jumat)"]), ["Batch 1", "Batch 2"]);
assert.deepEqual(labelPembeda(["Day 2 - Hall A", "Day 2 - Hall B"]), ["Hall A", "Hall B"]);
assert.deepEqual(labelPembeda(["Pagi", "Malam"]), ["Pagi", "Malam"]);
assert.deepEqual(labelPembeda(["Ruang Utama", "Ruang Utama, Sesi Paralel"]), ["Ruang Utama", "Ruang Utama, Sesi Paralel"]);
// Kembar atau kosong: tanpa label (pemanggil memakai "Bagian 1").
assert.deepEqual(labelPembeda(["Jumat", "Jumat"]), [null, null]);
assert.deepEqual(labelPembeda(["Jumat", null]), [null, null]);
assert.deepEqual(labelPembeda(["Satu"]), [null]);

// Pengelompokan per tanggal; bagian tanpa tanggal sendiri-sendiri.
const kso = [
  { tanggal: "2026-11-05", sectionTitle: "Kamis, 05 November 2026" },
  { tanggal: "2026-11-06", sectionTitle: "Jumat, 06 November 2026 (Batch 1)" },
  { tanggal: "2026-11-06", sectionTitle: "Jumat, 06 November 2026 (Batch 2)" },
  { tanggal: "2026-11-07", sectionTitle: "Sabtu, 07 November 2026" },
  { tanggal: null, sectionTitle: "Cadangan" },
  { tanggal: null, sectionTitle: "Cadangan 2" },
];
assert.deepEqual(kelompokkanHari(kso), [
  { tanggal: "2026-11-05", bagian: [{ indeks: 0, label: null }] },
  { tanggal: "2026-11-06", bagian: [{ indeks: 1, label: "Batch 1" }, { indeks: 2, label: "Batch 2" }] },
  { tanggal: "2026-11-07", bagian: [{ indeks: 3, label: null }] },
  { tanggal: null, bagian: [{ indeks: 4, label: null }] },
  { tanggal: null, bagian: [{ indeks: 5, label: null }] },
]);

// Judul butir tanpa label bagiannya di ujung.
assert.equal(tanpaLabelBagian("Berkumpul di Stasiun Gambir (Batch 2)", "Batch 2"), "Berkumpul di Stasiun Gambir");
assert.equal(tanpaLabelBagian("Berkumpul di Stasiun Gambir (batch 2) ", "Batch 2"), "Berkumpul di Stasiun Gambir");
assert.equal(tanpaLabelBagian("Batch 2 berkumpul", "Batch 2"), "Batch 2 berkumpul");
assert.equal(tanpaLabelBagian("(Batch 2)", "Batch 2"), "(Batch 2)");
assert.equal(tanpaLabelBagian("Makan (siang)", null), "Makan (siang)");
assert.equal(tanpaLabelBagian("Sesi (A+B)", "A+B"), "Sesi");

assert.equal(menitDari("07.45"), 465);
assert.equal(menitDari("7:05"), 425);
assert.equal(menitDari("TBA"), null);

const butir = (id: number, time: string, end: string | null, title: string, jeda = false) => ({ id, time, end, title, subtitle: null, key: title, jeda });
const status = statusHari([butir(1, "06.00", "07.45", "Kumpul"), butir(2, "07.45", null, "Kereta"), butir(3, "13.50", "14.20", "Tiba")], 6 * 60 + 20);
assert.equal(status.get(1), "berlangsung");
assert.equal(status.get(2), "berikutnya");
assert.equal(status.get(3), undefined);

// Beranda: hari dengan dua batch memberi satu butir per batch, berlabel.
const agenda = [
  { tanggal: "2026-11-05", sectionTitle: "Kamis", hari: null, items: [butir(10, "19.00", "20.00", "Technical meeting")] },
  { tanggal: "2026-11-06", sectionTitle: "Jumat (Batch 1)", hari: null, items: [butir(20, "05.00", "06.20", "Berkumpul (Batch 1)"), butir(21, "06.20", "12.30", "Kereta")] },
  { tanggal: "2026-11-06", sectionTitle: "Jumat (Batch 2)", hari: null, items: [butir(30, "06.00", "07.45", "Berkumpul (Batch 2)"), butir(31, "07.45", "13.50", "Kereta")] },
  { tanggal: "2026-11-07", sectionTitle: "Sabtu", hari: null, items: [butir(40, "07.00", "08.00", "Sarapan", true), butir(41, "08.30", null, "City tour")] },
];
// Kamis malam: rapat sedang berjalan, berikutnya besok dari kedua batch.
const kamis = ringkasanBeranda(agenda, "2026-11-05", "2026-11-06", 19 * 60 + 30);
assert.deepEqual(kamis.berlangsung.map((item) => [item.item.id, item.sampai]), [[10, "20.00"]]);
assert.equal(kamis.berikutnya?.kapan, "besok");
assert.deepEqual(kamis.berikutnya?.butir.map((item) => [item.label, item.item.id, item.menitLagi]), [["Batch 1", 20, null], ["Batch 2", 30, null]]);
// Jumat 06.20: Batch 1 naik kereta (berlangsung tanpa jam selesai diketahui? ada: 12.30), Batch 2 berkumpul.
const jumat = ringkasanBeranda(agenda, "2026-11-06", "2026-11-07", 6 * 60 + 20);
assert.deepEqual(jumat.berlangsung.map((item) => [item.label, item.item.id, item.sampai]), [["Batch 1", 21, "12.30"], ["Batch 2", 30, "07.45"]]);
assert.equal(jumat.berikutnya?.kapan, "hari-ini");
assert.deepEqual(jumat.berikutnya?.butir.map((item) => [item.label, item.item.id, item.menitLagi]), [["Batch 2", 31, 85]]);
// Jumat malam: tidak ada lagi hari ini; Sabtu, lewati jeda.
const malam = ringkasanBeranda(agenda, "2026-11-06", "2026-11-07", 23 * 60);
assert.deepEqual(malam.berlangsung, []);
assert.deepEqual(malam.berikutnya?.butir.map((item) => [item.label, item.item.id]), [[null, 41]]);
assert.equal(malam.berikutnya?.kapan, "besok");
// Sesudah acara: kosong.
assert.deepEqual(ringkasanBeranda(agenda, "2026-11-09", "2026-11-10", 600), { berlangsung: [], berikutnya: null });
// Jauh sebelum acara: hari pertama, "nanti".
assert.equal(ringkasanBeranda(agenda, "2026-10-17", "2026-10-18", 600).berikutnya?.kapan, "nanti");

console.log("hari-agenda: ok");
