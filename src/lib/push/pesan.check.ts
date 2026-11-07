import assert from "node:assert/strict";
import { buatPesan, ISI_MAX, platformDari, potong } from "./pesan.ts";

assert.equal(potong("  Bus   berangkat\n07.15 ", 50), "Bus berangkat 07.15");
const panjang = "Titik kumpul pindah ke North Hall pintu dua karena hujan deras di area parkir";
const hasil = potong(panjang, 40);
assert.ok(hasil.length <= 40, hasil);
assert.ok(hasil.endsWith("…"));
assert.ok(!hasil.includes("pint…"), "dipotong di batas kata");
assert.equal(potong("x".repeat(60), 10), `${"x".repeat(9)}…`);

const p = buatPesan({ judul: "", isi: "a".repeat(400), buka: "https://contoh.test/e/a/peserta?tab=info", lang: "id", tag: "p:1" });
assert.equal(p.web_push, 8030);
assert.equal(p.notification.title, "Pengumuman baru");
assert.ok(p.notification.body.length <= ISI_MAX);
assert.equal(p.notification.tag, "p:1");
assert.equal(buatPesan({ judul: "", isi: "", buka: "https://x.test", lang: "en" }).notification.title, "New announcement");
assert.equal("tag" in buatPesan({ judul: "a", isi: "", buka: "https://x.test", lang: "en" }).notification, false);

assert.equal(platformDari("Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)"), "ios");
assert.equal(platformDari("Mozilla/5.0 (Linux; Android 14; SM-A546E)"), "android");
assert.equal(platformDari("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "desktop");
assert.equal(platformDari(null), "desktop");
