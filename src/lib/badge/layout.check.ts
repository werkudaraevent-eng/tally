import assert from "node:assert/strict";
import { areaAman, jepitKeSisi, susunLembar, ukuranSisi, type BadgeFormat } from "./layout.ts";
import { barisRundown, pilihHari } from "./rundown.ts";

const f = (patch: Partial<BadgeFormat>): BadgeFormat => ({ kind: "khusus", w_mm: 100, h_mm: 140, fold: "side", ...patch });

// A4 lipat empat: belakang terbalik di kiri bawah, petunjuk di kuadran tersembunyi.
const a4 = susunLembar(f({ kind: "a4_lipat4" }));
assert.deepEqual(a4.kertas, { w: 210, h: 297 });
assert.equal(a4.panels.find((p) => p.side === "back")?.rotate, 180);
assert.deepEqual(a4.petunjuk, { x: 105, y: 0, w: 105, h: 148.5 });

// A5 lipat dua: belakang tegak, tanpa putaran.
assert.ok(susunLembar(f({ kind: "a5_lipat2" })).panels.every((p) => p.rotate === 0));

// A4 isi dua: dua badge, satu garis potong.
const isi2 = susunLembar(f({ kind: "a4_isi2" }));
assert.equal(isi2.badgePerLembar, 2);
assert.equal(isi2.potongan.length, 1);

// Khusus lipat samping 100x140: unit 200x140 di A4 mendatar (297x210), satu per lembar, di tengah.
const samping = susunLembar(f({}));
assert.equal(samping.namaKertas, "A4 mendatar");
assert.equal(samping.tidakMuat, null);
assert.equal(samping.badgePerLembar, 1);
assert.equal(samping.panels[0].x, 48.5);
assert.equal(samping.panels[1].x, 148.5);
assert.ok(samping.tanda.length > 0);

// Printer berisi A5: unit yang sama tetap muat di A5 mendatar (210x148)? 200+12 > 210, jadi tanpa tepi.
const sampingA5 = susunLembar(f({ w_mm: 100, h_mm: 140 }), "A5");
assert.equal(sampingA5.namaKertas, "A5 mendatar");
assert.equal(sampingA5.tanda.length, 0);

// Khusus lipat atas: belakang di bawah, terbalik.
const atas = susunLembar(f({ fold: "top" }));
assert.equal(atas.panels[1].rotate, 180);
assert.equal(atas.namaKertas, "A4 tegak");

// Satu sisi A6 di A4: empat per lembar, bukan halaman seukuran badge.
const tunggal = susunLembar(f({ kind: "tunggal", w_mm: 90, h_mm: 130 }));
assert.deepEqual(tunggal.kertas, { w: 210, h: 297 });
assert.equal(tunggal.badgePerLembar, 4);
assert.equal(new Set(tunggal.panels.map((p) => p.slot)).size, 4);

// Terlalu besar: diberi tahu, bukan diam-diam dikecilkan.
assert.ok(susunLembar(f({ w_mm: 200, h_mm: 280 })).tidakMuat);

// A4 isi dua: badge kedua menyentuh tepi bawah kertas, jadi area amannya ikut 6 mm.
assert.equal(areaAman(f({ kind: "a4_isi2" }), "front").bottom, 6);

// Area aman: 6 mm di tepi kertas, 3 mm di lipatan. Sisi terbalik menukar atas dan bawah.
assert.deepEqual(areaAman(f({ kind: "a4_lipat4" }), "front"), { top: 6, right: 3, bottom: 3, left: 6 });
// Belakang dilihat sesudah dilipat: tepi bawah kertas jadi tepi atasnya, tepi kiri kertas jadi kanannya.
assert.deepEqual(areaAman(f({ kind: "a4_lipat4" }), "back"), { top: 6, right: 6, bottom: 3, left: 3 });

// Jepit: tidak ada isi yang keluar dari sisi.
const sisi = ukuranSisi(f({ w_mm: 60, h_mm: 90 }));
const dijepit = jepitKeSisi([{ type: "qr", field: "qr_code", x: 50, y: 80, size: 42 }], sisi);
assert.ok(dijepit[0].x + 42 <= 60 && dijepit[0].y + 42 <= 90);

// Rundown: baris berjam sama digabung; "hari_ini" jatuh ke hari pertama bila tidak cocok.
const hari = [
	{ id: "1", nama: "Hari 1", tanggal: "2026-10-15", items: [{ jam: "10.00", judul: "A", jeda: false }, { jam: "10.00", judul: "B", jeda: false }] },
	{ id: "2", nama: "Hari 2", tanggal: "2026-10-16", items: [{ jam: "09.00", judul: "C", jeda: false }] },
];
assert.deepEqual(barisRundown(hari, "auto", true, "2026-10-16"), [{ jam: "10.00", judul: "A · B" }]);
assert.equal(pilihHari(hari, "hari_ini", "2026-10-16")[0].id, "2");
assert.equal(pilihHari(hari, "hari_ini", "2026-01-01")[0].id, "1");
assert.equal(barisRundown(hari, "semua", false, "")[2].hari, "Hari 2");

console.log("badge layout ok");
