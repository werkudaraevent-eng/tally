import assert from "node:assert/strict";
import { pilihWaktu, tanggalDiZona, teksSelesai, teksWaktu, type WaktuLangkah } from "./waktu.ts";

const b1: WaktuLangkah = { date: "2026-11-05", start: "09.00", end: "16.00" };
const b2: WaktuLangkah = { date: "2026-11-04", start: "13.00", end: null };
const b3: WaktuLangkah = { date: "2026-11-04", start: "08.30", end: "09.00" };
const peta = new Map([[11, b1], [12, b2], [13, b3]]);

// Tanpa tautan atau tanpa baris yang terlihat: tanpa tanggal.
assert.equal(pilihWaktu([], peta), null);
assert.equal(pilihWaktu([99], peta), null);
// Satu baris; beberapa baris: yang paling awal (tanggal, lalu jam).
assert.deepEqual(pilihWaktu([11], peta), b1);
assert.deepEqual(pilihWaktu([11, 12, 13], peta), b3);
assert.deepEqual(pilihWaktu([11, 99, 12], peta), b2);
// Jam English "08:30" dan Indonesia "09.00" dibandingkan sebagai jam.
assert.deepEqual(pilihWaktu([1, 2], new Map([[1, { date: "2026-11-04", start: "10:00", end: null }], [2, { date: "2026-11-04", start: "9:30", end: null }]])), { date: "2026-11-04", start: "9:30", end: null });
// Tanggal rusak diabaikan.
assert.equal(pilihWaktu([1], new Map([[1, { date: "", start: "09.00", end: null }]])), null);

// Tanggal di zona acara: 17.30 UTC 1 Nov = 2 Nov di WIB (+7), masih 1 Nov di UTC.
assert.equal(tanggalDiZona(new Date("2026-11-01T17:30:00Z"), "Asia/Jakarta"), "2026-11-02");
assert.equal(tanggalDiZona(new Date("2026-11-01T16:30:00Z"), "Asia/Jakarta"), "2026-11-01");

const senin: WaktuLangkah = { date: "2026-11-02", start: "09.00", end: "17.00" };
// Hari lain: panjang untuk Langkah berikutnya, pendek untuk daftar.
assert.deepEqual(teksWaktu(senin, "2026-10-22", "id", true), { relatif: null, teks: "Senin, 2 November · 09.00–17.00", tanpaRelatif: "Senin, 2 November · 09.00–17.00" });
assert.equal(teksWaktu(senin, "2026-10-22", "id", false).teks, "Sen, 2 Nov · 09.00–17.00");
assert.equal(teksWaktu({ date: "2026-11-02", start: "09:00", end: "17:00" }, "2026-10-22", "en", true).teks, "Monday 2 November · 09:00–17:00");
assert.equal(teksWaktu({ date: "2026-11-02", start: "09:00", end: "17:00" }, "2026-10-22", "en", false).teks, "Mon 2 Nov · 09:00–17:00");
// Hari ini: chip memuat kata "Hari ini", teks di sampingnya hanya jam.
assert.deepEqual(teksWaktu(senin, "2026-11-02", "id", true), { relatif: "hari-ini", teks: "Hari ini · 09.00–17.00", tanpaRelatif: "09.00–17.00" });
assert.equal(teksWaktu(senin, "2026-11-02", "en", false).teks, "Today · 09.00–17.00");
// Besok, termasuk lewat akhir bulan.
assert.equal(teksWaktu({ date: "2026-11-06", start: "05.00", end: null }, "2026-11-05", "id", false).teks, "Besok, Jum 6 Nov · 05.00");
assert.equal(teksWaktu({ date: "2026-11-06", start: "05.00", end: null }, "2026-11-05", "id", true).teks, "Besok, Jumat 6 November · 05.00");
assert.equal(teksWaktu({ date: "2026-11-01", start: "05:00", end: null }, "2026-10-31", "en", false).teks, "Tomorrow, Sun 1 Nov · 05:00");
// Jam selesai sama dengan jam mulai (penanda momen): satu jam saja.
assert.equal(teksWaktu({ date: "2026-11-02", start: "09.00", end: "09.00" }, "2026-10-22", "id", false).teks, "Sen, 2 Nov · 09.00");

// Selesai: hari ini jamnya saja, hari lain dengan tanggal.
assert.equal(teksSelesai("2026-11-02T03:12:00Z", "Asia/Jakarta", "2026-11-02", "id"), "10.12");
assert.equal(teksSelesai("2026-11-02T03:12:00Z", "Asia/Jakarta", "2026-11-05", "id"), "Sen, 2 Nov · 10.12");
assert.equal(teksSelesai("2026-11-02T03:12:00Z", "Asia/Jakarta", "2026-11-05", "en"), "Mon 2 Nov · 10:12");

console.log("checkpoint/waktu ok");
