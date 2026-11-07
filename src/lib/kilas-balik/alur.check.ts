import assert from "node:assert/strict";
import { layarLanjut, sisaPertanyaan, susunAlur, type Kenangan } from "./alur.ts";
import { KARTU_AWAL, kunciBaru, periksaJawaban, pertanyaanAwal, rapikanSetelan, ringkasHasil, skorNps, statusBuka, setelanSchema } from "./setelan.ts";

const q = pertanyaanAwal("id", ["Gala Dinner", "City tour", "Gala Dinner", "  "]);
assert.deepEqual(q[1].options, ["Gala Dinner", "City tour"]);
assert.equal(q[1].from_agenda, true);
assert.equal(pertanyaanAwal("en")[1].from_agenda, false);
assert.equal(pertanyaanAwal("en")[1].options?.length, 4);
const penuh: Kenangan = {
  nama: "Dewi",
  hari: 3,
  trip: { mode: "train", judul: "Stasiun Gambir", kapan: "Jum, 6 Nov, 05.00", detail: "Gerbong 3, kursi 12A" },
  stay: { hotel: "Royal Hotel", kamar: "1207", teman: ["Rina"], malam: 2 },
  agenda: { hadir: 6, sorotan: ["Gala Dinner"] },
  prize: { hadiah: ["Voucher"] },
};

// Urutan lengkap: buka, trip, stay, tanya perjalanan, agenda, tanya momen, prize, nps, saran, tutup.
const alur = susunAlur(q, KARTU_AWAL, penuh);
assert.deepEqual(
  alur.map((l) => (l.jenis === "kartu" ? l.kartu : l.jenis === "tanya" ? l.q.key : l.jenis)),
  ["buka", "trip", "stay", "perjalanan", "agenda", "momen", "prize", "rekomendasi", "saran", "tutup"],
);

// Tanpa hotel dan tanpa hadiah: pertanyaan perjalanan tetap ada, kartunya tidak.
const kosong: Kenangan = { ...penuh, stay: null, prize: { hadiah: [] } };
assert.deepEqual(
  susunAlur(q, KARTU_AWAL, kosong).map((l) => (l.jenis === "kartu" ? l.kartu : l.jenis === "tanya" ? l.q.key : l.jenis)),
  ["buka", "trip", "perjalanan", "agenda", "momen", "rekomendasi", "saran", "tutup"],
);

// Kartu dimatikan panitia: tidak tampil walau datanya ada.
assert.equal(susunAlur(q, { ...KARTU_AWAL, trip: false }, penuh).some((l) => l.jenis === "kartu" && l.kartu === "trip"), false);

assert.equal(sisaPertanyaan(alur, 0), 4);
assert.equal(sisaPertanyaan(alur, 8), 1);

// Lanjut dari layar terakhir yang dibuka, kecuali ada pertanyaan wajib yang terlewat sebelumnya.
assert.equal(layarLanjut(alur, { perjalanan: 4 }, 6), 5, "momen wajib belum dijawab");
assert.equal(layarLanjut(alur, { perjalanan: 4, momen: ["Gala Dinner"] }, 6), 6);
assert.equal(layarLanjut(alur, {}, 99), 3);

// Setelan dari baris rusak tetap aman.
const r = rapikanSetelan({ enabled: true, questions: [{ key: "x", type: "faces", title: "A", required: true }, { key: "BAD KEY" }], cards: { trip: false } });
assert.equal(r.questions.length, 1);
assert.equal(r.cards.trip, false);
assert.equal(r.cards.stay, true);
assert.equal(rapikanSetelan(null).enabled, false);

