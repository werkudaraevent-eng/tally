import assert from "node:assert/strict";
import { cariPeserta, pilihKamar, rapikanNama, rapikanNomor } from "./bot-nomor-kamar.ts";

const orang = [
  { id: "a", name: "Andi Pratama", company: "PT A" },
  { id: "b", name: "Budi  Santoso", company: null },
  { id: "c", name: "Budi Setiawan", company: "PT C" },
  { id: "d", name: "Citra Lestari", company: null },
  { id: "e", name: "Citra Lestari", company: "PT E" },
  { id: "f", name: "José Ramírez", company: null },
];

assert.equal(rapikanNama("  ANDI   pratama. "), "andi pratama");
assert.equal(rapikanNomor("  30 5 "), "30 5");

// Persis (abaikan huruf besar, spasi ganda, tanda baca, diakritik).
assert.deepEqual(cariPeserta("andi PRATAMA", orang), { jenis: "satu", peserta: orang[0] });
assert.deepEqual(cariPeserta("Budi Santoso", orang), { jenis: "satu", peserta: orang[1] });
assert.deepEqual(cariPeserta("Jose Ramirez", orang), { jenis: "satu", peserta: orang[5] });
// Nama kembar: tidak pernah dipilihkan.
assert.deepEqual(cariPeserta("Citra Lestari", orang), { jenis: "kembar", pilihan: [orang[3], orang[4]] });
// Terpotong dari foto: tidak dipilihkan, kandidat dikembalikan.
assert.deepEqual(cariPeserta("Budi S", orang), { jenis: "tidak_ada", pilihan: [orang[1], orang[2]] });
assert.deepEqual(cariPeserta("Andi", orang), { jenis: "tidak_ada", pilihan: [orang[0]] });
assert.deepEqual(cariPeserta("Zainal", orang), { jenis: "tidak_ada", pilihan: [] });
assert.deepEqual(cariPeserta("  ", orang), { jenis: "tidak_ada", pilihan: [] });

const hotel = [{ id: 1, name: "Hotel Mulia" }, { id: 2, name: "Seruni" }];
const kamar = [
  { id: 10, hotel_id: 1, room_number: null, label: "GH20" },
  { id: 11, hotel_id: 1, room_number: "305", label: "GH21" },
  { id: 20, hotel_id: 2, room_number: null, label: "S1" },
];
const s = (room_id: number | null, hotel_id: number) => ({ room_id, hotel_id, check_in_at: null, check_out_at: null });

assert.deepEqual(pilihKamar({ stays: [], kamar, hotel }), { jenis: "tanpa_stay" });
assert.deepEqual(pilihKamar({ stays: [s(null, 1)], kamar, hotel }), { jenis: "tanpa_kamar", hotel: ["Hotel Mulia"] });
assert.deepEqual(pilihKamar({ stays: [s(10, 1)], kamar, hotel }), { jenis: "satu", kamar: kamar[0] });
// Dua kamar (pindah hotel di tengah acara): harus memilih.
const dua = pilihKamar({ stays: [s(10, 1), s(20, 2)], kamar, hotel });
assert.equal(dua.jenis, "banyak");
assert.deepEqual(dua.jenis === "banyak" && dua.pilihan.map((p) => p.room_id), [10, 20]);
// Nama hotel mempersempit.
assert.deepEqual(pilihKamar({ stays: [s(10, 1), s(20, 2)], kamar, hotel, namaHotel: "seruni" }), { jenis: "satu", kamar: kamar[2] });
// room_id dari pilihan dipakai bila milik peserta ini.
assert.deepEqual(pilihKamar({ stays: [s(10, 1), s(20, 2)], kamar, hotel, roomId: 20 }), { jenis: "satu", kamar: kamar[2] });
// room_id kamar orang lain tidak pernah dipakai.
const asing = pilihKamar({ stays: [s(10, 1)], kamar, hotel, roomId: 11 });
assert.equal(asing.jenis, "banyak");
assert.deepEqual(asing.jenis === "banyak" && asing.pilihan.map((p) => p.room_id), [10]);
// Kamar yang tidak ada di daftar kamar acara (id acara lain) diabaikan.
assert.deepEqual(pilihKamar({ stays: [s(99, 1)], kamar, hotel }), { jenis: "tanpa_kamar", hotel: ["Hotel Mulia"] });

console.log("bot-nomor-kamar ok");
