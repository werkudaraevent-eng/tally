import assert from "node:assert/strict";
import { adaFormat, pecahBaris, pecahTeks, susunTeks, teksPolos } from "./landing-teks-kaya.ts";

// Teks lama tanpa tanda: bukan format, polosnya sama persis.
const lama = "Panelists:\nSantoso, Chairman - ASPI\nModerator:\nAbraham J. Adriaansz";
assert.equal(adaFormat(lama), false);
assert.equal(teksPolos(lama), lama);
assert.equal(adaFormat("Dr.* catatan"), false); // bintang tanpa pasangan
assert.equal(adaFormat(null), false);

// Tanda dasar dan bertumpuk.
assert.deepEqual(pecahBaris("a **b** *c* ==d=="), [
  { teks: "a " }, { teks: "b", tebal: true }, { teks: " " }, { teks: "c", miring: true }, { teks: " " }, { teks: "d", warna: true },
]);
assert.deepEqual(pecahBaris("==**x**=="), [{ teks: "x", tebal: true, warna: true }]);
assert.deepEqual(pecahBaris("\\*tidak\\* miring"), [{ teks: "*tidak* miring" }]);

// Daftar.
const daftar = "Speakers:\n- **Luis Trevino**, AFI\n- Nancy\n1. Satu\n2. Dua";
const blok = pecahTeks(daftar);
assert.deepEqual(blok.map((b) => b.jenis), ["p", "ul", "ul", "ol", "ol"]);
assert.equal(adaFormat(daftar), true);
assert.equal(teksPolos(daftar), "Speakers:\n• Luis Trevino, AFI\n• Nancy\n1. Satu\n2. Dua");

// Pulang-pergi: susunTeks(pecahTeks(x)) == x untuk teks yang ditulis editor.
for (const x of [daftar, lama, "a **b** *c* ==d==", "harga 2\\*3 \\= 6", "\\- bukan daftar", "1\\. bukan nomor"]) {
  assert.equal(susunTeks(pecahTeks(x)), x, x);
}
// Nomor diurutkan ulang.
assert.equal(susunTeks(pecahTeks("5. a\n9. b\n\n1. c")), "1. a\n2. b\n\n1. c");
// Paragraf yang diketik "- x" dilindungi supaya tidak berubah jadi daftar.
assert.equal(susunTeks([{ jenis: "p", isi: [{ teks: "- x" }] }]), "\\- x");
assert.equal(teksPolos("\\- x"), "- x");
// Spasi di tepi tanda keluar dari tanda.
assert.equal(susunTeks([{ jenis: "p", isi: [{ teks: "a" }, { teks: " b ", tebal: true }, { teks: "c" }] }]), "a **b** c");

console.log("landing-teks-kaya ok");
