import assert from "node:assert/strict";
import { pecahLabel } from "./impor.ts";

const m = (masuk: string, keluar: string) => ({ masuk, keluar });
const baris = (i: number, orang: string, malam: { masuk: string; keluar: string } | null, label = "GH20", hotel = "Hotel A") =>
  ({ i, hotel, label, orang, nama: orang.toUpperCase(), malam });
const tidakAda = () => new Set<string>();

// GH20: dua orang 5–6 Nov, dua orang lain 6–8 Nov. Malam bersambung tidak tumpang tindih.
const gh20 = [baris(0, "a", m("2026-11-05", "2026-11-06")), baris(1, "b", m("2026-11-05", "2026-11-06")), baris(2, "c", m("2026-11-06", "2026-11-08")), baris(3, "d", m("2026-11-06", "2026-11-08"))];
const satu = pecahLabel(gh20, tidakAda);
assert.equal(satu.dipecah.length, 1);
assert.deepEqual(satu.dipecah[0].periode.map((p) => p.label), ["GH20", "GH20 · 6 Nov"]);
assert.deepEqual([0, 1, 2, 3].map((i) => satu.labelBaris.get(i)), ["GH20", "GH20", "GH20 · 6 Nov", "GH20 · 6 Nov"]);
assert.deepEqual(satu.dipecah[0].periode[1].nama, ["C", "D"]);

// Kamar GH20 yang sudah ada dihuni kelompok kedua: kelompok itu yang tetap memakai GH20.
const ada = pecahLabel(gh20, () => new Set(["c", "d"]));
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

console.log("pecah-label ok");
