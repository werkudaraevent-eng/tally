import assert from "node:assert/strict";
import { kunciKamar, saringKamar } from "./cari-kamar.ts";

const opsi = [
  { kamar: { room_number: "1208", label: null } },
  { kamar: { room_number: "1210", label: null } },
  { kamar: { room_number: null, label: "Kamar 01" } },
];

assert.equal(kunciKamar("  Kamar   01 "), "kamar 01");

// Kosong: semua kamar, tidak ada yang dibuat.
assert.deepEqual(saringKamar(opsi, "  "), { cocok: opsi, buat: null });

// Sebagian nomor: kamar yang memuatnya, dan nomor itu boleh dibuat.
const dua = saringKamar(opsi, "12");
assert.equal(dua.cocok.length, 2);
assert.equal(dua.buat, "12");

// Nomor persis yang sudah ada: dipilih, tidak dibuat dua kali.
const ada = saringKamar(opsi, " 1208 ");
assert.deepEqual(ada.cocok.map((o) => o.kamar.room_number), ["1208"]);
assert.equal(ada.buat, null);

// Label panitia juga dicari, tanpa beda huruf besar.
const label = saringKamar(opsi, "kamar 01");
assert.equal(label.cocok.length, 1);
assert.equal(label.buat, null);

// Nomor baru: tidak ada yang cocok, spasi dirapikan.
assert.deepEqual(saringKamar(opsi, " 15  01 "), { cocok: [], buat: "15 01" });

// Lebih dari 40 huruf tidak bisa dibuat (batas kolom nomor kamar).
assert.equal(saringKamar(opsi, "x".repeat(41)).buat, null);

console.log("cari-kamar.check ok");
