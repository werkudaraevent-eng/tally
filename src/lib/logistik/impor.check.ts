import assert from "node:assert/strict";
import { bacaJam, bacaTanggal, rencanaBus, rencanaKamar, rencanaKereta, TEMPLAT, type KeadaanAcara } from "./impor.ts";

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
  kereta: [],
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
assert.equal(status[5], "tetap:Already in this room");
assert.equal(status[6], "tolak:Gender not filled in on the Participant list");
assert.match(status[7], /^tolak:2 participants have this name/);
assert.equal(status[8], "tolak:Same person already on row 3");
assert.deepEqual(kamar.kamarBaru.map((k) => `${k.nomor}/${k.kapasitas}/${k.tipe}`).sort(), ["1301/2/Twin", "1302/2/null", "1400/2/null"]);
assert.deepEqual(kamar.hotelBaru, []);
assert.deepEqual(kamar.penempatan, [{ hotel: "Mulia", tujuan: "1301", participant_ids: ["a", "b"] }]);

// Jenis kelamin berbeda dengan penghuni yang tinggal ditolak, kapasitas dijaga.
const campur = rencanaKamar([["Kamar", "Nama"], ["1208", "Andi Pratama"], ["1208", "Budi Santoso"]], acara);
assert.deepEqual(campur.baris.map((b) => b.status), ["tolak", "tolak"]);
assert.equal(campur.baris[0].alasan, "Gender differs from the occupants of this room");

// Memindahkan Citra keluar membebaskan tempatnya.
const tukar = rencanaKamar([["Kamar", "Nama"], ["1208", "Andi Pratama"], ["1208", "Budi Santoso"], ["1209", "Citra Lestari"]], acara);
assert.deepEqual(tukar.baris.map((b) => b.status), ["masuk", "masuk", "pindah"]);

// Tanpa kolom Kamar.
assert.match(rencanaKamar([["Nama"], ["Andi"]], acara).galat ?? "", /Room column/);
// Aturan belum lengkap.
assert.match(rencanaKamar([["Kamar", "Nama"]], { ...acara, settings: { gender_field_key: null, enforce_same_gender: true } }).galat ?? "", /Room rules/);
// Dua hotel tanpa kolom Hotel.
assert.match(rencanaKamar([["Kamar", "Nama"]], { ...acara, hotels: [...acara.hotels, { id: 2, name: "Seruni" }] }).galat ?? "", /more than one hotel/);

// Bus: kapasitas 1, bus baru dibuat.
const bus = rencanaBus([["Nama", "Bus"], ["Andi Pratama", "bus 1"], ["Budi Santoso", "Bus 1"], ["Citra Lestari", "Bus 7"], ["Tidak Ada", "Bus 1"]], acara);
assert.deepEqual(bus.baris.map((b) => b.status), ["masuk", "tolak", "masuk", "tolak"]);
assert.equal(bus.baris[1].alasan, "Bus full (capacity 1)");
assert.equal(bus.baris[3].alasan, "Name not found in the Participant list");
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

// Templat yang diunduh (judul English) terbaca oleh pembacanya sendiri; judul
// Indonesia lama tetap dikenali (lihat tes pertama di atas).
const templatKamar = rencanaKamar([TEMPLAT.kamar.judul, ...TEMPLAT.kamar.contoh], { ...acara, hotels: [] });
assert.equal(templatKamar.galat, null);
assert.equal(templatKamar.kamarBaru.length, 2);
const templatBus = rencanaBus([TEMPLAT.bus.judul, ...TEMPLAT.bus.contoh], acara);
assert.equal(templatBus.galat, null);
assert.equal(templatBus.baris.length, 2);
const lamaBus = rencanaBus([["Kode QR", "Nama", "Bus"], ["Q-1", "", "Bus 1"]], acara);
assert.equal(lamaBus.galat, null);
assert.equal(lamaBus.baris[0]?.status, "masuk");

console.log("impor.check: ok");

// ------------------------------------------------------------------ Kereta
assert.equal(bacaTanggal("2026-11-06"), "2026-11-06");
assert.equal(bacaTanggal("6/11/2026"), "2026-11-06");
assert.equal(bacaTanggal("06-11-26"), "2026-11-06");
assert.equal(bacaTanggal("31/02/2026"), undefined);
assert.equal(bacaTanggal("Nov 6"), undefined);
assert.equal(bacaTanggal(" "), null);
assert.equal(bacaJam("8:20"), "08:20");
assert.equal(bacaJam("08.20"), "08:20");
assert.equal(bacaJam("15:10:00"), "15:10");
assert.equal(bacaJam("24:00"), undefined);
assert.equal(bacaJam("pagi"), undefined);

