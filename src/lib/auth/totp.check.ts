import assert from "node:assert/strict";
import { alamatOtpauth, base32Decode, base32Encode, buatRahasia, cocokkanKode, kodeUntukLangkah } from "./totp.ts";

// Vektor uji RFC 6238 lampiran B (SHA-1, rahasia ASCII "12345678901234567890").
const rfc = base32Encode(Buffer.from("12345678901234567890"));
assert.equal(rfc, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
for (const [detik, harap] of [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]] as const) {
  assert.equal(kodeUntukLangkah(rfc, Math.floor(detik / 30), 8), harap, `RFC vector at ${detik}`);
}
assert.equal(kodeUntukLangkah(rfc, 1), "287082");

// base32 bolak-balik, termasuk spasi dan huruf kecil dari aplikasi.
const r = buatRahasia();
assert.equal(r.length, 32);
assert.deepEqual(base32Decode(r.toLowerCase().replace(/(.{4})/g, "$1 ")), base32Decode(r));

// Jendela ±1 langkah, dan penolakan kode yang sudah dipakai.
const ms = 1_800_000_000_000;
const kini = Math.floor(ms / 30000);
assert.equal(cocokkanKode(r, kodeUntukLangkah(r, kini), { ms }), kini);
assert.equal(cocokkanKode(r, kodeUntukLangkah(r, kini - 1), { ms }), kini - 1);
assert.equal(cocokkanKode(r, kodeUntukLangkah(r, kini + 1), { ms }), kini + 1);
assert.equal(cocokkanKode(r, kodeUntukLangkah(r, kini - 2), { ms }), null);
assert.equal(cocokkanKode(r, kodeUntukLangkah(r, kini), { ms, langkahTerakhir: kini }), null, "replay refused");
assert.equal(cocokkanKode(r, "12345", { ms }), null);
assert.equal(cocokkanKode(r, "abcdef", { ms }), null);
const k = kodeUntukLangkah(r, kini);
assert.equal(cocokkanKode(r, `${k.slice(0, 3)} ${k.slice(3)}`, { ms }), kini, "space in the middle is fine");

assert.match(alamatOtpauth(r, "mas admin"), /^otpauth:\/\/totp\/Tally%3Amas%20admin\?secret=[A-Z2-7]{32}&issuer=Tally/);

console.log("totp ok");
