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
  assert.ok(kontras(w.latar, w.latarTeks) >= 7, `latar ${seed}`);
  assert.ok(kontras(w.latar2, w.latarTeks) >= 7, `latar2 ${seed}`);
  assert.ok(kontras(w.aksen, w.latar) >= 3, `aksen ${seed}`);
  assert.ok(kontras(w.aksenTeks, w.aksen) >= 4.5, `aksenTeks ${seed}`);
  assert.ok(kontras(w.tinta, w.kertas) >= 7, `tinta ${seed}`);
}
for (const brand of ["#FFE600", "#123456", "#ffffff"]) {
  const w = warnaKilas(null, { mode: "custom", brand, accent: "#FF00AA" });
  assert.ok(kontras(w.latar, w.latarTeks) >= 7, `custom latar ${brand}`);
  assert.ok(kontras(w.aksen, w.latar) >= 3, `custom aksen ${brand}`);
  assert.ok(kontras(w.tinta, w.kertas) >= 7, `custom tinta ${brand}`);
}
// Merek terang tetap jadi latar (tidak digelapkan jadi zaitun), dengan tulisan gelap.
assert.equal(warnaKilas(null, { mode: "custom", brand: "#FFD400", accent: "#2649D0" }).latar, "#FFD400");
assert.equal(warnaKilas(null, { mode: "custom", brand: "#FFD400", accent: "#2649D0" }).latarTeks, "#141414");
// Aksen merah di latar gelap tetap berwarna, bukan putih.
assert.notEqual(warnaKilas(null, { mode: "custom", brand: "#123456", accent: "#FF3B30" }).aksen, "#ffffff");
// Aksen putih di merek krem: aksen diambil dari merek, bukan abu-abu.
assert.notEqual(warnaKilas(null, { mode: "custom", brand: "#FFF4D6", accent: "#FFFFFF" }).aksen, "#141414");
// KSO (navy + emas) tidak berubah.
assert.equal(warnaKilas(null, { mode: "custom", brand: "#0F1B3D", accent: "#E8C968" }).aksen, "#E8C968");
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

import { sorotanAgenda } from "./alur.ts";
{
  const it = (title: string, time: string, end: string | null, jeda = false) => ({ title, time, end, jeda });
  const bagian = [
    { tanggal: "2026-11-05", items: [it("Ambil tiket kereta", "19:00", "21:00")] },
    { tanggal: "2026-11-06", items: [it("Pengambilan Badge ID", "04:00", "04:30"), it("Perjalanan kereta", "05:00", "13:00"), it("Makan", "13:00", "14:00", true)] },
    { tanggal: "2026-11-07", items: [it("City tour", "09:00", "12:00"), it("Gala dinner", "19:00", "22:00")] },
    { tanggal: "2026-11-08", items: [it("Sarapan", "07:00", null)] },
  ];
  assert.deepEqual(sorotanAgenda(bagian, "2026-11-06", "2026-11-08"), ["Perjalanan kereta", "Gala dinner", "Sarapan"]);
  assert.deepEqual(sorotanAgenda([{ tanggal: null, items: [it("A", "09:00", "10:00"), it("B", "10:00", "13:00")] }], null, null), ["B"]);
  assert.deepEqual(sorotanAgenda(bagian, "2026-11-06", null).length, 3);
}
console.log("kilas-balik/sorotan ok");

{
  // QA H1: pilihan Agenda yang semuanya tersembunyi -> pertanyaan dilewati, bukan wajib.
  const qq = [{ key: "momen", type: "choice" as const, title: "M", options: ["Kumpul Batch 1"], from_agenda: true, max: 1, required: true }];
  assert.deepEqual(periksaJawaban(qq, {}, () => []), { ok: true, jawaban: {} });
  assert.deepEqual(periksaJawaban(qq, { momen: ["Kumpul Batch 1"] }, () => []), { ok: true, jawaban: {} });
}
console.log("kilas-balik/pilihan-kosong ok");

