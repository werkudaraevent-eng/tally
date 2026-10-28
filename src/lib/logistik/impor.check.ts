import assert from "node:assert/strict";
import { IKUT, bacaJam, bacaTanggal, barisPesertaBus, barisPesertaKereta, barisStaySekarang, rencanaBus, rencanaKamar, rencanaKereta, TEMPLAT, type KeadaanAcara } from "./impor.ts";

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
  lodging: [{ participant_id: "c", hotel_id: 1, room_id: 10 }],
  settings: { gender_field_key: "jk", enforce_same_gender: true },
  vehicles: [{ id: 5, code: "Bus 1", capacity: 1 }],
  busBawaan: [],
  trips: [],
  busTrip: [],
  kereta: [],
  offset: "+07:00",
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
assert.equal(status[8], "tolak:Same person already on row 3. To move them between hotels or rooms, fill in Check-in and Check-out on each of their rows");
assert.deepEqual(kamar.kamarBaru.map((k) => `${k.nomor}/${k.kapasitas}/${k.tipe}`).sort(), ["1301/2/Twin", "1302/2/null", "1400/2/null"]);
assert.deepEqual(kamar.hotelBaru, []);
assert.deepEqual(kamar.penempatan, [{ hotel: "Mulia", tujuan: "1301", malam: null, participant_ids: ["a", "b"] }]);

// Jenis kelamin berbeda dengan penghuni yang tinggal ditolak, kapasitas dijaga.
const campur = rencanaKamar([["Kamar", "Nama"], ["1208", "Andi Pratama"], ["1208", "Budi Santoso"]], acara);
assert.deepEqual(campur.baris.map((b) => b.status), ["tolak", "tolak"]);
assert.equal(campur.baris[0].alasan, "Gender differs from the occupants of this room");

// Memindahkan Citra keluar membebaskan tempatnya.
const tukar = rencanaKamar([["Kamar", "Nama"], ["1208", "Andi Pratama"], ["1208", "Budi Santoso"], ["1209", "Citra Lestari"]], acara);
assert.deepEqual(tukar.baris.map((b) => b.status), ["masuk", "masuk", "pindah"]);

// Tanpa kolom Kamar dan Hotel.
assert.match(rencanaKamar([["Nama"], ["Andi"]], acara).galat ?? "", /Hotel or Room column/);
// Aturan belum lengkap: hanya menolak berkas yang menyebut nomor kamar.
const tanpaAturan = { ...acara, settings: { gender_field_key: null, enforce_same_gender: true } };
assert.match(rencanaKamar([["Kamar", "Nama"], ["1208", "Andi Pratama"]], tanpaAturan).galat ?? "", /Room rules/);
assert.equal(rencanaKamar([["Hotel", "Kamar", "Nama"], ["Mulia", "", "Andi Pratama"]], tanpaAturan).galat, null);

// Hotel saja, nomor kamar menyusul: kolom Room kosong atau tidak ada.
const hotelSaja = rencanaKamar([
  ["Hotel", "Room", "QR code", "Name"],
  ["Mulia", "", "Q-1", ""],
  ["Seruni Baru", "", "", "Budi Santoso"],
  ["mulia", "", "", "Citra Lestari"],
  ["", "", "Q-4", ""],
  ["Mulia", "", "Q-1", ""],
], acara);
assert.equal(hotelSaja.galat, null);
assert.deepEqual(hotelSaja.baris.map((b) => `${b.status}:${b.tujuan}:${b.alasan ?? ""}`), [
  "masuk:Mulia · room to follow:",
  "masuk:Seruni Baru · room to follow:",
  // Sudah di kamar 1208 hotel ini: kamarnya tidak dikosongkan.
  "tetap:mulia · room to follow:Already in room 1208 at this hotel",
  "tolak::Hotel and room are empty",
  "tolak:Mulia · room to follow:Same person already on row 2. To move them between hotels or rooms, fill in Check-in and Check-out on each of their rows",
]);
assert.deepEqual(hotelSaja.hotelBaru, ["Seruni Baru"]);
assert.deepEqual(hotelSaja.kamarBaru, []);
assert.deepEqual(hotelSaja.penempatan, [
  { hotel: "Mulia", tujuan: null, malam: null, participant_ids: ["a"] },
  { hotel: "Seruni Baru", tujuan: null, malam: null, participant_ids: ["b"] },
]);
// Tanpa kolom Room sama sekali, satu hotel di acara: kolom Hotel tetap wajib
// bila berkas tidak menyebut kamar (tanpa keduanya tidak ada tempat).
assert.equal(rencanaKamar([["Hotel", "Name"], ["Mulia", "Andi Pratama"]], acara).baris[0]?.status, "masuk");

