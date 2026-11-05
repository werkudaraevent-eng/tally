import assert from "node:assert/strict";
import { pecahLabel } from "./impor.ts";

const m = (masuk: string, keluar: string) => ({ masuk, keluar });
const baris = (i: number, orang: string, malam: { masuk: string; keluar: string } | null, label = "GH20", hotel = "Hotel A", nomor = "") =>
  ({ i, hotel, label, orang, nama: orang.toUpperCase(), malam, nomor });
const tidakAda = () => ({ penghuni: new Set<string>(), nomor: null });

// GH20: dua orang 5–6 Nov, dua orang lain 6–8 Nov. Malam bersambung tidak tumpang tindih.
const gh20 = [baris(0, "a", m("2026-11-05", "2026-11-06")), baris(1, "b", m("2026-11-05", "2026-11-06")), baris(2, "c", m("2026-11-06", "2026-11-08")), baris(3, "d", m("2026-11-06", "2026-11-08"))];
const satu = pecahLabel(gh20, tidakAda);
assert.equal(satu.dipecah.length, 1);
assert.deepEqual(satu.dipecah[0].periode.map((p) => p.label), ["GH20", "GH20 · 6 Nov"]);
assert.deepEqual([0, 1, 2, 3].map((i) => satu.labelBaris.get(i)), ["GH20", "GH20", "GH20 · 6 Nov", "GH20 · 6 Nov"]);
assert.deepEqual(satu.dipecah[0].periode[1].nama, ["C", "D"]);

// Kamar GH20 yang sudah ada dihuni kelompok kedua: kelompok itu yang tetap memakai GH20.
const ada = pecahLabel(gh20, () => ({ penghuni: new Set(["c", "d"]), nomor: null }));
assert.deepEqual(ada.dipecah[0].periode.map((p) => p.label), ["GH20 · 5 Nov", "GH20"]);

// Orang yang sama di dua periode: satu kamar, tidak dipecah.
assert.equal(pecahLabel([baris(0, "a", m("2026-11-05", "2026-11-06")), baris(1, "a", m("2026-11-07", "2026-11-08"))], tidakAda).dipecah.length, 0);

// Malam tumpang tindih: satu periode, berbagi kamar.
assert.equal(pecahLabel([baris(0, "a", m("2026-11-05", "2026-11-08")), baris(1, "b", m("2026-11-06", "2026-11-08"))], tidakAda).dipecah.length, 0);

// Malam tidak diketahui: dibiarkan seperti berkas.
assert.equal(pecahLabel([baris(0, "a", null), baris(1, "b", m("2026-11-06", "2026-11-08"))], tidakAda).dipecah.length, 0);

// Label sama di hotel berbeda: tidak dibandingkan.
assert.equal(pecahLabel([baris(0, "a", m("2026-11-05", "2026-11-06")), baris(1, "b", m("2026-11-06", "2026-11-08"), "GH20", "Hotel B")], tidakAda).dipecah.length, 0);

// Kelompok yang sama kembali di periode ketiga: label yang sama dengan periode pertamanya.
const tiga = pecahLabel([baris(0, "a", m("2026-11-05", "2026-11-06")), baris(1, "b", m("2026-11-06", "2026-11-07")), baris(2, "a", m("2026-11-07", "2026-11-08"))], tidakAda);
assert.deepEqual(tiga.dipecah[0].periode.map((p) => p.label), ["GH20", "GH20 · 6 Nov", "GH20"]);

// Yang tetap disebut, dengan nomornya.
assert.deepEqual(satu.dipecah[0].periode.map((p) => [p.tetap, p.nomor]), [[true, null], [false, null]]);

// Nomor kamar sama di semua baris yang berisi nomor (unduhan "Download current stays", atau kamar fisik yang sama): tidak dipecah.
const sama = gh20.map((b) => ({ ...b, nomor: "1210" }));
assert.equal(pecahLabel(sama, () => ({ penghuni: new Set(["a", "b", "c", "d"]), nomor: "1210" })).dipecah.length, 0);
// Nomor hanya untuk satu periode: tetap dipecah, supaya nomor itu tidak sampai ke kelompok lain.
assert.equal(pecahLabel([{ ...gh20[0], nomor: "1210" }, ...gh20.slice(1)], tidakAda).dipecah.length, 1);

// Nomor kamar lama hanya di baris 6–8 Nov: kelompok itu yang tetap di GH20 (dan nomornya), walau penghuninya seri.
const nomor68 = pecahLabel(gh20.map((b) => (b.orang === "c" || b.orang === "d" ? { ...b, nomor: "1210" } : b)), () => ({ penghuni: new Set(["a", "b", "c", "d"]), nomor: "1210" }));
assert.deepEqual(nomor68.dipecah[0].periode.map((p) => [p.label, p.tetap, p.nomor]), [["GH20 · 5 Nov", false, null], ["GH20", true, "1210"]]);
const beda = pecahLabel(gh20.map((b) => ({ ...b, nomor: b.orang === "c" || b.orang === "d" ? "1210" : "1305" })), () => ({ penghuni: new Set(["a", "b", "c", "d"]), nomor: "1210" }));
assert.deepEqual(beda.dipecah[0].periode.map((p) => [p.label, p.tetap, p.nomor]), [["GH20 · 5 Nov", false, "1305"], ["GH20", true, "1210"]]);
// Seri tanpa nomor di berkas: periode pertama tetap, dengan nomor lamanya.
const seri = pecahLabel(gh20, () => ({ penghuni: new Set(["a", "b", "c", "d"]), nomor: "1210" }));
assert.deepEqual(seri.dipecah[0].periode.map((p) => [p.label, p.nomor]), [["GH20", "1210"], ["GH20 · 6 Nov", null]]);

// Label panjang: dipotong sebelum akhiran tanggal, jadi tiga periode tetap tiga kamar.
const panjang = "Kamar keluarga besar panitia inti A1";
const tigaPanjang = pecahLabel([baris(0, "a", m("2026-11-05", "2026-11-06"), panjang), baris(1, "b", m("2026-11-06", "2026-11-07"), panjang), baris(2, "c", m("2026-11-07", "2026-11-08"), panjang)], tidakAda);
const labelTiga = tigaPanjang.dipecah[0].periode.map((p) => p.label);
assert.equal(new Set(labelTiga).size, 3);
assert.ok(labelTiga.every((l) => l.length <= 40));
assert.ok(labelTiga[2].endsWith(" · 7 Nov"));

console.log("pecah-label ok");
