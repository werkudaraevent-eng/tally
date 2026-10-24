import assert from "node:assert/strict";
import { pindahHalaman, type KlikTautan } from "./jaga-navigasi.ts";

const sekarang = "https://tally.test/e/kso/admin/rundown?section=3";
const klik = (href: string, ubah: Partial<KlikTautan> = {}): KlikTautan => ({ href, target: "", unduh: false, tombol: 0, pengubah: false, ...ubah });

// Rel navigasi, bilah atas: halaman lain di aplikasi ini ditanyakan dulu.
assert.equal(pindahHalaman(klik("/e/kso/admin/speakers"), sekarang), true);
assert.equal(pindahHalaman(klik("https://tally.test/e/kso/admin"), sekarang), true);
assert.equal(pindahHalaman(klik("/e/kso/admin/speakers", { target: "_self" }), sekarang), true);
// Query lain memasang ulang halaman yang sama.
assert.equal(pindahHalaman(klik("/e/kso/admin/rundown"), sekarang), true);

// Dilewatkan: jangkar di halaman yang sama, tab baru, unduhan, Ctrl/Cmd, tombol lain, alamat luar.
assert.equal(pindahHalaman(klik("#isi"), sekarang), false);
assert.equal(pindahHalaman(klik("/e/kso/admin/rundown?section=3#isi"), sekarang), false);
assert.equal(pindahHalaman(klik("/e/kso/rundown", { target: "_blank" }), sekarang), false);
assert.equal(pindahHalaman(klik("/api/admin/export", { unduh: true }), sekarang), false);
assert.equal(pindahHalaman(klik("/e/kso/admin/speakers", { pengubah: true }), sekarang), false);
assert.equal(pindahHalaman(klik("/e/kso/admin/speakers", { tombol: 1 }), sekarang), false);
assert.equal(pindahHalaman(klik("https://example.com/"), sekarang), false);
assert.equal(pindahHalaman(klik("mailto:panitia@example.com"), sekarang), false);

console.log("jaga-navigasi: ok");