// Rooming list belakangan: tamu yang menunggu kamar diberi kamar, dan tempat
// Citra (yang dipindah ke "menyusul" di berkas yang sama) bisa dipakai.
const menunggu: typeof acara = { ...acara, lodging: [{ participant_id: "c", hotel_id: 1, room_id: 10 }, { participant_id: "a", hotel_id: 1, room_id: null }] };
const rooming = rencanaKamar([["Hotel", "Room", "Name"], ["Mulia", "1301", "Andi Pratama"]], menunggu);
assert.equal(rooming.baris[0]?.status, "masuk");
assert.equal(rooming.baris[0]?.alasan, "Was waiting for a room");
const keMenyusul = rencanaKamar([["Hotel", "Room", "Name"], ["Seruni", "", "Citra Lestari"], ["Mulia", "1208", "Dewi"]], { ...menunggu, settings: { gender_field_key: "jk", enforce_same_gender: false }, rooms: [{ id: 10, hotel_id: 1, room_number: "1208", capacity: 1 }] });
assert.deepEqual(keMenyusul.baris.map((b) => `${b.status}:${b.alasan ?? ""}`), ["pindah:Moving from 1208 · Mulia", "masuk:"]);
// Dua hotel tanpa kolom Hotel.
assert.match(rencanaKamar([["Kamar", "Nama"]], { ...acara, hotels: [...acara.hotels, { id: 2, name: "Seruni" }] }).galat ?? "", /more than one hotel/);

// Bus: kapasitas 1, bus baru dibuat.
const bus = rencanaBus([["Nama", "Bus"], ["Andi Pratama", "bus 1"], ["Budi Santoso", "Bus 1"], ["Citra Lestari", "Bus 7"], ["Tidak Ada", "Bus 1"]], acara);
assert.deepEqual(bus.baris.map((b) => b.status), ["masuk", "tolak", "masuk", "tolak"]);
assert.equal(bus.baris[1].alasan, "Vehicle full (capacity 1)");
assert.equal(bus.baris[3].alasan, "Name not found in the Participant list");
assert.deepEqual(bus.busBaru, ["Bus 7"]);
assert.deepEqual(bus.penempatan, [{ hotel: null, tujuan: "Bus 1", malam: null, participant_ids: ["a"] }, { hotel: null, tujuan: "Bus 7", malam: null, participant_ids: ["c"] }]);


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
// Header "Default vehicle" (ekspor Daftar peserta lama dan baru) dan "Kendaraan" juga dikenali.
for (const judul of ["Default vehicle", "Kendaraan", "Nama kendaraan"]) {
  const k = rencanaBus([["QR code", "Name", judul], ["Q-1", "", "Bus 1"]], acara);
  assert.equal(k.galat, null, judul);
  assert.equal(k.baris[0]?.status, "masuk", judul);
}


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
// Orang dan arah saja, kolom tiket kosong: dilewati, bukan ditolak.
assert.equal(sk[7], undefined);
assert.equal(kereta.dilewati, 1);
assert.match(sk[8], /^tolak:Date not recognised/);
assert.match(sk[9], /^tolak:Time not recognised/);
assert.match(sk[10], /^tolak:2 participants have this name/);
assert.equal(kereta.baris.length, 8);
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