{
  // Logic: Show if, recall, carry forward (logika.ts), dan urutan alur.
  const { alurAktif } = await import("./alur.ts");
  const { masalahLogika, urutAlur } = await import("./setelan.ts");
  const { bangunLayar } = await import("./layar.ts");
  const { cocokFakta, isiRecall, lolosFakta } = await import("./logika.ts");
  type Q = import("./setelan.ts").Pertanyaan;
  const qs: Q[] = [
    { key: "saran", type: "text", title: "Kenapa {momen}?", required: true, after: null, show_if: [{ source: "answer", q: "momen", op: "includes", value: "Gala dinner" }] },
    { key: "momen", type: "choice", title: "Momen?", options: ["Gala dinner", "City tour", "Sesi utama"], max: 3, required: true, after: "agenda" },
    { key: "terbaik", type: "choice", title: "Yang terbaik?", options_from: "momen", max: 1, required: true, after: null },
    { key: "vip", type: "faces", title: "Lounge?", required: true, after: null, show_if: [{ source: "checkin", session: 7, op: "yes" }] },
  ];
  assert.deepEqual(urutAlur(qs).map((x) => x.key), ["momen", "saran", "terbaik", "vip"]);
  assert.deepEqual(masalahLogika(qs), []);
  // Merujuk pertanyaan yang datang sesudahnya: ditolak.
  const salah = qs.map((x) => (x.key === "momen" ? { ...x, after: null } : x));
  assert.ok(masalahLogika(salah).some((m) => m.key === "saran"));
  assert.equal(setelanSchema.safeParse({ ...rapikanSetelan({}), questions: salah }).success, false);
  assert.equal(setelanSchema.safeParse({ ...rapikanSetelan({}), questions: qs }).success, true);
  // Carry forward dari pertanyaan yang hanya boleh satu pilihan: ditolak.
  assert.ok(masalahLogika(qs.map((x) => (x.key === "momen" ? { ...x, max: 1 } : x))).some((m) => m.key === "terbaik"));

  const tanpa = { sesi: new Set<number>(), hadiah: false, kolom: { divisi: "Sales" } };
  const hadir = { sesi: new Set([7]), hadiah: true, kolom: null };
  assert.equal(cocokFakta({ source: "field", field: "divisi", values: ["sales"] }, tanpa), true);
  assert.equal(lolosFakta(qs[3].show_if, tanpa), false);
  assert.equal(lolosFakta(qs[3].show_if, hadir), true);

  const pilihan = (x: Q) => x.options ?? [];
  // Tanpa Gala dinner: "saran" tidak tampil, jadi tidak wajib; terbaik dari dua centang.
  const r1 = periksaJawaban(qs, { momen: ["City tour", "Sesi utama"], saran: "x", terbaik: ["Sesi utama"] }, pilihan, (x) => lolosFakta(x.show_if, tanpa));
  assert.deepEqual(r1, { ok: true, jawaban: { momen: ["City tour", "Sesi utama"], terbaik: ["Sesi utama"] } });
  // Satu centang saja: carry forward tidak ditanyakan.
  const r2 = periksaJawaban(qs, { momen: ["Gala dinner"], saran: "Seru" }, pilihan, (x) => lolosFakta(x.show_if, tanpa));
  assert.deepEqual(r2, { ok: true, jawaban: { momen: ["Gala dinner"], saran: "Seru" } });
  // Gala dinner dicentang tapi saran kosong: wajib. Hadir di sesi 7: vip wajib.
  const r3 = periksaJawaban(qs, { momen: ["Gala dinner", "City tour"], terbaik: ["Hack"] }, pilihan, (x) => lolosFakta(x.show_if, hadir));
  assert.deepEqual(r3, { ok: false, kosong: ["saran", "terbaik", "vip"] });

  // HP: layar mengikuti jawaban, recall terisi.
  const layar = bangunLayar({ questions: qs, cards: KARTU_AWAL, kenangan: penuh, lang: "id", utama: "id", semua: new Set(), milik: new Set(), fakta: tanpa });
  assert.equal(layar.some((l) => l.jenis === "tanya" && l.q.key === "vip"), false);
  const label = (_q: unknown, v: unknown) => (Array.isArray(v) ? v.join(" dan ") : String(v));
  const kunciTanya = (j: Record<string, import("./setelan.ts").NilaiJawaban>) => alurAktif(layar, j, label).flatMap((l) => (l.jenis === "tanya" ? [l.q.key] : []));
  assert.deepEqual(kunciTanya({}), ["momen"]);
  assert.deepEqual(kunciTanya({ momen: ["Gala dinner", "City tour"] }), ["momen", "saran", "terbaik"]);
  const saran = alurAktif(layar, { momen: ["Gala dinner", "City tour"] }, label).find((l) => l.jenis === "tanya" && l.q.key === "saran") as { q: { title: string } } | undefined;
  assert.equal(saran?.q?.title, "Kenapa Gala dinner dan City tour?");
  assert.equal(isiRecall("Kamu pilih {x}. Kenapa?", () => null), "Kamu pilih. Kenapa?");
}
console.log("kilas-balik/logika ok");
