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
assert.deepEqual(cariPeserta("A", orang), { jenis: "tidak_ada", pilihan: [] });
assert.deepEqual(cariPeserta("Bu", orang), { jenis: "tidak_ada", pilihan: [] });
assert.deepEqual(cariPeserta("  ", orang), { jenis: "tidak_ada", pilihan: [] });

const hotel = [
  { id: 1, name: "Hotel Mulia", check_in_at: "2026-11-06T07:00:00Z", check_out_at: "2026-11-08T05:00:00Z" },
  { id: 2, name: "Seruni", check_in_at: null, check_out_at: null },
];
const kamar = [
  { id: 10, hotel_id: 1, room_number: null, label: "GH20" },
  { id: 11, hotel_id: 1, room_number: "305", label: "GH21" },
  { id: 20, hotel_id: 2, room_number: null, label: "S1" },
  { id: 12, hotel_id: 1, room_number: null, label: "GH20 · 7 Nov" },
];
const s = (room_id: number | null, hotel_id: number, masuk: string | null = null, keluar: string | null = null) => ({ room_id, hotel_id, check_in_at: masuk, check_out_at: keluar });
const MULIA = { check_in: "2026-11-06", check_out: "2026-11-08" };
const KOSONG = { check_in: null, check_out: null };

assert.deepEqual(pilihKamar({ stays: [], kamar, hotel }), { jenis: "tanpa_stay" });
assert.deepEqual(pilihKamar({ stays: [s(null, 1)], kamar, hotel }), { jenis: "tanpa_kamar", hotel: ["Hotel Mulia"] });
// Tanggal ikut hotel bila stay dan kamar tidak bertanggal (14.00 WIB = 07.00Z).
assert.deepEqual(pilihKamar({ stays: [s(10, 1)], kamar, hotel }), { jenis: "satu", kamar: kamar[0], malam: MULIA });
// Dua kamar: harus memilih, pilihan membawa tanggal.
const dua = pilihKamar({ stays: [s(10, 1), s(20, 2)], kamar, hotel });
assert.equal(dua.jenis, "banyak");
assert.deepEqual(dua.jenis === "banyak" && dua.pilihan.map((p) => [p.room_id, p.check_in]), [[20, null], [10, "2026-11-06"]]);
assert.deepEqual(pilihKamar({ stays: [s(10, 1), s(20, 2)], kamar, hotel, namaHotel: "seruni" }), { jenis: "satu", kamar: kamar[2], malam: KOSONG });
assert.deepEqual(pilihKamar({ stays: [s(10, 1), s(20, 2)], kamar, hotel, roomId: 20 }), { jenis: "satu", kamar: kamar[2], malam: KOSONG });
// room_id kamar orang lain tidak pernah dipakai.
const asing = pilihKamar({ stays: [s(10, 1)], kamar, hotel, roomId: 11 });
assert.equal(asing.jenis, "banyak");
assert.deepEqual(asing.jenis === "banyak" && asing.pilihan.map((p) => p.room_id), [10]);
assert.deepEqual(pilihKamar({ stays: [s(99, 1)], kamar, hotel }), { jenis: "tanpa_kamar", hotel: ["Hotel Mulia"] });

// Pindah kamar di hotel yang sama: GH20 malam 6 Nov, "GH20 · 7 Nov" malam 7 Nov.
const pindah = [s(10, 1, "2026-11-06T07:00:00Z", "2026-11-07T05:00:00Z"), s(12, 1, "2026-11-07T07:00:00Z", "2026-11-08T05:00:00Z")];
const tanpaTanggal = pilihKamar({ stays: pindah, kamar, hotel });
assert.equal(tanpaTanggal.jenis, "banyak");
assert.deepEqual(tanpaTanggal.jenis === "banyak" && tanpaTanggal.pilihan, [
  { room_id: 10, hotel: "Hotel Mulia", label: "GH20", room_number: null, check_in: "2026-11-06", check_out: "2026-11-07" },
  { room_id: 12, hotel: "Hotel Mulia", label: "GH20 · 7 Nov", room_number: null, check_in: "2026-11-07", check_out: "2026-11-08" },
]);
assert.deepEqual(pilihKamar({ stays: pindah, kamar, hotel, tanggal: "2026-11-06" }), { jenis: "satu", kamar: kamar[0], malam: { check_in: "2026-11-06", check_out: "2026-11-07" } });
assert.deepEqual(pilihKamar({ stays: pindah, kamar, hotel, tanggal: "2026-11-07" }), { jenis: "satu", kamar: kamar[3], malam: { check_in: "2026-11-07", check_out: "2026-11-08" } });
// Hari check-out terakhir bukan malam menginap: ditolak dengan pilihan.
const lewat = pilihKamar({ stays: pindah, kamar, hotel, tanggal: "2026-11-08" });
assert.equal(lewat.jenis, "tanggal_lain");
assert.deepEqual(lewat.jenis === "tanggal_lain" && lewat.pilihan.map((p) => p.room_id), [10, 12]);
// Stay tanpa tanggal mencakup semua malam.
assert.deepEqual(pilihKamar({ stays: [s(20, 2)], kamar, hotel, tanggal: "2026-11-09" }), { jenis: "satu", kamar: kamar[2], malam: KOSONG });
// Satu kamar, dua stay terpisah: rentang pertama..terakhir.
assert.deepEqual(pilihKamar({ stays: [s(10, 1, "2026-11-06T07:00:00Z", "2026-11-07T05:00:00Z"), s(10, 1, "2026-11-07T07:00:00Z", "2026-11-08T05:00:00Z")], kamar, hotel }),
  { jenis: "satu", kamar: kamar[0], malam: { check_in: "2026-11-06", check_out: "2026-11-08" } });

console.log("bot-nomor-kamar ok");
