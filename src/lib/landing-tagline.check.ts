import assert from "node:assert/strict";
import { lindungiBintang, pecahJudul, susunJudul, tanpaBintang } from "./landing-tagline.ts";

// Tanda kata biasa.
assert.deepEqual(pecahJudul("Liburan bareng, *tumbuh* bareng."), [
  { teks: "Liburan bareng, ", sorot: false },
  { teks: "tumbuh", sorot: true },
  { teks: " bareng.", sorot: false },
]);
// Bintang biasa tidak berpasangan (QA #109 M3).
assert.equal(tanpaBintang("Hotel 5* dan resort 4* untuk tamu VIP"), "Hotel 5* dan resort 4* untuk tamu VIP");
assert.equal(tanpaBintang("Diskon * untuk * semua"), "Diskon * untuk * semua");
// Bintang yang dilindungi tetap bintang dan tidak menggeser tanda (H1).
assert.equal(tanpaBintang("Liburan 5\\* bareng, *tumbuh* bareng."), "Liburan 5* bareng, tumbuh bareng.");
assert.deepEqual(
  pecahJudul("Liburan 5\\* bareng, *tumbuh* bareng.").filter((p) => p.sorot),
  [{ teks: "tumbuh", sorot: true }],
);
assert.deepEqual(pecahJudul("*tum\\*buh*"), [{ teks: "tum*buh", sorot: true }]);
// Garis miring.
assert.equal(tanpaBintang("a\\b"), "a\\b");
assert.equal(tanpaBintang(lindungiBintang("a\\*b")), "a\\*b");
// Bolak-balik kolom Highlight.
for (const nilai of ["Liburan *bareng*, tumbuh 5\\* *lagi*.", "*Semua*", "tanpa tanda", "x\\\\y *z*"]) {
  assert.equal(susunJudul(pecahJudul(nilai)), nilai);
}
// Tanda di tengah kata tetap terbaca.
assert.deepEqual(pecahJudul("*tum*buh").map((p) => p.sorot), [true, false]);
// Tanda dengan spasi di tepi bukan tanda.
assert.equal(tanpaBintang("a * b * c"), "a * b * c");
console.log("landing-tagline: ok");
