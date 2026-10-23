import assert from "node:assert/strict";
import { jenisGambarDariIsi } from "./jenis-gambar.ts";

const b = (...x: number[]) => Uint8Array.from(x);
assert.equal(jenisGambarDariIsi(b(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
assert.equal(jenisGambarDariIsi(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
assert.equal(jenisGambarDariIsi(Uint8Array.from(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))), "image/webp");
// RIFF lain (WAV) bukan gambar.
assert.equal(jenisGambarDariIsi(Uint8Array.from(Buffer.from("RIFF\0\0\0\0WAVEfmt "))), null);
// Teks berlabel image/jpeg, berkas kosong, dan berkas terpotong ditolak.
assert.equal(jenisGambarDariIsi(Uint8Array.from(Buffer.from("<svg xmlns="))), null);
assert.equal(jenisGambarDariIsi(b()), null);
assert.equal(jenisGambarDariIsi(b(0xff, 0xd8)), null);
console.log("jenis-gambar ok");