// Pindah hotel: satu baris per hotel, setiap baris bertanggal.
const duaHotel: KeadaanAcara = {
  ...acara,
  hotels: [{ id: 1, name: "Mulia", check_in_at: null, check_out_at: null }, { id: 2, name: "Royal", check_in_at: null, check_out_at: null }],
  rooms: [{ id: 10, hotel_id: 1, room_number: "1208", capacity: 2 }, { id: 20, hotel_id: 2, room_number: "214", capacity: 2 }],
  // Andi sekarang di Royal 214 tanpa tanggal; Citra di Mulia 1208 dan Royal 214.
  lodging: [
    { participant_id: "a", hotel_id: 2, room_id: 20, check_in_at: null, check_out_at: null },
    { participant_id: "c", hotel_id: 1, room_id: 10, check_in_at: "2026-11-05T07:00:00.000Z", check_out_at: "2026-11-06T05:00:00.000Z" },
    { participant_id: "c", hotel_id: 2, room_id: 20, check_in_at: "2026-11-06T07:00:00.000Z", check_out_at: "2026-11-08T05:00:00.000Z" },
  ],
};
const pindah = rencanaKamar([
  ["Hotel", "Room", "Check-in", "Check-out", "Name"],
  ["Mulia", "", "05/11/2026", "06/11/2026", "Andi Pratama"],
  ["Royal", "", "2026-11-06", "2026-11-08", "Andi Pratama"],
  ["Mulia", "", "05/11/2026", "07/11/2026", "Budi Santoso"],
  ["Royal", "", "06/11/2026", "08/11/2026", "Budi Santoso"],
  ["Mulia", "", "05/11/2026", "", "Dewi"],
  ["Mulia", "", "05/11/2026", "06/11/2026", "Citra Lestari"],
  ["Mulia", "", "06/11/2026", "05/11/2026", "Eko"],
  ["Mulia", "", "31/02/2026", "05/11/2026", "Eko"],
], duaHotel);
assert.equal(pindah.galat, null);
const sp = Object.fromEntries(pindah.baris.map((b) => [b.baris, `${b.status}:${b.alasan ?? ""}`]));
assert.equal(sp[2], "masuk:");
assert.equal(sp[3], "pindah:Nights change to 6–8 Nov");
// Malam bertabrakan: seluruh orangnya ditolak, supaya stay lainnya tidak terhapus.
assert.equal(sp[4], "tolak:Another row for this person was rejected");
assert.equal(sp[5], "tolak:Nights overlap row 4");
assert.equal(sp[6], "tolak:Fill in both Check-in and Check-out, or leave both empty");
assert.equal(sp[8], "tolak:Check-out must be after check-in");
assert.equal(sp[9], "tolak:Check-in date not recognised. Use DD/MM/YYYY");
// Citra hanya disebut di Mulia dengan tanggal: stay Royal-nya dilepas.
assert.deepEqual(pindah.lepas, [{ participant_id: "c", hotel_id: 2 }]);
assert.equal(sp[7], "pindah:Already in room 1208 at this hotel. Removes their stay at 214 · Royal");
// Andi: malam Mulia lalu Royal, dikelompokkan per hotel dan malam.
const andi = pindah.penempatan.filter((p) => p.participant_ids.includes("a"));
assert.deepEqual(andi.map((p) => `${p.hotel}:${p.malam?.masuk}>${p.malam?.keluar}`), ["Mulia:2026-11-05>2026-11-06", "Royal:2026-11-06>2026-11-08"]);
// Andi masih disebut di Royal, jadi tidak ada yang dilepas darinya.
assert.ok(!pindah.lepas.some((l) => l.participant_id === "a"));

// Berkas tanpa tanggal dari satu hotel tidak menyentuh stay di hotel lain.
const satuHotel = rencanaKamar([["Hotel", "Room", "Name"], ["Mulia", "1208", "Citra Lestari"]], duaHotel);
assert.deepEqual(satuHotel.lepas, []);
assert.equal(satuHotel.baris[0].status, "tetap");

// "Download current stays" lalu impor kembali tanpa diubah: tidak ada yang berubah.
const unduhan = barisStaySekarang({
  peserta: duaHotel.peserta,
  hotels: duaHotel.hotels.map((h, i) => ({ id: h.id, name: h.name, sort_order: i, check_in_at: null, check_out_at: null })),
  rooms: duaHotel.rooms.map((r) => ({ ...r, room_type: r.id === 10 ? "Twin" : null })),
  lodging: duaHotel.lodging.map((l, i) => ({ ...l, id: l.id ?? i + 1, check_in_at: l.check_in_at ?? null, check_out_at: l.check_out_at ?? null })),
  offset: "+07:00",
});
// Satu baris per orang, kolom Hotel N; orang dengan satu stay tanpa tanggal sendiri tanpa tanggal.
assert.deepEqual(unduhan, [
  ["QR code", "Name", "Hotel 1", "Room 1", "Check-in 1", "Check-out 1", "Hotel 2", "Room 2", "Check-in 2", "Check-out 2"],
  ["Q-3", "Citra Lestari", "Mulia", "1208", "05/11/2026", "06/11/2026", "Royal", "214", "06/11/2026", "08/11/2026"],
  ["Q-1", "Andi Pratama", "Royal", "214", "", "", "", "", "", ""],
]);
const balik = rencanaKamar(unduhan, duaHotel);
assert.equal(balik.galat, null);
assert.deepEqual(balik.baris.map((b) => b.status), ["tetap", "tetap", "tetap"]);
assert.deepEqual(balik.lepas, []);
assert.deepEqual(balik.penempatan, []);