// Status buka.
const now = new Date("2026-11-08T07:00:00Z");
assert.equal(statusBuka({ enabled: true, opens_at: null, closes_at: null, questions: q }, now), "open");
assert.equal(statusBuka({ enabled: true, opens_at: "2026-11-08T08:00:00Z", closes_at: null, questions: q }, now), "not_yet");
assert.equal(statusBuka({ enabled: true, opens_at: null, closes_at: "2026-11-08T07:00:00Z", questions: q }, now), "closed");
assert.equal(statusBuka({ enabled: true, opens_at: null, closes_at: null, questions: [] }, now), "off");
assert.equal(statusBuka({ enabled: false, opens_at: null, closes_at: null, questions: q }, now), "off");

// Skema: kunci kembar dan pilihan kurang ditolak.
const dasar = { enabled: true, title: null, intro: null, closing: null, signed_by: null, display: "kilas", theme: { mode: "event", brand: null, accent: null }, questions: q, cards: KARTU_AWAL, opens_at: null, closes_at: null };
assert.equal(setelanSchema.safeParse(dasar).success, true);
assert.equal(setelanSchema.safeParse({ ...dasar, questions: [q[0], q[0]] }).success, false);
assert.equal(setelanSchema.safeParse({ ...dasar, questions: [{ key: "p", type: "choice", title: "P", required: true, options: ["A"] }] }).success, false);
assert.equal(setelanSchema.safeParse({ ...dasar, enabled: true, questions: [] }).success, false);
assert.equal(setelanSchema.safeParse({ ...dasar, opens_at: "2026-11-08T08:00:00Z", closes_at: "2026-11-08T07:00:00Z" }).success, false);
assert.equal(setelanSchema.safeParse({ ...dasar, display: "percakapan" }).success, true);
assert.equal(setelanSchema.safeParse({ ...dasar, display: "slides" }).success, false);
assert.equal(setelanSchema.safeParse({ ...dasar, theme: { mode: "custom", brand: null, accent: null } }).success, false);
assert.equal(setelanSchema.safeParse({ ...dasar, theme: { mode: "custom", brand: "#112233", accent: "#ffcc00" } }).success, true);
assert.equal(setelanSchema.safeParse({ ...dasar, theme: { mode: "custom", brand: "red", accent: null } }).success, false);
assert.equal(rapikanSetelan({ display: "ringkas" }).display, "ringkas");
assert.equal(rapikanSetelan({ display: "aneh" }).display, "kilas");
assert.deepEqual(rapikanSetelan({ theme: { mode: "custom", brand: null } }).theme, { mode: "event", brand: null, accent: null });
assert.equal(rapikanSetelan({ theme: { mode: "custom", brand: "#112233", accent: null } }).theme.brand, "#112233");

// Jawaban: nilai salah jenis dibuang, pilihan di luar daftar peserta dibuang, wajib kosong ditolak.
const sah = (pq: (typeof q)[number]) => (pq.key === "momen" ? ["Gala Dinner", "City tour"] : []);
const ok = periksaJawaban(q, { perjalanan: 5, momen: ["Gala Dinner", "Hack", "City tour", "Gala Dinner"], rekomendasi: 9, saran: "  " }, sah);
assert.deepEqual(ok, { ok: true, jawaban: { perjalanan: 5, momen: ["Gala Dinner", "City tour"], rekomendasi: 9 } });
assert.deepEqual(periksaJawaban(q, { perjalanan: 6, momen: [], rekomendasi: 11 }, sah), { ok: false, kosong: ["perjalanan", "momen", "rekomendasi"] });

// NPS dan ringkasan.
assert.equal(skorNps([]), null);
assert.equal(skorNps([10, 9, 8, 6]), 25);
const hasil = ringkasHasil(q, [
  { answers: { perjalanan: 5, momen: ["Gala Dinner"], rekomendasi: 10, saran: "Lagi!" }, submitted_at: "2026-11-08T08:00:00Z" },
  { answers: { perjalanan: 3, momen: ["Gala Dinner", "City tour"], rekomendasi: 6 }, submitted_at: "2026-11-08T09:00:00Z" },
]);
assert.deepEqual(hasil[0], { key: "perjalanan", type: "faces", title: q[0].title, count: 2, average: 4, spread: [0, 0, 1, 0, 1] });
assert.deepEqual(hasil[1].type === "choice" && hasil[1].options, [{ label: "Gala Dinner", count: 2 }, { label: "City tour", count: 1 }]);
assert.equal(hasil[2].type === "nps" && hasil[2].score, 0);
assert.equal(hasil[3].type === "text" && hasil[3].latest[0].text, "Lagi!");