const tersimpan = {
  id: 1, participant_id: "a", direction: "outbound" as const, train_name: "Argo Lawu 8", travel_class: "Executive", origin: "Gambir", destination: "Yogyakarta",
  depart_date: "2026-11-06", depart_time: "08:20", arrive_time: "15:10", carriage: "EKS 3", seat: "12A", booking_code: "KBX7Q2",
};
const kereta = rencanaKereta([
  TEMPLAT.kereta.judul,
  ["", "Andi Pratama", "Berangkat", "Argo Lawu 8", "Executive", "Gambir", "Yogyakarta", "06/11/2026", "08:20", "15:10", "EKS 3", "12A", "KBX7Q2"],
  ["", "Andi Pratama", "Pulang", "Taksaka 72", "Executive", "Yogyakarta", "Gambir", "2026-11-08", "15.30", "22:05", "EKS 5", "8C", ""],
  ["Q-2", "", "outbound", "Argo Lawu 8", "", "", "", "06/11/2026", "", "", "EKS 1", "1A", ""],
  ["Q-2", "", "Outbound", "Argo Lawu 8", "", "", "", "", "", "", "", "", ""],
  ["", "Citra Lestari", "Both", "Argo Lawu 8"],
  ["", "Citra Lestari", "Return", ""],
  ["", "Citra Lestari", "Return", "Taksaka", "", "", "", "6 Nov"],
  ["", "Citra Lestari", "Return", "Taksaka", "", "", "", "", "8 pagi"],
  ["", "Eko", "Return", "Taksaka"],
  ["", "", "", ""],
], { ...acara, kereta: [tersimpan, { ...tersimpan, id: 2, participant_id: "b", seat: "2B" }] });
assert.equal(kereta.galat, null);
const sk = Object.fromEntries(kereta.baris.map((b) => [b.baris, `${b.status}:${b.alasan ?? ""}`]));
assert.equal(sk[2], "tetap:Already saved");
assert.equal(sk[3], "masuk:");
assert.equal(sk[4], "pindah:Updates the saved ticket");
assert.equal(sk[5], "tolak:Same person and direction already on row 4");
assert.match(sk[6], /^tolak:Direction must be/);
assert.equal(sk[7], "tolak:Train name is empty");
assert.match(sk[8], /^tolak:Date not recognised/);
assert.match(sk[9], /^tolak:Time not recognised/);
assert.match(sk[10], /^tolak:2 participants have this name/);
assert.equal(kereta.baris.length, 9);
assert.equal(kereta.tiket.length, 2);
assert.deepEqual(kereta.tiket[0], {
  participant_id: "a", direction: "return", train_name: "Taksaka 72", travel_class: "Executive", origin: "Yogyakarta", destination: "Gambir",
  depart_date: "2026-11-08", depart_time: "15:30", arrive_time: "22:05", carriage: "EKS 5", seat: "8C", booking_code: null,
});
// Kolom yang ada tetapi kosong mengosongkan nilai lama.
assert.equal(kereta.tiket[1].travel_class, null);
assert.equal(kereta.tiket[1].seat, "1A");

// Kolom yang tidak ada di berkas mempertahankan nilai lama.
const sebagian = rencanaKereta([["Name", "Direction", "Train", "Seat"], ["Andi Pratama", "Outbound", "Argo Lawu 8", "14C"]], { ...acara, kereta: [tersimpan] });
assert.deepEqual(sebagian.tiket[0], { participant_id: "a", direction: "outbound", train_name: "Argo Lawu 8", travel_class: "Executive", origin: "Gambir", destination: "Yogyakarta", depart_date: "2026-11-06", depart_time: "08:20", arrive_time: "15:10", carriage: "EKS 3", seat: "14C", booking_code: "KBX7Q2" });
assert.match(rencanaKereta([["Name", "Train"], ["Andi", "X"]], acara).galat ?? "", /Direction/);

// Nilai di atas batas tabel ditolak di pratinjau, tidak dipotong diam-diam.
const panjang = rencanaKereta([["Name", "Direction", "Train", "Seat", "Booking code"], ["Andi Pratama", "Outbound", "Argo Lawu 8", "14C", "K".repeat(41)], ["Andi Pratama", "Return", "T".repeat(81), "1A", "X"]], acara);
assert.equal(panjang.tiket.length, 0);
assert.equal(panjang.baris[0].alasan, "Booking code is longer than 40 characters");
assert.equal(panjang.baris[1].alasan, "Train is longer than 80 characters");
