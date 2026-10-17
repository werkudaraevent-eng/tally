import assert from "node:assert/strict";
import { escape, fold, icsTiketKereta, toUtcStamp } from "./kalender-ics.ts";

assert.equal(toUtcStamp("2026-08-06", "09:00:00", "+08:00"), "20260806T010000Z");
assert.equal(toUtcStamp("2026-11-06", "08:20", "+07:00"), "20261106T012000Z");
assert.equal(toUtcStamp("2026-11-06", null, "+07:00"), "20261106T020000Z");
assert.equal(escape("a,b;c\nd\\e"), "a\\,b\\;c\\nd\\\\e");
assert.equal(fold("x".repeat(80)), `${"x".repeat(75)}\r\n ${"x".repeat(5)}`);

const dasar = {
  uid: "ev-peserta-outbound@tally",
  lang: "id" as const,
  namaKereta: "Argo Semeru 77",
  kelas: "Executive",
  asal: "Gambir",
  tujuan: "Yogyakarta",
  tanggal: "2026-11-06",
  berangkat: "08:20",
  tiba: "15:10",
  gerbong: "EKS 3",
  kursi: "12A",
  kodeBooking: "ABC123",
  acara: "24 Fly Beyond Limit",
  offset: "+07:00",
  sekarang: new Date("2026-10-17T00:00:00Z"),
};
// Baris panjang dilipat (RFC 5545); diuji setelah lipatannya dibuka.
const buka = (teks: string | null) => (teks ?? "").split("\r\n ").join("");
const ics = buka(icsTiketKereta(dasar));
assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
assert.ok(ics.includes("DTSTART:20261106T012000Z"));
assert.ok(ics.includes("DTEND:20261106T081000Z"));
assert.ok(ics.includes("SUMMARY:Kereta Argo Semeru 77: Gambir → Yogyakarta"));
assert.ok(ics.includes("DESCRIPTION:Executive · Gerbong EKS 3\\, kursi 12A\\nKode booking: ABC123\\n24 Fly Beyond Limit"));
assert.ok(ics.includes("LOCATION:Gambir"));
assert.ok(ics.includes("TRIGGER:-PT2H"));
assert.ok(ics.includes("UID:ev-peserta-outbound@tally"));

// Kereta malam: tiba keesokan harinya.
assert.ok(buka(icsTiketKereta({ ...dasar, berangkat: "21:30", tiba: "05:10" })).includes("DTEND:20261106T221000Z"));
// Tanpa jam tiba: satu jam.
assert.ok(buka(icsTiketKereta({ ...dasar, tiba: null })).includes("DTEND:20261106T022000Z"));
// English.
assert.ok(buka(icsTiketKereta({ ...dasar, lang: "en" })).includes("SUMMARY:Train Argo Semeru 77: Gambir → Yogyakarta"));
// Jam atau tanggal tidak terbaca: tanpa berkas.
assert.equal(icsTiketKereta({ ...dasar, berangkat: "pagi" }), null);
assert.equal(icsTiketKereta({ ...dasar, tanggal: "6 Nov" }), null);

console.log("kalender-ics: ok");
