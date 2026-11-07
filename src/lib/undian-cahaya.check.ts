import assert from "node:assert/strict";
import {
  CAHAYA_LAG_MS, CAHAYA_PAD, CAHAYA_SEBAR_MS, acakTetap, bacaHasil, bagiGelombang, gelombangTerbit, hasilGelombang, jadwalCahaya,
  jadwalPublik, padHasil, selisihJam, sisaMenyala, waktuTampil, warnaPertunjukan,
} from "./undian-cahaya.ts";

// Jadwal: 500 orang, 3 pemenang, 20 detik.
const s = 1_000_000;
const j500 = jadwalCahaya(500, 3, s, s + 20_000);
assert.ok(j500.waves.length >= 2 && j500.waves.length <= 5, "2-5 gelombang");
assert.equal(j500.waves.at(-1)!.at, s + 20_000, "gelombang terakhir = reveal_at");
assert.equal(j500.waves.at(-1)!.left, 3, "sisa akhir = pemenang");
for (let i = 1; i < j500.waves.length; i += 1) {
  assert.ok(j500.waves[i].left < j500.waves[i - 1].left, "selalu turun");
  assert.ok(j500.waves[i].at > j500.waves[i - 1].at, "waktu naik");
}
assert.ok(j500.waves[0].at >= s + 3000, "pertunjukan minimal 3 detik sebelum gelombang pertama");

// Kolam kecil: 4 orang, 3 pemenang -> 1 gelombang memadamkan 1.
const j4 = jadwalCahaya(4, 3, s, s + 12_000);
assert.deepEqual(j4.waves.map((w) => w.left), [3]);
// Semua menang: satu gelombang tanpa yang padam.
const j3 = jadwalCahaya(3, 3, s, s + 12_000);
assert.deepEqual(j3.waves.map((w) => w.left), [3]);
// 6 orang 1 pemenang: tiap gelombang padam minimal 1.
const j6 = jadwalCahaya(6, 1, s, s + 12_000);
let prev = 6;
for (const w of j6.waves) { assert.ok(w.left < prev); prev = w.left; }
assert.equal(prev, 1);

// Pembagian: jumlah per gelombang tepat sesuai jadwal, pemenang tidak pernah padam.
const refs = Array.from({ length: 500 }, (_, i) => `p${i}`);
const winners = [
  { ref: "p7", is_backup: false, slot_order: 1 },
  { ref: "p8", is_backup: false, slot_order: 2 },
  { ref: "p9", is_backup: true, slot_order: 1 },
];
const map = bagiGelombang(refs, winners, j500);
assert.equal(Object.keys(map).length, 500);
assert.equal(map.p7, 0);
assert.equal(map.p8, 0);
assert.equal(map.p9, -1);
let alive = 500;
j500.waves.forEach((wave, index) => {
  const out = Object.values(map).filter((kode) => kode === index + 1).length;
  alive -= out;
  assert.equal(alive, wave.left, `sisa sesudah gelombang ${index + 1}`);
});

// Isi kotak: pemenang "stay" lalu "win"; gugur "stay" sampai gelombangnya.
const k = 4;
assert.deepEqual([1, 2, 3, 4].map((j) => hasilGelombang(0, j, k)), ["stay", "stay", "stay", "win"]);
assert.deepEqual([1, 2, 3, 4].map((j) => hasilGelombang(-2, j, k)), ["stay", "stay", "stay", "backup:2"]);
assert.deepEqual([1, 2, 3, 4].map((j) => hasilGelombang(2, j, k)), ["stay", "out", "out", "out"]);
// Panjang sama apa pun hasilnya: panjang sandi tidak membocorkan pemenang.
for (const hasil of ["stay", "out", "win", "backup:12"] as const) assert.equal(padHasil(hasil).length, CAHAYA_PAD);
assert.equal(bacaHasil(padHasil("backup:3")), "backup:3");
assert.equal(bacaHasil("menang"), null);

// Kunci terbit hanya setelah waktunya; Reveal lebih awal menerbitkan semuanya.
assert.equal(gelombangTerbit(j500.waves, j500.waves[0].at - 1, s + 20_000), 0);
assert.equal(gelombangTerbit(j500.waves, j500.waves[0].at, s + 20_000), 1);
assert.equal(gelombangTerbit(j500.waves, s + 5_000, s + 5_000), j500.waves.length);
assert.equal(waktuTampil(j500.waves.at(-1)!, s + 5_000), s + 5_000 + CAHAYA_LAG_MS);

// Penghitung: penuh sebelum gelombang, tepat sesudahnya.
assert.equal(sisaMenyala(j500, s + 100, s + 20_000), 500);
const w1 = waktuTampil(j500.waves[0], s + 20_000);
assert.equal(sisaMenyala(j500, w1 + CAHAYA_SEBAR_MS + 1, s + 20_000), j500.waves[0].left);
assert.equal(sisaMenyala(j500, s + 40_000, s + 20_000), 3);

// Jumlah disembunyikan: skala 240, pemenang tetap tepat, tetap turun.
const pub = jadwalPublik(jadwalCahaya(1200, 5, s, s + 20_000), false);
assert.equal(pub.total, 240);
assert.equal(pub.waves.at(-1)!.left, 5);
prev = 240;
for (const w of pub.waves) { assert.ok(w.left < prev); prev = w.left; }
assert.equal(jadwalPublik(j500, true), j500);

// Warna sama untuk semua HP pada detik yang sama (fase hanya menggeser saat menyala).
const t = s + 7_000;
assert.deepEqual(warnaPertunjukan(j500, t, 0.1, false), warnaPertunjukan(j500, t, 0.9, false));
// Sebelum menyala: gelap.
assert.deepEqual(warnaPertunjukan(j500, s + 10, 0.9, false), [10, 11, 16]);

// Jam: sampel dengan perjalanan tersingkat menang.
assert.equal(selisihJam([{ sent: 0, received: 400, server: 1000 }, { sent: 1000, received: 1040, server: 2520 }]), 1500);
assert.equal(selisihJam([]), 0);

// Acak tetap: sama untuk teks yang sama, dalam 0..1.
assert.equal(acakTetap("abc"), acakTetap("abc"));
assert.ok(acakTetap("x") >= 0 && acakTetap("x") < 1);

console.log("undian-cahaya.check: ok");
