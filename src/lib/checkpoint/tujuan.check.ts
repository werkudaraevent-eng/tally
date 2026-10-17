import assert from "node:assert/strict";
import { adaKolomTujuan, angkaTujuan, bacaTujuan, kalimatTujuan, kolomTujuanBelumAda, rapiTujuan, rewardEnBaru, tujuanPeserta } from "./tujuan.ts";

// Isian admin: angka bulat 1..1.000.000 saja; teks dirapikan seperti di route.
assert.equal(angkaTujuan("40"), 40);
assert.equal(angkaTujuan(" 1000000 "), 1_000_000);
assert.equal(angkaTujuan("1000001"), null);
assert.equal(angkaTujuan("0"), null);
assert.equal(angkaTujuan(""), null);
assert.equal(angkaTujuan("2.5"), null);
assert.equal(angkaTujuan("1e3"), null);
assert.equal(angkaTujuan("-5"), null);
assert.equal(rapiTujuan("  masuk   undian\nmalam  puncak "), "masuk undian malam puncak");

// Database tanpa migrasi 202610170001: kolomnya tidak ada, berarti tanpa tujuan.
assert.equal(bacaTujuan({ event_id: "e", enabled: true, points_enabled: true }), null);
assert.equal(adaKolomTujuan({ event_id: "e", enabled: true, points_enabled: true }), false);
assert.equal(adaKolomTujuan({ event_id: "e", points_goal: null }), true);
assert.equal(adaKolomTujuan(null), false);
assert.equal(kolomTujuanBelumAda({ code: "42703" }), true);
assert.equal(kolomTujuanBelumAda({ code: "PGRST204" }), true);
assert.equal(kolomTujuanBelumAda({ code: "23514" }), false);
assert.equal(kolomTujuanBelumAda(null), false);

// Baca: kosong, tidak sah, atau tanpa "untuk apa" = tanpa tujuan.
assert.equal(bacaTujuan(null), null);
assert.equal(bacaTujuan({ points_goal: null, points_reward: null, points_reward_en: null }), null);
assert.equal(bacaTujuan({ points_goal: 40, points_reward: "   " }), null);
assert.equal(bacaTujuan({ points_goal: 0, points_reward: "masuk undian" }), null);
assert.equal(bacaTujuan({ points_goal: 2.5, points_reward: "masuk undian" }), null);
assert.equal(bacaTujuan({ points_goal: "40", points_reward: "masuk undian" }), null);
assert.deepEqual(bacaTujuan({ points_goal: 40, points_reward: " masuk undian malam puncak ", points_reward_en: " " }), {
  points: 40,
  reward: "masuk undian malam puncak",
  reward_en: null,
});

const goal = { points: 40, reward: "masuk undian malam puncak", reward_en: "enter the gala-night draw" };

// Tanpa baris: poin mati, tanpa tujuan, atau tujuan di atas semua poin yang ditawarkan.
assert.equal(tujuanPeserta({ points_enabled: false, goal }, { earned: 20, total: 40 }, "id"), null);
assert.equal(tujuanPeserta({ points_enabled: true, goal: null }, { earned: 20, total: 40 }, "id"), null);
assert.equal(tujuanPeserta({ points_enabled: true, goal: { ...goal, points: 50 } }, { earned: 20, total: 40 }, "id"), null);

// Sisa dan tercapai (tidak pernah minus).
assert.deepEqual(tujuanPeserta({ points_enabled: true, goal }, { earned: 20, total: 40 }, "id"), { sisa: 20, reward: goal.reward, lang: "id" });
assert.deepEqual(tujuanPeserta({ points_enabled: true, goal: { ...goal, points: 30 } }, { earned: 40, total: 40 }, "id"), { sisa: 0, reward: goal.reward, lang: "id" });

// Bahasa mengikuti halaman, seperti judul checkpoint: teks dasar Indonesia, English opsional.
// "Main language" acara tidak ikut menentukan, jadi menggantinya tidak membuat kalimat campur.
assert.deepEqual(tujuanPeserta({ points_enabled: true, goal }, { earned: 20, total: 40 }, "en"), { sisa: 20, reward: goal.reward_en, lang: "en" });
assert.deepEqual(tujuanPeserta({ points_enabled: true, goal: { ...goal, reward_en: null } }, { earned: 20, total: 40 }, "en"), { sisa: 20, reward: goal.reward, lang: "id" });

// Teks English lama ikut dihapus bila teks Indonesianya diganti tanpa terjemahan baru.
assert.equal(rewardEnBaru(goal, "masuk undian malam puncak", undefined), "enter the gala-night draw");
assert.equal(rewardEnBaru(goal, "tukar voucher kopi", undefined), null);
assert.equal(rewardEnBaru(goal, "tukar voucher kopi", " swap for a coffee voucher "), "swap for a coffee voucher");
assert.equal(rewardEnBaru(goal, "masuk undian malam puncak", ""), null);
assert.equal(rewardEnBaru(goal, "masuk undian malam puncak", null), null);
assert.equal(rewardEnBaru(null, "masuk undian", undefined), null);

// Kalimat.
assert.deepEqual(kalimatTujuan({ sisa: 20, reward: "masuk undian malam puncak", lang: "id" }), { tebal: "20 poin lagi", sisa: "untuk masuk undian malam puncak." });
assert.deepEqual(kalimatTujuan({ sisa: 0, reward: "masuk undian malam puncak", lang: "id" }), { tebal: "Poin sudah cukup", sisa: "untuk masuk undian malam puncak." });
assert.deepEqual(kalimatTujuan({ sisa: 20, reward: "enter the gala-night draw", lang: "en" }), { tebal: "20 more points", sisa: "to enter the gala-night draw." });
assert.deepEqual(kalimatTujuan({ sisa: 1, reward: "enter the gala-night draw", lang: "en" }), { tebal: "1 more point", sisa: "to enter the gala-night draw." });
assert.deepEqual(kalimatTujuan({ sisa: 0, reward: "enter the gala-night draw", lang: "en" }), { tebal: "You have enough points", sisa: "to enter the gala-night draw." });
// Tanda baca sendiri tidak digandakan; angka besar ditulis apa adanya, seperti kepala kartu.
assert.equal(kalimatTujuan({ sisa: 5, reward: "dapat merchandise!", lang: "id" }).sisa, "untuk dapat merchandise!");
assert.equal(kalimatTujuan({ sisa: 5, reward: "masuk undian malam puncak.", lang: "id" }).sisa, "untuk masuk undian malam puncak.");
assert.equal(kalimatTujuan({ sisa: 1200, reward: "masuk undian", lang: "id" }).tebal, "1200 poin lagi");
// Kata sambung yang sudah diketik admin tidak digandakan; kata yang hanya diawali "to" tetap utuh.
assert.equal(kalimatTujuan({ sisa: 20, reward: "untuk masuk undian", lang: "id" }).sisa, "untuk masuk undian.");
assert.equal(kalimatTujuan({ sisa: 20, reward: "Untuk  masuk undian", lang: "id" }).sisa, "untuk masuk undian.");
assert.equal(kalimatTujuan({ sisa: 20, reward: "to enter the draw", lang: "en" }).sisa, "to enter the draw.");
assert.equal(kalimatTujuan({ sisa: 20, reward: "toast at the gala", lang: "en" }).sisa, "to toast at the gala.");

console.log("tujuan poin checkpoint: ok");
