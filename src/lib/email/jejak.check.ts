import assert from "node:assert/strict";
import { bacaToken, bukaOtomatis, buatToken, GIF_KOSONG, statusEmail } from "./jejak.ts";

const R = "rahasia-uji-yang-cukup-panjang-untuk-hmac";

const a = buatToken(R, "a", 42);
assert.match(a, /^a42\.[A-Za-z0-9_-]{22}$/);
assert.deepEqual(bacaToken(R, a), { jenis: "a", id: 42 });
assert.deepEqual(bacaToken(R, buatToken(R, "b", 9007199254740)), { jenis: "b", id: 9007199254740 });

// Rahasia lain, id lain, jenis lain, atau tanda diubah: ditolak.
assert.equal(bacaToken("rahasia-lain-yang-juga-cukup-panjang", a), null);
assert.equal(bacaToken(R, a.replace("a42", "a43")), null);
assert.equal(bacaToken(R, a.replace("a42", "b42")), null);
assert.equal(bacaToken(R, `${a.slice(0, -1)}${a.endsWith("A") ? "B" : "A"}`), null);
// Bentuk rusak.
for (const rusak of [null, undefined, "", "a0.xxxxxxxxxxxxxxxxxxxxxx", "c1.xxxxxxxxxxxxxxxxxxxxxx", "a1", "a01.xxxxxxxxxxxxxxxxxxxxxx", `${a}x`, "a99999999999999999.xxxxxxxxxxxxxxxxxxxxxx"]) {
  assert.equal(bacaToken(R, rusak as string), null, String(rusak));
}

// Apple Mail Privacy Protection: hanya "Mozilla/5.0".
assert.equal(bukaOtomatis("Mozilla/5.0"), true);
assert.equal(bukaOtomatis(""), true);
assert.equal(bukaOtomatis(null), true);
assert.equal(bukaOtomatis("Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)"), false);
assert.equal(bukaOtomatis("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"), false);
assert.equal(bukaOtomatis("Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17126; Pro)"), false);

assert.equal(GIF_KOSONG.length, 43);
assert.equal(GIF_KOSONG.subarray(0, 6).toString(), "GIF89a");

assert.equal(statusEmail({ clicked_at: "x", opened_at: null }), "diklik");
assert.equal(statusEmail({ opened_at: "x", opened_auto_at: "y" }), "dibuka");
assert.equal(statusEmail({ opened_auto_at: "y" }), "dibuka_otomatis");
assert.equal(statusEmail({}), "terkirim");

console.log("jejak ok");

// Ringkasan: Opened memuat Clicked, Apple dipisah.
import { ringkasEmail, statusTerkuat } from "./jejak-status.ts";
assert.deepEqual(ringkasEmail(["diklik", "dibuka", "dibuka_otomatis", "terkirim", "terkirim"]), { terkirim: 5, dibuka: 2, dibuka_otomatis: 1, diklik: 1 });
assert.deepEqual(ringkasEmail([]), { terkirim: 0, dibuka: 0, dibuka_otomatis: 0, diklik: 0 });
assert.equal(statusTerkuat(null, "terkirim"), "terkirim");
assert.equal(statusTerkuat("diklik", "dibuka"), "diklik");
assert.equal(statusTerkuat("dibuka_otomatis", "dibuka"), "dibuka");
console.log("jejak-status ok");