// Berkas lebar dari Mas (satu baris per orang): Andi pindah Mulia 5-6 lalu Royal 6-8.
const lebar = rencanaKamar([
  ["QR code", "Name", "Hotel 1", "Room 1", "Check-in 1", "Check-out 1", "Hotel 2", "Room 2", "Check-in 2", "Check-out 2"],
  ["", "Andi Pratama", "Mulia", "", "05/11/2026", "06/11/2026", "Royal", "", "06/11/2026", "08/11/2026"],
  // Hotel 2 kosong: satu hotel, tanpa tanggal = ikut hotel.
  ["", "Budi Santoso", "Royal", "To follow", "", "", "", "", "", ""],
  // Dua hotel tanpa tanggal ditolak dengan pesan untuk satu baris.
  ["", "Dewi", "Mulia", "", "", "", "Royal", "", "", ""],
  // Malam bertabrakan dalam satu baris.
  ["", "Citra Lestari", "Mulia", "", "05/11/2026", "07/11/2026", "Royal", "", "06/11/2026", "08/11/2026"],
], duaHotel);
assert.equal(lebar.galat, null);
const andiLebar = lebar.penempatan.filter((p) => p.participant_ids.includes("a"));
assert.deepEqual(andiLebar.map((p) => `${p.hotel}:${p.malam?.masuk}>${p.malam?.keluar}`), ["Mulia:2026-11-05>2026-11-06", "Royal:2026-11-06>2026-11-08"]);
// Nomor baris tetap baris Excel aslinya, juga untuk Hotel 2.
assert.deepEqual(lebar.baris.filter((b) => b.nama === "Andi Pratama").map((b) => b.baris), [2, 2]);
// "To follow" dari ekspor Daftar peserta = kamar menyusul, bukan kamar bernomor "To follow".
assert.deepEqual(lebar.kamarBaru, []);
assert.ok(lebar.baris.find((b) => b.nama === "Budi Santoso")?.tujuan.includes("room to follow"));
assert.ok(lebar.baris.some((b) => b.nama === "Dewi" && b.alasan === "Fill in Check-in and Check-out for each stay of someone who moves hotels or rooms"));
// Hotel 1 Dewi ikut ditolak: tidak ada yang tersimpan setengah.
assert.deepEqual(lebar.baris.filter((b) => b.nama === "Dewi").map((b) => b.status), ["tolak", "tolak"]);
assert.ok(!lebar.penempatan.some((p) => p.participant_ids.includes("d")));
assert.ok(lebar.baris.some((b) => b.nama === "Citra Lestari" && b.alasan === "Nights of the stays in this row overlap"));

// Kamar Hotel 1 penuh: seluruh baris ditolak, Royal Andi tidak dilepas, dan
// Hotel 2 tidak tersimpan sendirian.
const penuh = rencanaKamar([
  ["QR code", "Name", "Hotel 1", "Room 1", "Check-in 1", "Check-out 1", "Hotel 2", "Room 2", "Check-in 2", "Check-out 2"],
  ["", "Andi Pratama", "Mulia", "1208", "05/11/2026", "06/11/2026", "Royal", "", "06/11/2026", "08/11/2026"],
  ["", "Budi Santoso", "Mulia", "", "05/11/2026", "06/11/2026", "Royal", "", "06/11/2026", "08/11/2026"],
], { ...duaHotel, settings: { gender_field_key: "jk", enforce_same_gender: false }, rooms: [{ id: 10, hotel_id: 1, room_number: "1208", capacity: 1 }, duaHotel.rooms[1]] });
assert.deepEqual(penuh.baris.filter((b) => b.nama === "Andi Pratama").map((b) => `${b.status}:${b.alasan}`), ["tolak:Room full (capacity 1)", "tolak:Another stay in this row was rejected"]);
assert.ok(!penuh.penempatan.some((p) => p.participant_ids.includes("a")));
assert.ok(!penuh.lepas.some((l) => l.participant_id === "a"));
assert.deepEqual(penuh.penempatan.filter((p) => p.participant_ids.includes("b")).map((p) => p.hotel).sort(), ["Mulia", "Royal"]);
// Jenis kelamin berbeda: sama, seluruh baris ditolak.
const beda = rencanaKamar([
  ["QR code", "Name", "Hotel 1", "Room 1", "Check-in 1", "Check-out 1", "Hotel 2", "Room 2", "Check-in 2", "Check-out 2"],
  ["", "Andi Pratama", "Mulia", "1208", "05/11/2026", "06/11/2026", "Royal", "", "06/11/2026", "08/11/2026"],
], duaHotel);
assert.deepEqual(beda.baris.map((b) => b.status), ["tolak", "tolak"]);
assert.equal(beda.baris[0].alasan, "Gender differs from the occupants of this room");
assert.deepEqual(beda.penempatan, []);
assert.deepEqual(beda.lepas, []);
// Orang yang ditolak tidak mengambil tempat: orang berikutnya di kamar itu masuk.
const giliran = rencanaKamar([
  ["QR code", "Name", "Hotel 1", "Room 1", "Check-in 1", "Check-out 1", "Hotel 2", "Room 2", "Check-in 2", "Check-out 2"],
  ["", "Andi Pratama", "Royal", "214", "05/11/2026", "06/11/2026", "Royal", "", "06/11/2026", "08/11/2026"],
  ["", "Budi Santoso", "Royal", "214", "05/11/2026", "06/11/2026", "", "", "", ""],
], { ...duaHotel, lodging: [], rooms: [duaHotel.rooms[0], { id: 20, hotel_id: 2, room_number: "214", capacity: 1 }] });
// Hotel sama dua kali (pindah kamar): Andi diterima dan mengambil 214 malam 5-6.
assert.deepEqual(giliran.baris.filter((b) => b.nama === "Andi Pratama").map((b) => b.status), ["masuk", "masuk"]);
assert.equal(giliran.baris.find((b) => b.nama === "Budi Santoso")?.alasan, "Room full (capacity 1)");
// Kamar Hotel 2 penuh untuk Andi: tempatnya tidak diambil, Budi masuk.
const giliran2 = rencanaKamar([
  ["QR code", "Name", "Hotel 1", "Room 1", "Check-in 1", "Check-out 1", "Hotel 2", "Room 2", "Check-in 2", "Check-out 2"],
  ["", "Andi Pratama", "Royal", "214", "05/11/2026", "06/11/2026", "Royal", "214", "05/11/2026", "06/11/2026"],
  ["", "Budi Santoso", "Royal", "214", "05/11/2026", "06/11/2026", "", "", "", ""],
], { ...duaHotel, lodging: [], rooms: [duaHotel.rooms[0], { id: 20, hotel_id: 2, room_number: "214", capacity: 1 }] });
assert.deepEqual(giliran2.baris.filter((b) => b.nama === "Andi Pratama").map((b) => b.alasan).sort(), ["Another stay in this row was rejected", "Nights of the stays in this row overlap"]);
assert.equal(giliran2.baris.find((b) => b.nama === "Budi Santoso")?.status, "masuk");

