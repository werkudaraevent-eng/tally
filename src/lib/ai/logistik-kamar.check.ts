import assert from "node:assert/strict";
import { isiNomorKamar, namaPolos, selKeTsv } from "./logistik-kamar.ts";
import { biayaUsd, modelUntuk } from "./model.ts";
import { textToCells } from "../undian-import.ts";

// Bentuk "Download current stays" dengan label kamar (data palsu).
const judul = ["QR code", "Name", "Hotel 1", "Room 1", "Check-in 1", "Check-out 1", "Room label 1", "Hotel 2", "Room 2", "Check-in 2", "Check-out 2", "Room label 2"];
const stays = [
  judul,
  ["Q1", "Budi Santoso", "Hotel A", "", "", "", "RA001", "", "", "", "", ""],
  ["Q2", "Andi Pratama", "Hotel A", "", "", "", "RA001", "", "", "", "", ""],
  ["Q3", "Dewi Lestari", "Hotel A", "305", "", "", "RA002", "", "", "", "", ""],
  ["Q4", "Rina Hapsari", "Hotel A", "", "05/11/2026", "06/11/2026", "RA003", "Hotel B", "", "06/11/2026", "08/11/2026", "RB001"],
  ["Q5", "Siti Aminah", "Hotel A", "", "", "", "RA004", "", "", "", "", ""],
  ["Q6", "Siti Aminah", "Hotel A", "", "", "", "RA005", "", "", "", "", ""],
  ["Q7", "Agus Salim", "Hotel A", "410", "", "", "RA006", "", "", "", "", ""],
  ["Q8", "Mega Putri", "Hotel A", "", "05/11/2026", "06/11/2026", "RA007", "Hotel A", "", "07/11/2026", "08/11/2026", "RA008"],
];
const t = (guest_name: string, room_number: string, hotel = "Hotel A", check_in = "") => ({ guest_name, room_number, hotel, check_in, check_out: "" });

const r = isiNomorKamar(stays, [
  t("BUDI SANTOSO", "1208"), // persis, beda huruf besar
  t("Mr. Andi Pratama", "1208"), // sapaan + titik
  t("Dewi Lestari", "305"), // sudah sama
  t("Rina Hapsari", "220", "Hotel B"), // slot hotel kedua
  t("Siti Aminah", "500"), // nama kembar
  t("Agus Salim", "411"), // berubah
  t("Joko Widodo", "101"), // tidak ada
  t("Budi Santoso", "1209"), // bentrok dengan baris pertama
  t("Andi Pratama", ""), // tanpa nomor
  t("Mega Putri", "330", "Hotel A", "07/11/2026"), // dua stay di hotel sama, dipilih tanggal
  t("Mega Putri", "331", "Hotel A"), // dua stay, tanpa tanggal: tidak ditebak
  t("Dewi Lestari", "999", "Hotel B"), // tidak menginap di Hotel B
])!;
assert.ok(r);
const status = r.hasil.map((h) => `${h.namaBerkas}:${h.status}`);
assert.deepEqual(status, [
  "BUDI SANTOSO:bentrok",
  "Mr. Andi Pratama:diisi",
  "Dewi Lestari:sama",
  "Rina Hapsari:diisi",
  "Siti Aminah:ganda",
  "Agus Salim:berubah",
  "Joko Widodo:tidak_ditemukan",
  "Budi Santoso:bentrok",
  "Andi Pratama:tanpa_nomor",
  "Mega Putri:diisi",
  "Mega Putri:bukan_hotel",
  "Dewi Lestari:bukan_hotel",
]);
assert.equal(r.hasil[5].lama, "410");
assert.equal(r.hasil[1].namaTally, "Andi Pratama");
// Berkas hasil: judul + hanya baris yang berubah, label dan tanggal tetap.
assert.deepEqual(r.sel[0], judul);
assert.deepEqual(r.sel.slice(1).map((b) => b[0]), ["Q2", "Q4", "Q7", "Q8"]);
assert.equal(r.sel[1][3], "1208");
assert.equal(r.sel[1][6], "RA001");
assert.equal(r.sel[2][8], "220");
assert.equal(r.sel[2][3], "");
assert.equal(r.sel[3][3], "411");
assert.equal(r.sel[4][3], "");
assert.equal(r.sel[4][8], "330");
// Budi tidak diubah karena bentrok.
assert.ok(!r.sel.some((b) => b[0] === "Q1"));

// Dua tamu sekamar dengan nomor yang sama bukan bentrok.
const sekamar = isiNomorKamar(stays, [t("Budi Santoso", "1208"), t("Budi Santoso", "1208")])!;
assert.deepEqual(sekamar.hasil.map((h) => h.status), ["diisi", "diisi"]);
assert.equal(sekamar.sel.length, 2);

// Hotel kosong dari AI + satu stay = stay itu.
assert.equal(isiNomorKamar(stays, [t("Agus Salim", "412", "")])!.hasil[0].status, "berubah");
// Judul yang bukan bentuk stay ditolak.
assert.equal(isiNomorKamar([["Name", "Room"]], [t("A", "1")]), null);
// Acara tanpa stay: semua dilaporkan, tidak ada berkas.
assert.deepEqual(isiNomorKamar([], [t("A", "1"), t("B", "")])!.hasil.map((h) => h.status), ["tidak_ditemukan", "tanpa_nomor"]);

assert.equal(namaPolos("Ibu  Siti Aminah, S.E."), "siti aminah s e");
assert.equal(namaPolos("Mr"), "mr");

// TSV terbaca balik oleh impor tanpa menggeser kolom.
const tsv = selKeTsv([["QR code", "Name", "Hotel 1", "Room 1"], ["Q1", "Budi\tSantoso", "Hotel, A", "12\n08"]]);
assert.deepEqual(textToCells(tsv), [["QR code", "Name", "Hotel 1", "Room 1"], ["Q1", "Budi Santoso", "Hotel, A", "12 08"]]);

assert.equal(biayaUsd("claude-sonnet-5-5", 20_000, 10_000), 0.14);
assert.equal(biayaUsd("claude-haiku-5-5", 1_000_000, 1_000_000), 0.6);
assert.equal(biayaUsd("model-lain", 1_000_000, 0), 2);
assert.equal(modelUntuk({ modelBawaan: "claude-opus-5-5", modelFitur: {} }, "x"), "claude-opus-5-5");
assert.equal(modelUntuk({ modelBawaan: "claude-opus-5-5", modelFitur: { x: "claude-haiku-5-5" } }, "x"), "claude-haiku-5-5");
assert.equal(modelUntuk({ modelBawaan: "hapus", modelFitur: { x: "juga-hapus" } }, "x"), "claude-sonnet-5-5");

console.log("ai/logistik-kamar ok");
