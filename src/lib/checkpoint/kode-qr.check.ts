import assert from "node:assert/strict";
import { berlakuSampai, jendela, kodeCheckpoint, kodeSah, PERIODE_DETIK } from "./kode-qr.ts";
import { alamatQrCheckpoint, bacaQrCheckpoint } from "./qr-alamat.ts";

const R = "rahasia-uji-0123456789";
const EV = "00000000-0000-0000-0000-000000000001";
const t0 = Date.UTC(2026, 10, 6, 2, 0, 0); // tepat di awal jendela
const kode = kodeCheckpoint(R, EV, 900, jendela(t0));

assert.equal(PERIODE_DETIK, 30);
assert.match(kode, /^[A-Za-z0-9_-]{12}$/);
assert.equal(berlakuSampai(t0), t0 + 30_000);
assert.equal(berlakuSampai(t0 + 29_999), t0 + 30_000);

// Sah di jendelanya dan di jendela sesudahnya (QR baru berganti saat dipindai).
assert.equal(kodeSah(R, EV, 900, kode, t0), true);
assert.equal(kodeSah(R, EV, 900, kode, t0 + 59_999), true);
// Foto QR yang dibuka lebih dari satu jendela kemudian: mati.
assert.equal(kodeSah(R, EV, 900, kode, t0 + 60_000), false);
// Kode dari masa depan (jam ponsel maju) tidak diterima.
assert.equal(kodeSah(R, EV, 900, kode, t0 - 1), false);
// Sesi, acara, atau rahasia lain: kodenya lain.
assert.equal(kodeSah(R, EV, 901, kode, t0), false);
assert.equal(kodeSah(R, "00000000-0000-0000-0000-000000000002", 900, kode, t0), false);
assert.equal(kodeSah("rahasia-lain-0123456789", EV, 900, kode, t0), false);
// Panjang lain tidak melempar.
assert.equal(kodeSah(R, EV, 900, kode.slice(0, 11), t0), false);
assert.equal(kodeSah(R, EV, 900, "", t0), false);

// Alamat di QR dan pembacanya.
const alamat = alamatQrCheckpoint("https://event.example.test", "kso 21", 900, kode);
assert.equal(alamat, `https://event.example.test/e/kso%2021/pindai?s=900&k=${kode}`);
assert.deepEqual(bacaQrCheckpoint(alamat), { slug: "kso 21", sesi: 900, kode });
assert.deepEqual(bacaQrCheckpoint(`  https://klien.example.test/pindai?s=7&k=${kode}\n`), { slug: null, sesi: 7, kode });
assert.equal(bacaQrCheckpoint("QA-0001"), null);
assert.equal(bacaQrCheckpoint("https://event.example.test/e/x/peserta?s=1&k=abcdefghijkl"), null);
assert.equal(bacaQrCheckpoint("https://event.example.test/e/x/pindai?s=0&k=abcdefghijkl"), null);
assert.equal(bacaQrCheckpoint("https://event.example.test/e/x/pindai?s=1&k=pendek"), null);
assert.equal(bacaQrCheckpoint("javascript:alert(1)//pindai?s=1&k=abcdefghijkl"), null);
assert.equal(bacaQrCheckpoint("https://event.example.test/e/%E0%A4%A/pindai?s=1&k=abcdefghijkl"), null);

console.log("kode-qr.check: ok");