// Judul ekspor Daftar peserta ("Hotel check-in 1") juga terbaca.
const ekspor = rencanaKamar([
  ["Name", "Organisation", "Hotel 1", "Room 1", "Hotel check-in 1", "Hotel check-out 1", "Hotel 2", "Room 2", "Hotel check-in 2", "Hotel check-out 2", "Bus"],
  ["Andi Pratama", "QA", "Mulia", "To follow", "05/11/2026", "06/11/2026", "Royal", "To follow", "06/11/2026", "08/11/2026", "Bus 1"],
], duaHotel);
assert.equal(ekspor.galat, null);
assert.deepEqual(ekspor.baris.map((b) => b.status), ["masuk", "pindah"]);

// Download participant list, kereta: dua baris per orang urut nama, tiket
// tersimpan terisi, kolom (info) diabaikan saat diimpor kembali, meski
// labelnya "Class". Diimpor tanpa diubah: tidak ada yang ditulis.
const unduhKereta = barisPesertaKereta({
  peserta: [
    { id: "b", name: "Budi Santoso", qr_code: "Q-2", extra: { kelas: "VIP" } },
    { id: "a", name: "Andi Pratama", qr_code: "Q-1", extra: { batch: "Batch 1", kelas: "Reguler" } },
  ],
  info: [{ key: "batch", label: "Batch" }, { key: "kelas", label: "Class" }],
  vehicles: [], busBawaan: [], trips: [], busTrip: [], offset: "+07:00", kereta: [tersimpan],
});
assert.deepEqual(unduhKereta[0].slice(-3), ["Booking code", "Batch (info)", "Class (info)"]);
assert.deepEqual(unduhKereta.slice(1).map((b) => `${b[1]}|${b[2]}|${b[3]}`), ["Andi Pratama|Outbound|Argo Lawu 8", "Andi Pratama|Return|", "Budi Santoso|Outbound|", "Budi Santoso|Return|"]);
assert.deepEqual(unduhKereta[1].slice(7, 10), ["06/11/2026", "08:20", "15:10"]);
assert.deepEqual(unduhKereta[3].slice(-2), ["", "VIP"]);
const balikKereta = rencanaKereta(unduhKereta, { ...acara, kereta: [tersimpan] });
assert.equal(balikKereta.galat, null);
assert.deepEqual(balikKereta.baris.map((b) => b.status), ["tetap"]);
assert.equal(balikKereta.dilewati, 3);
assert.equal(balikKereta.tiket.length, 0);
// Satu baris diisi panitia: hanya itu yang ditulis.
const diisi = unduhKereta.map((b) => [...b]);
diisi[3][3] = "Taksaka 72";
const isiKereta = rencanaKereta(diisi, { ...acara, kereta: [tersimpan] });
assert.deepEqual(isiKereta.tiket.map((t) => `${t.participant_id}:${t.direction}:${t.train_name}`), ["b:outbound:Taksaka 72"]);
assert.equal(isiKereta.dilewati, 2);

