import assert from "node:assert/strict";
import { rencanaBus, rencanaKamar, type KeadaanAcara } from "./impor.ts";

const acara: KeadaanAcara = {
  peserta: [
    { id: "a", name: "Andi Pratama", qr_code: "Q-1", gender: "Pria" },
    { id: "b", name: "Budi Santoso", qr_code: "Q-2", gender: "pria" },
    { id: "c", name: "Citra Lestari", qr_code: "Q-3", gender: "Wanita" },
    { id: "d", name: "Dewi", qr_code: "Q-4", gender: null },
    { id: "e", name: "Eko", qr_code: "Q-5", gender: "Pria" },
    { id: "e2", name: "Eko", qr_code: "Q-6", gender: "Pria" },
  ],
  hotels: [{ id: 1, name: "Mulia" }],
  rooms: [{ id: 10, hotel_id: 1, room_number: "1208", capacity: 2 }],
  lodging: [{ participant_id: "c", room_id: 10 }],
  settings: { gender_field_key: "jk", enforce_same_gender: true },
  vehicles: [{ id: 5, code: "Bus 1", capacity: 1 }],
  busBawaan: [],
};

// Judul di baris kedua, hotel tanpa kolom (satu hotel), kamar baru dibuat.
const kamar = rencanaKamar([
  ["Rooming list gala"],
  ["Kamar", "Nama", "Kode QR", "Tipe"],
  ["1301", "andi pratama", "", "Twin"],
  ["1301", "", "Q-2", "Twin"],
  ["1208", "Citra Lestari", ""],
  ["1302", "Dewi", ""],
  ["1302", "Eko", ""],
  ["1301", "Andi Pratama", ""],
  ["1400", "", ""],
], acara);
assert.equal(kamar.galat, null);
const status = Object.fromEntries(kamar.baris.map((b) => [b.baris, `${b.status}:${b.alasan ?? ""}`]));
assert.equal(status[3], "masuk:");
assert.equal(status[4], "masuk:");
assert.equal(status[5], "tetap:Sudah di kamar ini");
assert.equal(status[6], "tolak:Jenis kelamin belum diisi di Daftar peserta");
assert.match(status[7], /^tolak:Ada 2 peserta/);
assert.equal(status[8], "tolak:Orang yang sama sudah ada di baris 3");
assert.deepEqual(kamar.kamarBaru.map((k) => `${k.nomor}/${k.kapasitas}/${k.tipe}`).sort(), ["1301/2/Twin", "1302/2/null", "1400/2/null"]);
assert.deepEqual(kamar.hotelBaru, []);
assert.deepEqual(kamar.penempatan, [{ hotel: "Mulia", tujuan: "1301", participant_ids: ["a", "b"] }]);

// Jenis kelamin berbeda dengan penghuni yang tinggal ditolak, kapasitas dijaga.
const campur = rencanaKamar([["Kamar", "Nama"], ["1208", "Andi Pratama"], ["1208", "Budi Santoso"]], acara);
assert.deepEqual(campur.baris.map((b) => b.status), ["tolak", "tolak"]);
assert.equal(campur.baris[0].alasan, "Jenis kelamin berbeda dengan penghuni kamar ini");

// Memindahkan Citra keluar membebaskan tempatnya.
const tukar = rencanaKamar([["Kamar", "Nama"], ["1208", "Andi Pratama"], ["1208", "Budi Santoso"], ["1209", "Citra Lestari"]], acara);
assert.deepEqual(tukar.baris.map((b) => b.status), ["masuk", "masuk", "pindah"]);

// Tanpa kolom Kamar.
assert.match(rencanaKamar([["Nama"], ["Andi"]], acara).galat ?? "", /Kolom Kamar/);
// Aturan belum lengkap.
assert.match(rencanaKamar([["Kamar", "Nama"]], { ...acara, settings: { gender_field_key: null, enforce_same_gender: true } }).galat ?? "", /Aturan kamar/);
// Dua hotel tanpa kolom Hotel.
assert.match(rencanaKamar([["Kamar", "Nama"]], { ...acara, hotels: [...acara.hotels, { id: 2, name: "Seruni" }] }).galat ?? "", /lebih dari satu hotel/);

// Bus: kapasitas 1, bus baru dibuat.
const bus = rencanaBus([["Nama", "Bus"], ["Andi Pratama", "bus 1"], ["Budi Santoso", "Bus 1"], ["Citra Lestari", "Bus 7"], ["Tidak Ada", "Bus 1"]], acara);
assert.deepEqual(bus.baris.map((b) => b.status), ["masuk", "tolak", "masuk", "tolak"]);
assert.equal(bus.baris[1].alasan, "Bus penuh (kapasitas 1)");
assert.equal(bus.baris[3].alasan, "Nama tidak ditemukan di Daftar peserta");
assert.deepEqual(bus.busBaru, ["Bus 7"]);
assert.deepEqual(bus.penempatan, [{ hotel: null, tujuan: "Bus 1", participant_ids: ["a"] }, { hotel: null, tujuan: "Bus 7", participant_ids: ["c"] }]);


// Judul English (templat admin English) dikenali sama seperti judul Indonesia.
const busEn = rencanaBus([
  ["Participant code", "Participant name", "Vehicle"],
  ["Q-1", "", "Bus 1"],
], acara);
assert.equal(busEn.galat, null);
assert.equal(busEn.baris[0]?.status, "masuk");
const kamarEn = rencanaKamar([
  ["Hotel name", "Room number", "Full name"],
  ["Mulia", "1501", "Budi Santoso"],
], acara);
assert.equal(kamarEn.galat, null);

console.log("impor.check: ok");
