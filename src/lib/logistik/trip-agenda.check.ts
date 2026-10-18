import assert from "node:assert/strict";
import {
  AMBANG_PERINGATAN, cocokCari, daftarNama, durasi, hariPendek, hrefBarisAgenda, hrefTrip, jamBerangkatBaru, jamDariMenit, jamPendek, kalimatHapus,
  kapanBerangkat, keteranganTrip, namaMirip, petaAgenda, petunjukBerangkat, selisihMenit, tanggalGanda, teksBaris,
} from "./trip-agenda.ts";

// Tanggal staf en-GB, sama di server, peramban, dan Node.
assert.equal(hariPendek("2026-11-05"), "Thu 5 Nov");
assert.equal(hariPendek("2026-11-06"), "Fri 6 Nov");
assert.equal(hariPendek("2026-11-08"), "Sun 8 Nov");
assert.equal(hariPendek("2027-01-01"), "Fri 1 Jan");
// September "Sept", sama dengan Intl en-GB di kolom Departs daftar trip.
assert.equal(hariPendek("2026-09-09"), "Wed 9 Sept");
assert.equal(hariPendek("bukan tanggal"), "bukan tanggal");
assert.equal(jamPendek("14:20:00"), "14:20");
assert.equal(jamPendek("7:05"), "07:05");
assert.equal(teksBaris("2026-11-06", "14:20:00", " Perjalanan Menuju Hotel "), "Fri 6 Nov, 14:20 Perjalanan Menuju Hotel");

// Durasi.
assert.equal(durasi(45), "45 min");
assert.equal(durasi(-90), "1 h 30 min");
assert.equal(durasi(720), "12 h");
assert.equal(durasi(1440), "1 day");
assert.equal(durasi(1485), "1 day 45 min");
assert.equal(durasi(2880), "2 days");
assert.equal(durasi(0), "0 min");

// Selisih: positif = bus berangkat sebelum baris.
assert.equal(selisihMenit("2026-11-07T07:45", "2026-11-07", "08:30:00"), 45);
assert.equal(selisihMenit("2026-11-06T18:00", "2026-11-06", "17:30"), -30);
assert.equal(selisihMenit("2026-11-06T23:45", "2026-11-07", "00:30:00"), 45);
assert.equal(selisihMenit("", "2026-11-07", "08:30:00"), null);
assert.equal(selisihMenit("2026-11-07T07:45", "2026-11-07", "TBA"), null);

// Petunjuk Departs (gambar 2 dan 3).
assert.deepEqual(petunjukBerangkat("2026-11-06T14:20", "2026-11-06", "14:20:00"), { jenis: "petunjuk", teks: "Moves with the agenda row when its time or day changes." });
assert.deepEqual(petunjukBerangkat("2026-11-07T07:45", "2026-11-07", "08:30:00"), { jenis: "petunjuk", teks: "45 min before the agenda row (08:30). Moves with it." });
assert.deepEqual(petunjukBerangkat("2026-11-06T18:00", "2026-11-06", "17:30:00"), { jenis: "petunjuk", teks: "30 min after the agenda row starts (17:30). Moves with it." });
assert.deepEqual(petunjukBerangkat("2026-11-06T10:00", "2026-11-06", "08:30:00"), { jenis: "petunjuk", teks: "1 h 30 min after the agenda row starts (08:30). Moves with it." });
// Lewat tengah malam tetap petunjuk biasa: bus 23:45 untuk baris 00:30.
assert.deepEqual(petunjukBerangkat("2026-11-06T23:45", "2026-11-07", "00:30:00"), { jenis: "petunjuk", teks: "45 min before the agenda row (00:30). Moves with it." });
// Tepat di bawah ambang: masih petunjuk.
assert.equal(petunjukBerangkat("2026-11-08T00:46", "2026-11-08", "12:45:00")?.jenis, "petunjuk");
assert.equal(AMBANG_PERINGATAN, 720);

