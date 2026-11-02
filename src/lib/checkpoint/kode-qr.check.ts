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

// QR tetap untuk dicetak (migrasi 202611020001).
{
  const { kodeTetap, periksaKode, bacaQrSesi } = await import("./kode-qr.ts");
  const tetap1 = kodeTetap(R, EV, 900, 1);
  const tetap2 = kodeTetap(R, EV, 900, 2);
  assert.match(tetap1, /^[A-Za-z0-9_-]{12}$/);
  assert.notEqual(tetap1, tetap2);
  assert.notEqual(tetap1, kodeTetap(R, EV, 901, 1));
  assert.notEqual(tetap1, kode);
  const berganti = bacaQrSesi(null);
  assert.deepEqual(berganti, { mode: "rotating", version: 1, changed_at: null });
  assert.deepEqual(bacaQrSesi({ checkpoint_qr: "fixed", checkpoint_qr_version: 3, checkpoint_qr_changed_at: "2026-11-02T07:00:00Z" }), { mode: "fixed", version: 3, changed_at: "2026-11-02T07:00:00Z" });
  assert.equal(bacaQrSesi({ checkpoint_qr: "lain", checkpoint_qr_version: 0 }).mode, "rotating");
  assert.equal(bacaQrSesi({ checkpoint_qr_version: 0 }).version, 1);
  const tetapSesi = { mode: "fixed" as const, version: 2, changed_at: null };
  // Kode berganti selalu sah, juga di sesi cetak.
  assert.equal(periksaKode(R, EV, 900, kode, t0, berganti), "sah");
  assert.equal(periksaKode(R, EV, 900, kode, t0, tetapSesi), "sah");
  // Kode cetak hanya sah di sesi cetak dengan nomor sekarang, kapan pun.
  assert.equal(periksaKode(R, EV, 900, tetap2, t0 + 86_400_000, tetapSesi), "sah");
  assert.equal(periksaKode(R, EV, 900, tetap1, t0, tetapSesi), "lama");
  // Sesi kembali ke berganti: poster nomor sekarang pun ditolak sebagai lama.
  assert.equal(periksaKode(R, EV, 900, tetap2, t0, { mode: "rotating", version: 2, changed_at: null }), "lama");
  // Sesi atau acara lain, dan kode acak: salah.
  assert.equal(periksaKode(R, EV, 901, tetap2, t0, tetapSesi), "salah");
  assert.equal(periksaKode(R, "00000000-0000-0000-0000-000000000002", 900, tetap2, t0, tetapSesi), "salah");
  assert.equal(periksaKode(R, EV, 900, "AAAAAAAAAAAA", t0, tetapSesi), "salah");
  // Foto QR berganti yang kedaluwarsa tetap salah, bukan lama.
  assert.equal(periksaKode(R, EV, 900, kode, t0 + 60_000, tetapSesi), "salah");
}

// Undian yang memakai kehadiran sesi ini.
{
  const { undianMemakaiSesi } = await import("./qr-undian.ts");
  const g = (...children: unknown[]) => ({ op: "and", children });
  assert.equal(undianMemakaiSesi(g(), 900), false);
  assert.equal(undianMemakaiSesi(g({ var: "checked_in", is: true, session_id: 900 }), 900), true);
  assert.equal(undianMemakaiSesi(g({ var: "checked_in", is: true, session_id: 901 }), 900), false);
  assert.equal(undianMemakaiSesi(g({ var: "checked_in", is: true }), 900), true);
  assert.equal(undianMemakaiSesi(g({ op: "or", children: [{ var: "scan_count", cmp: "gte", value: 2 }] }), 900), true);
  assert.equal(undianMemakaiSesi(g({ var: "checkpoint_goal", is: true }), 900), true);
  assert.equal(undianMemakaiSesi(g({ var: "total_spend", cmp: "gte", value: 1 }), 900), false);
  assert.equal(undianMemakaiSesi(null, 900), false);
  assert.equal(undianMemakaiSesi({ op: "and", children: "x" }, 900), false);
}