assert.equal(kunciBaru("Bagaimana hotelnya?", []), "bagaimana_hotelnya");
assert.equal(kunciBaru("Saran", ["saran"]), "saran_2");

console.log("kilas-balik/alur.check.ts ok");

import { alamatKilasBalik, lanjutKilasBalik } from "./alamat.ts";
assert.equal(alamatKilasBalik("kso"), "/e/kso/kilas-balik");
assert.equal(lanjutKilasBalik("kso", "/e/kso/en/kilas-balik"), "/e/kso/en/kilas-balik");
assert.equal(lanjutKilasBalik("kso", "/e/lain/kilas-balik"), null);
assert.equal(lanjutKilasBalik("kso", "//evil.example/e/kso/kilas-balik"), null);
assert.equal(lanjutKilasBalik("kso", "/e/kso/kilas-balik?x=1"), null);
assert.equal(lanjutKilasBalik("kso", ["/e/kso/kilas-balik"]), null);
console.log("kilas-balik/alamat ok");

import { warnaKilas } from "./warna.ts";
import { kontras } from "../landing-hitung-mundur.ts";
for (const seed of ["#0F1B3D", "#FFD400", "#2649D0", "#ffffff", "#000000"]) {
  const w = warnaKilas({ theme: { seed }, layout: "modern", gathering: true, accent: "#E8C968" } as never);
  assert.ok(kontras(w.latar, "#ffffff") >= 7, `latar ${seed}`);
  assert.ok(kontras(w.aksen, w.latar) >= 3, `aksen ${seed}`);
  assert.ok(kontras(w.aksenTeks, w.aksen) >= 4.5, `aksenTeks ${seed}`);
  assert.ok(kontras(w.tinta, w.kertas) >= 7, `tinta ${seed}`);
}
for (const brand of ["#FFE600", "#123456", "#ffffff"]) {
  const w = warnaKilas(null, { mode: "custom", brand, accent: "#FF00AA" });
  assert.ok(kontras(w.latar, "#ffffff") >= 7, `custom latar ${brand}`);
  assert.ok(kontras(w.aksen, w.latar) >= 3, `custom aksen ${brand}`);
}
// Mode acara mengabaikan warna sendiri yang tersimpan.
assert.deepEqual(warnaKilas(null, { mode: "event", brand: "#FF0000", accent: null }), warnaKilas(null));
console.log("kilas-balik/warna ok");

import { emailUndangan, teksAwal } from "./undangan.ts";
assert.equal(teksAwal("id", false).title, "Kilas balikmu sudah siap");
assert.equal(teksAwal("en", true).title, "Your recap is still waiting");
{
  const e = emailUndangan({ bahasa: "id", eventName: "Acara <Uji>", nama: "Rina & Co", title: "Halo", body: "Baris satu\n\nBaris <dua>", url: "https://x.test/e/a/kilas-balik", warna: "javascript:" });
  assert.ok(e.html.includes("Acara &lt;Uji&gt;") && e.html.includes("Rina &amp; Co") && e.html.includes("Baris &lt;dua&gt;"));
  assert.ok(!e.html.includes("javascript:") && e.html.includes("#2649D0"));
  assert.equal(e.subject, "Halo · Acara <Uji>");
  assert.ok(e.text.includes("Buka kilas balik: https://x.test/e/a/kilas-balik"));
}
console.log("kilas-balik/undangan ok");