// Peringatan tanggal beda (gambar 4): tanggal pindah, jam tetap.
assert.deepEqual(petunjukBerangkat("2026-11-06T07:45", "2026-11-07", "08:30:00"), {
  jenis: "peringatan",
  teks: "1 day before the agenda row (Sat 7 Nov, 08:30). Check the date.",
  tombol: "Move to Sat 7 Nov",
  nilai: "2026-11-07T07:45",
});
assert.deepEqual(petunjukBerangkat("2026-11-09T08:30", "2026-11-07", "08:30:00"), {
  jenis: "peringatan",
  teks: "2 days after the agenda row (Sat 7 Nov, 08:30). Check the date.",
  tombol: "Move to Sat 7 Nov",
  nilai: "2026-11-07T08:30",
});
// Peringatan hari sama (gambar 4b): salah AM/PM tepat 12 jam, pakai jam baris.
assert.deepEqual(petunjukBerangkat("2026-11-08T00:45", "2026-11-08", "12:45:00"), {
  jenis: "peringatan",
  teks: "12 h before the agenda row (Sun 8 Nov, 12:45). Check the time.",
  tombol: "Use the row's time",
  nilai: "2026-11-08T12:45",
});
assert.equal(petunjukBerangkat("2026-11-08T12:45", "2026-11-08", "00:45:00")?.teks, "12 h after the agenda row (Sun 8 Nov, 00:45). Check the time.");
// Dekat tengah malam, geseran tanggal dihitung dari jaraknya: bus 23:30 untuk
// baris Minggu 00:15 diketik sehari terlalu awal, jadi pindah ke Sabtu 23:30
// (45 menit sebelum baris), bukan ke Minggu 23:30 (sesudah barisnya).
assert.deepEqual(petunjukBerangkat("2026-11-06T23:30", "2026-11-08", "00:15:00"), {
  jenis: "peringatan",
  teks: "1 day before the agenda row (Sun 8 Nov, 00:15). Check the date.",
  tombol: "Move to Sat 7 Nov",
  nilai: "2026-11-07T23:30",
});
assert.deepEqual(petunjukBerangkat("2026-11-07T23:30", "2026-11-08", "00:15:00"), { jenis: "petunjuk", teks: "45 min before the agenda row (00:15). Moves with it." });
// Geseran tanggal yang melempar bus ke sisi lain baris tidak ditawarkan: bus
// malam 20:00 untuk baris 08:30 esok hari memakai jam baris.
assert.deepEqual(petunjukBerangkat("2026-11-06T20:00", "2026-11-07", "08:30:00"), {
  jenis: "peringatan",
  teks: "12 h 30 min before the agenda row (Sat 7 Nov, 08:30). Check the time.",
  tombol: "Use the row's time",
  nilai: "2026-11-07T08:30",
});
// Sisa tepat 12 jam sesudah digeser masih peringatan: jam baris, bukan tanggal.
assert.deepEqual(petunjukBerangkat("2026-11-08T20:30", "2026-11-07", "08:30:00"), {
  jenis: "peringatan",
  teks: "1 day 12 h after the agenda row (Sat 7 Nov, 08:30). Check the time.",
  tombol: "Use the row's time",
  nilai: "2026-11-07T08:30",
});
// Departs kosong atau tak terbaca: tidak ada petunjuk.
assert.equal(petunjukBerangkat("", "2026-11-08", "12:45:00"), null);

// Panel detail trip dan catatan Agenda.
assert.equal(keteranganTrip(0), "Departs at the row's start time and moves with it.");
assert.equal(keteranganTrip(45), "Departs 45 min before this row and moves with it.");
assert.equal(keteranganTrip(-30), "Departs 30 min after this row starts and moves with it.");
assert.equal(kapanBerangkat("07:45", 45), "leaves at 07:45, 45 min before this item, and moves with it.");
assert.equal(kapanBerangkat("17:30", -30), "leaves at 17:30, 30 min after this item starts, and moves with it.");
assert.equal(kapanBerangkat("08:30", 0), "leaves with this item, at 08:30, and moves with it.");

// Jam bus ikut jam baris yang belum disimpan: selisihnya tetap.
assert.equal(jamBerangkatBaru("09:00", 45), "08:15");
assert.equal(jamBerangkatBaru("00:30:00", 45), "23:45");
assert.equal(jamBerangkatBaru("", 45), null);
assert.equal(jamDariMenit(-15), "23:45");
assert.equal(jamDariMenit(1440 + 60), "01:00");

