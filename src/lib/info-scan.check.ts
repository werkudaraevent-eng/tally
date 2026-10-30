import assert from "node:assert/strict";
import { bacaInfoScan, barisInfo, hotelPadaTanggal, infoBerlaku, kendaraanPadaTanggal, keretaPadaTanggal, pilihanInfo } from "./info-scan.ts";

const WIB = "+07:00";

// Daftar tersimpan dibaca aman.
assert.equal(bacaInfoScan(null), null);
assert.equal(bacaInfoScan("base:company"), null);
assert.deepEqual(bacaInfoScan([]), []);
assert.deepEqual(bacaInfoScan(["base:company", "base:company", "x:y", 3, "extra:batch", "logistik:hotel", "base:title", "extra:kota"]), ["base:company", "extra:batch", "logistik:hotel", "base:title"]);

// Pilihan dari data acara: email, telepon, dan berkas tidak ditawarkan; logistik hanya yang ada.
const pilihan = pilihanInfo(
  [
    { key: "batch", label: "Batch", type: "select" },
    { key: "surel_kantor", label: "Email kantor", type: "email" },
    { key: "wa", label: "WhatsApp", type: "tel" },
    { key: "ktp", label: "KTP", type: "file" },
    { key: "alergi", label: "Alergi", type: "text", on_form: false },
  ],
  { hotel: true, vehicle: true, train: false },
);
assert.deepEqual(pilihan.map((p) => p.kunci), ["base:company", "base:title", "base:participant_type", "logistik:hotel", "logistik:vehicle", "extra:batch", "extra:alergi"]);
assert.equal(pilihan.find((p) => p.kunci === "extra:alergi")?.khususPanitia, true);

// Pertanyaan yang dihapus hilang sendiri, urutan tersimpan dipertahankan.
assert.deepEqual(infoBerlaku(["extra:dihapus", "logistik:hotel", "base:company"], pilihan).map((p) => p.label), ["Hotel", "Company"]);

// Hotel pada tanggal scan, termasuk hari pindah hotel.
const stays = [
  { hotel: { name: "GRAMM" }, room_number: "301", check_in_at: "2026-11-05T07:00:00Z", check_out_at: "2026-11-06T05:00:00Z" },
  { hotel: { name: "The Ray" }, room_number: null, check_in_at: "2026-11-06T07:00:00Z", check_out_at: "2026-11-08T05:00:00Z" },
];
assert.equal(hotelPadaTanggal(stays, new Date("2026-11-05T03:00:00Z"), WIB), "GRAMM · Room 301");
assert.equal(hotelPadaTanggal(stays, new Date("2026-11-06T02:00:00Z"), WIB), "GRAMM · Room 301 → The Ray · room to follow");
assert.equal(hotelPadaTanggal(stays, new Date("2026-11-07T02:00:00Z"), WIB), "The Ray · room to follow");
assert.equal(hotelPadaTanggal(stays, new Date("2026-11-01T02:00:00Z"), WIB), "GRAMM · Room 301");
assert.equal(hotelPadaTanggal(stays, new Date("2026-11-20T02:00:00Z"), WIB), "The Ray · room to follow");
assert.equal(hotelPadaTanggal([], new Date(), WIB), null);
// 00.30 WIB tanggal 8 masih 7 Nov di UTC: tanggal ikut zona acara, jadi stay yang check-out 8 Nov tetap berlaku.
assert.equal(hotelPadaTanggal(stays, new Date("2026-11-07T17:30:00Z"), WIB), "The Ray · room to follow");

// Kendaraan pada tanggal scan.
const transport = {
  default_bus: "Bus 1",
  trips: [
    { name: "Airport → Hotel", depart_at: "2026-11-06T02:00:00Z", bus: "Bus 3" },
    { name: "Hotel → Gala", depart_at: "2026-11-06T11:00:00Z", bus: "Bus 5" },
    { name: "Tanpa bus", depart_at: "2026-11-06T12:00:00Z", bus: null },
  ],
};
assert.equal(kendaraanPadaTanggal(transport, new Date("2026-11-06T01:00:00Z"), WIB), "Bus 3 · Airport → Hotel");
assert.equal(kendaraanPadaTanggal(transport, new Date("2026-11-06T02:20:00Z"), WIB), "Bus 3 · Airport → Hotel");
assert.equal(kendaraanPadaTanggal(transport, new Date("2026-11-06T05:00:00Z"), WIB), "Bus 5 · Hotel → Gala");
assert.equal(kendaraanPadaTanggal(transport, new Date("2026-11-06T14:00:00Z"), WIB), "Bus 5 · Hotel → Gala");
assert.equal(kendaraanPadaTanggal(transport, new Date("2026-11-07T02:00:00Z"), WIB), "Bus 1");
assert.equal(kendaraanPadaTanggal(null, new Date(), WIB), null);

// Kereta.
const trains = [
  { direction: "outbound", train_name: "Taksaka", depart_date: "2026-11-05", depart_time: "07:00", carriage: "3", seat: "12A" },
  { direction: "return", train_name: "Argo Lawu", depart_date: "2026-11-08", depart_time: "15:00", carriage: null, seat: null },
];
assert.equal(keretaPadaTanggal(trains, new Date("2026-11-05T01:00:00Z"), WIB), "Taksaka · Car 3 · Seat 12A");
assert.equal(keretaPadaTanggal(trains, new Date("2026-11-06T01:00:00Z"), WIB), "Argo Lawu");
assert.equal(keretaPadaTanggal(trains, new Date("2026-11-09T01:00:00Z"), WIB), null);

// Baris lengkap: kosong = null ("Not set"), jawaban ganda digabung.
const baris = barisInfo(
  infoBerlaku(["logistik:hotel", "extra:batch", "base:title", "extra:alergi"], pilihan),
  { company: "PT Contoh", title: "  ", participant_type: null, extra: { batch: "Batch 2", alergi: ["Udang", "Kacang"] }, stays, transport, trains },
  new Date("2026-11-05T03:00:00Z"),
  WIB,
);
assert.deepEqual(baris, [
  { label: "Hotel", nilai: "GRAMM · Room 301" },
  { label: "Batch", nilai: "Batch 2" },
  { label: "Job title", nilai: null },
  { label: "Alergi", nilai: "Udang, Kacang" },
]);

console.log("info-scan ok");