// Download participant list, bus: kendaraan bawaan terisi, yang kosong dilewati.
const unduhBus = barisPesertaBus({
  peserta: [{ id: "b", name: "Budi Santoso", qr_code: "Q-2", extra: null }, { id: "a", name: "Andi Pratama", qr_code: "Q-1", extra: null }],
  info: [], vehicles: [{ id: 5, code: "Bus 1" }], busBawaan: [{ participant_id: "a", vehicle_id: 5 }], trips: [], busTrip: [], offset: "+07:00", kereta: [],
});
assert.deepEqual(unduhBus, [["QR code", "Name", "Vehicle"], ["Q-1", "Andi Pratama", "Bus 1"], ["Q-2", "Budi Santoso", ""]]);
const balikBus = rencanaBus(unduhBus, { ...acara, busBawaan: [{ participant_id: "a", vehicle_id: 5 }] });
assert.deepEqual(balikBus.baris.map((b) => b.status), ["tetap"]);
assert.equal(balikBus.dilewati, 1);
assert.deepEqual(balikBus.penempatan, []);

// Judul qr_code dari ekspor peserta mentah terbaca sebagai QR code.
const qrMentah = rencanaBus([["qr_code", "name", "Vehicle"], ["Q-3", "Nama Lain", "Bus 1"]], acara);
assert.equal(qrMentah.baris[0].participant_id, "c");

// Kendaraan per Trip: satu kolom per trip, urut jam berangkat, judul memakai
// jam zona acara. Pengecualian tersimpan terisi; "No vehicle" = tidak naik.
const tripAcara = [
  { id: 2, name: "Jeep Merapi", depart_at: "2026-11-06T22:00:00Z", follows_default: true },
  { id: 1, name: "Ke venue", depart_at: "2026-11-06T00:00:00Z", follows_default: true },
  { id: 3, name: "Pulang", depart_at: null, follows_default: true },
];
const busDua = [{ id: 5, code: "Bus 1", capacity: 40 }, { id: 7, code: "Bus 7", capacity: 1 }];
const unduhTrip = barisPesertaBus({
  peserta: [{ id: "a", name: "Andi Pratama", qr_code: "Q-1", extra: null }, { id: "b", name: "Budi Santoso", qr_code: "Q-2", extra: null }],
  info: [], vehicles: busDua, busBawaan: [{ participant_id: "a", vehicle_id: 5 }],
  trips: tripAcara, busTrip: [{ trip_id: 2, participant_id: "a", vehicle_id: 7 }, { trip_id: 3, participant_id: "a", vehicle_id: null }],
  offset: "+07:00", kereta: [],
});
assert.deepEqual(unduhTrip[0], ["QR code", "Name", "Vehicle", "Trip: Ke venue (6 Nov 07:00)", "Trip: Jeep Merapi (7 Nov 05:00)", "Trip: Pulang"]);
assert.deepEqual(unduhTrip[1], ["Q-1", "Andi Pratama", "Bus 1", "", "Bus 7", "No vehicle"]);
assert.deepEqual(unduhTrip[2], ["Q-2", "Budi Santoso", "", "", "", ""]);
const acaraTrip: KeadaanAcara = {
  ...acara, vehicles: busDua, trips: tripAcara,
  busBawaan: [{ participant_id: "a", vehicle_id: 5 }],
  busTrip: [{ trip_id: 2, participant_id: "a", vehicle_id: 7 }, { trip_id: 3, participant_id: "a", vehicle_id: null }],
};
// Diimpor kembali tanpa diubah: tidak ada yang ditulis.
const balikTrip = rencanaBus(unduhTrip, acaraTrip);
assert.equal(balikTrip.galat, null);
assert.deepEqual(balikTrip.baris.map((b) => b.status), ["tetap"]);
assert.equal(balikTrip.dilewati, 1);
assert.deepEqual(balikTrip.penempatan, []);
assert.deepEqual(balikTrip.busTrip, []);
// Budi hanya diisi kolom trip; Andi "none" di Jeep Merapi; Citra ke kendaraan
// baru di trip saja. Kendaraan utama tidak berubah untuk yang kosong.
const isiTrip = rencanaBus([
  ["QR code", "Name", "Vehicle", "Trip: Ke venue (6 Nov 07:00)", "Trip: Jeep Merapi (7 Nov 05:00)", "Trip: Pulang"],
  ["Q-1", "Andi Pratama", "Bus 1", "", "none", "No vehicle"],
  ["Q-2", "Budi Santoso", "", "", "bus 7", ""],
  ["Q-3", "Citra Lestari", "Bus 1", "Jeep 3", "", ""],
], acaraTrip);
assert.equal(isiTrip.galat, null);
assert.deepEqual(isiTrip.baris.map((b) => `${b.status}:${b.tujuan}`), [
  "pindah:Bus 1 · Jeep Merapi: No vehicle · Pulang: No vehicle",
  "pindah:Jeep Merapi: bus 7",
  "masuk:Bus 1 · Ke venue: Jeep 3",
]);
assert.deepEqual(isiTrip.penempatan.map((p) => `${p.tujuan}:${p.participant_ids}`), ["Bus 1:c"]);
assert.deepEqual(isiTrip.busTrip, [
  { trip_id: 2, tujuan: null, participant_ids: ["a"] },
  { trip_id: 2, tujuan: "Bus 7", participant_ids: ["b"] },
  { trip_id: 1, tujuan: "Jeep 3", participant_ids: ["c"] },
]);
assert.deepEqual(isiTrip.busBaru, ["Jeep 3"]);
// Jam trip berubah sesudah diunduh: dicocokkan lewat nama bila unik.
const jamGeser = rencanaBus([["QR code", "Name", "Vehicle", "Trip: Ke venue (6 Nov 08:00)"], ["Q-2", "", "", "Bus 1"]], acaraTrip);
assert.deepEqual(jamGeser.busTrip, [{ trip_id: 1, tujuan: "Bus 1", participant_ids: ["b"] }]);
// Kolom trip yang tidak dikenal menolak seluruh berkas, dengan nama kolomnya.
const tripAsing = rencanaBus([["QR code", "Name", "Vehicle", "Trip: Pantai"], ["Q-1", "", "Bus 1", "Bus 7"]], acaraTrip);
assert.match(tripAsing.galat ?? "", /Column "Trip: Pantai" does not match a Trip/);
const tripGanda = rencanaBus([["QR code", "Name", "Vehicle", "Trip: Pulang", "Trip: pulang"], ["Q-1", "", "Bus 1", "", ""]], acaraTrip);
assert.match(tripGanda.galat ?? "", /same Trip \(Pulang\)/);
// Kendaraan utama penuh: barisnya ditolak dan pengecualian tripnya tidak ditulis.
const penuhTrip = rencanaBus([["QR code", "Name", "Vehicle", "Trip: Pulang"], ["Q-2", "", "Bus 7", "Bus 1"], ["Q-3", "", "Bus 7", "Bus 1"]], { ...acaraTrip, busBawaan: [], busTrip: [] });
assert.deepEqual(penuhTrip.baris.map((b) => b.status), ["masuk", "tolak"]);
assert.deepEqual(penuhTrip.busTrip, [{ trip_id: 3, tujuan: "Bus 1", participant_ids: ["b"] }]);