// Nama yang mirip trip lain: sama, atau diawali nama ini. Satu-dua huruf baru
// dihitung sampai batas kata.
const lain = ["Perjalanan Menuju Hotel (Batch 1)", " City Tour ", "Hotel ke Bandara YIA"];
assert.equal(namaMirip("Perjalanan Menuju Hotel", lain), "Perjalanan Menuju Hotel (Batch 1)");
assert.equal(namaMirip("perjalanan", lain), "Perjalanan Menuju Hotel (Batch 1)");
assert.equal(namaMirip("city tour", lain), "City Tour");
assert.equal(namaMirip("P", lain), null);
assert.equal(namaMirip("Pe", lain), null);
assert.equal(namaMirip("Perjalanan Menuju Hotel (Batch 2)", lain), null);
assert.equal(namaMirip("  ", lain), null);
assert.equal(namaMirip("City Tour", ["City Tours"]), "City Tours");
assert.equal(namaMirip("Perjalanan Menuju Hotel", ["Perjalanan Menuju Hotel2"]), "Perjalanan Menuju Hotel2");
assert.equal(namaMirip("Ke", ["Ke hotel"]), "Ke hotel");

// Cari jam atau judul.
assert.equal(cocokCari("menuju hotel", "13:00:00", "Perjalanan Menuju Hotel"), true);
assert.equal(cocokCari("08.30", "08:30:00", "City Tour"), true);
assert.equal(cocokCari("13:00 perj", "13:00:00", "Perjalanan Menuju Hotel"), true);
assert.equal(cocokCari("gala", "13:00:00", "Perjalanan Menuju Hotel"), false);
assert.equal(cocokCari(" ", "13:00:00", "Apa saja"), true);

// Kelompok per tab: urut tab Agenda, lalu jam mulai; tab tanpa baris dibuang.
const bagian = [
  { id: 102, name: "Jumat (Batch 1)", event_date: "2026-11-06", is_published: true, sort_order: 2 },
  { id: 101, name: "Kamis", event_date: "2026-11-05", is_published: false, sort_order: 1 },
  { id: 103, name: "Jumat (Batch 2)", event_date: "2026-11-06", is_published: true, sort_order: 3 },
  { id: 104, name: "Kosong", event_date: "2026-11-07", is_published: true, sort_order: 4 },
];
const baris = [
  { id: 1006, section_id: 102, start_time: "13:00:00", title: "Perjalanan Menuju Hotel", is_published: true, sort_order: 2 },
  { id: 1005, section_id: 102, start_time: "12:30:00", title: "Berkumpul", is_published: false, sort_order: 9 },
  { id: 1001, section_id: 101, start_time: "19:00:00", title: "Technical Meeting", is_published: true, sort_order: 1 },
  { id: 1014, section_id: 103, start_time: "14:20:00", title: "Perjalanan Menuju Hotel", is_published: true, sort_order: 1 },
  { id: 9999, section_id: 555, start_time: "10:00:00", title: "Tab lain", is_published: true, sort_order: 1 },
];
const peta = petaAgenda(bagian, baris);
assert.deepEqual(peta.kelompok.map((isi) => [isi.bagian.id, isi.baris.map((item) => item.id)]), [[101, [1001]], [102, [1005, 1006]], [103, [1014]]]);
assert.equal(peta.jumlah, 4);
assert.equal(peta.baris.get(1014)?.bagian.name, "Jumat (Batch 2)");
assert.equal(peta.baris.get(9999), undefined);
assert.equal(tanggalGanda(bagian, "2026-11-06"), true);
assert.equal(tanggalGanda(bagian, "2026-11-05"), false);

// Tautan antarlayar.
assert.equal(hrefBarisAgenda({ baris: { id: 1006 }, bagian: { id: 102 } }), "/admin/rundown?section=102&item=1006");
assert.equal(hrefBarisAgenda(null), "/admin/rundown");
assert.equal(hrefTrip(7), "/admin/logistik?tab=bus&trip=7");

// Dialog hapus Agenda.
assert.equal(daftarNama(["A", "B", "C"]), "A, B and C");
assert.equal(kalimatHapus([]), "");
assert.equal(kalimatHapus(["City Tour Yogyakarta"]), "Bus trip City Tour Yogyakarta keeps its time and is no longer linked.");
assert.equal(kalimatHapus(["Ke hotel", "Ke bandara"]), "Bus trips Ke hotel and Ke bandara keep their time and are no longer linked.");

console.log("trip-agenda: ok");
