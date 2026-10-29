import assert from "node:assert/strict";
import { masaSesi, perpanjangSesi } from "./masa-sesi.ts";

const HARI = 24 * 60 * 60 * 1000;
const pada = (iso: string) => Date.parse(iso);
// KSO: 6 sampai 8 November.
const kso = { event_date: "2026-11-06", end_date: "2026-11-08" };
const akhirKso = pada("2026-11-11T00:00:00Z");

// Masuk 1 Oktober: dulu habis 31 Oktober. Sekarang sampai lewat acara.
assert.equal(masaSesi(pada("2026-10-01T10:00:00Z"), kso), akhirKso);
// Mendekati acara: 30 hari dari sekarang lebih jauh dari akhir acara.
assert.equal(masaSesi(pada("2026-10-29T10:00:00Z"), kso), pada("2026-10-29T10:00:00Z") + 30 * HARI);
// Acara masih jauh: paling jauh 90 hari.
const jauh = { event_date: "2027-06-01", end_date: null };
assert.equal(masaSesi(pada("2026-10-01T00:00:00Z"), jauh), pada("2026-10-01T00:00:00Z") + 90 * HARI);
// Tanpa tanggal acara, atau tanggal rusak: 30 hari seperti dulu.
assert.equal(masaSesi(0, { event_date: null, end_date: null }), 30 * HARI);
assert.equal(masaSesi(0, { event_date: "besok", end_date: null }), 30 * HARI);
// Acara sehari memakai event_date.
assert.equal(masaSesi(pada("2026-11-20T00:00:00Z"), { event_date: "2026-12-30", end_date: null }), pada("2027-01-02T00:00:00Z"));

// Sesi dari sign-in 1 Okt (habis 31 Okt) dibuka 2 Okt: diperpanjang sampai sesudah acara.
assert.equal(perpanjangSesi(pada("2026-10-02T08:00:00Z"), pada("2026-10-31T10:00:00Z"), kso), akhirKso);
// Sudah diperpanjang: tidak menulis lagi.
assert.equal(perpanjangSesi(pada("2026-10-02T09:00:00Z"), akhirKso, kso), null);
// Dibuka lagi beberapa jam kemudian dengan masa 30 hari: kurang dari sehari bedanya, tidak menulis.
const t = pada("2026-11-20T08:00:00Z");
assert.equal(perpanjangSesi(t + 6 * 60 * 60 * 1000, t + 30 * HARI, kso), null);
// Dua hari kemudian: diperpanjang lagi.
assert.equal(perpanjangSesi(t + 2 * HARI, t + 30 * HARI, kso), t + 32 * HARI);
// Tidak pernah memperpendek sesi yang lebih panjang dari target.
assert.equal(perpanjangSesi(t, t + 200 * HARI, kso), null);

console.log("masa-sesi: ok");