// Kapasitas per trip sudah dinilai di pratinjau: Bus 7 (1 kursi) di Ke venue.
const tripPenuh = rencanaBus([["QR code", "Name", "Vehicle", "Trip: Ke venue"], ["Q-2", "", "", "Bus 7"], ["Q-3", "", "", "Bus 7"]], acaraTrip);
assert.deepEqual(tripPenuh.baris.map((b) => `${b.status}:${b.alasan}`), ["pindah:Trip vehicles change", "tolak:Bus 7 full on Ke venue (capacity 1)"]);
assert.deepEqual(tripPenuh.busTrip, [{ trip_id: 1, tujuan: "Bus 7", participant_ids: ["b"] }]);
// Kendaraan utama baru muat sebagai utama, tetapi Jeep Merapi (ikut utama)
// sudah berisi Andi di Bus 7: ditolak di pratinjau, bukan baru saat disimpan.
const utamaPenuh = rencanaBus([["QR code", "Name", "Vehicle"], ["Q-2", "", "Bus 7"]], acaraTrip);
assert.deepEqual(utamaPenuh.baris.map((b) => `${b.status}:${b.alasan}`), ["tolak:Bus 7 full on Jeep Merapi (capacity 1)"]);
assert.deepEqual(utamaPenuh.penempatan, []);
// Kursi yang dikosongkan baris berikutnya di berkas yang sama ikut dihitung.
const kursiLepas = rencanaBus([["QR code", "Name", "Vehicle", "Trip: Jeep Merapi"], ["Q-2", "", "Bus 7", ""], ["Q-1", "", "Bus 1", "No vehicle"]], acaraTrip);
assert.deepEqual(kursiLepas.baris.map((b) => b.status), ["masuk", "pindah"]);
assert.deepEqual(kursiLepas.penempatan.map((p) => `${p.tujuan}:${p.participant_ids}`), ["Bus 7:b"]);
// "Default" mengembalikan orang ke kendaraan utama di trip itu; tanpa
// pengecualian tersimpan tidak ada yang berubah.
const kembali = rencanaBus([["QR code", "Name", "Vehicle", "Trip: Jeep Merapi"], ["Q-1", "", "", "Default"], ["Q-2", "", "", "default"]], acaraTrip);
assert.deepEqual(kembali.baris.map((b) => `${b.status}:${b.tujuan}`), ["pindah:Jeep Merapi: Default", "tetap:Jeep Merapi: Default"]);
assert.deepEqual(kembali.busTrip, [{ trip_id: 2, tujuan: IKUT, participant_ids: ["a"] }]);
assert.deepEqual(kembali.busBaru, []);
// Kolom (info) yang labelnya diawali "Trip:" bukan kolom trip.
const infoTrip = rencanaBus([["QR code", "Name", "Vehicle", "Trip: preference (info)"], ["Q-2", "", "Bus 1", "Pantai"]], acaraTrip);
assert.equal(infoTrip.galat, null);
assert.deepEqual(infoTrip.busTrip, []);

// Pindah kamar di hotel yang sama: Royal 1208 malam 5-6, lalu 1410 malam 6-8.
// 1208 hanya muat satu, dan Budi sudah di sana mulai 6 Nov: tidak bertabrakan.
const royal: KeadaanAcara = {
  ...acara,
  hotels: [{ id: 3, name: "Royal", check_in_at: null, check_out_at: null }],
  rooms: [{ id: 30, hotel_id: 3, room_number: "1208", capacity: 1 }, { id: 31, hotel_id: 3, room_number: "1410", capacity: 2 }],
  lodging: [
    { id: 7, participant_id: "b", hotel_id: 3, room_id: 30, check_in_at: "2026-11-06T07:00:00.000Z", check_out_at: "2026-11-08T05:00:00.000Z" },
    { id: 8, participant_id: "a", hotel_id: 3, room_id: null, check_in_at: null, check_out_at: null },
  ],
};
const pindahKamar = rencanaKamar([
  ["QR code", "Name", "Hotel 1", "Room 1", "Check-in 1", "Check-out 1", "Hotel 2", "Room 2", "Check-in 2", "Check-out 2"],
  ["", "Andi Pratama", "Royal", "1208", "05/11/2026", "06/11/2026", "Royal", "1410", "06/11/2026", "08/11/2026"],
], royal);
assert.deepEqual(pindahKamar.baris.map((b) => b.status), ["pindah", "masuk"]);
assert.deepEqual(pindahKamar.akhir, [{ participant_id: "a", stays: [
  { hotel: "Royal", kamar: "1208", malam: { masuk: "2026-11-05", keluar: "2026-11-06" }, asli: null },
  { hotel: "Royal", kamar: "1410", malam: { masuk: "2026-11-06", keluar: "2026-11-08" }, asli: null },
] }]);
// Malam 5-7 di 1208 bertabrakan dengan Budi (6-8) pada malam 6: penuh, seluruh baris ditolak.
const tabrakKamar = rencanaKamar([
  ["QR code", "Name", "Hotel 1", "Room 1", "Check-in 1", "Check-out 1", "Hotel 2", "Room 2", "Check-in 2", "Check-out 2"],
  ["", "Andi Pratama", "Royal", "1208", "05/11/2026", "07/11/2026", "Royal", "1410", "07/11/2026", "08/11/2026"],
], royal);
assert.deepEqual(tabrakKamar.baris.map((b) => b.status), ["tolak", "tolak"]);
assert.deepEqual(tabrakKamar.akhir, []);
// Tanpa tanggal: kamar diisi pada stay yang sudah ada, stay lain tetap.
const isiKamar = rencanaKamar([["Hotel", "Room", "Name"], ["Mulia", "1208", "Citra Lestari"]], {
  ...duaHotel,
  lodging: [
    { id: 1, participant_id: "c", hotel_id: 1, room_id: null, check_in_at: "2026-11-05T07:00:00.000Z", check_out_at: "2026-11-06T05:00:00.000Z" },
    { id: 2, participant_id: "c", hotel_id: 2, room_id: 20, check_in_at: "2026-11-06T07:00:00.000Z", check_out_at: "2026-11-08T05:00:00.000Z" },
  ],
});
assert.deepEqual(isiKamar.akhir, [{ participant_id: "c", stays: [
  { hotel: "Mulia", kamar: "1208", malam: null, asli: { check_in_at: "2026-11-05T07:00:00.000Z", check_out_at: "2026-11-06T05:00:00.000Z" } },
  { hotel: "Royal", kamar: "214", malam: null, asli: { check_in_at: "2026-11-06T07:00:00.000Z", check_out_at: "2026-11-08T05:00:00.000Z" } },
] }]);
// Tanpa tanggal ke hotel lain: pindah seluruhnya.
const keLain = rencanaKamar([["Hotel", "Room", "Name"], ["Mulia", "1208", "Andi Pratama"]], { ...duaHotel, settings: { gender_field_key: "jk", enforce_same_gender: false } });
assert.deepEqual(keLain.akhir, [{ participant_id: "a", stays: [{ hotel: "Mulia", kamar: "1208", malam: null, asli: null }] }]);

console.log("impor.check: ok");
