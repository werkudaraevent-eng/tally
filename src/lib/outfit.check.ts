import assert from "node:assert/strict";
import {
  bacaOutfit, bagianOutfitTanggal, cekDaftarOutfit, hariOutfitBeranda, jenisOutfit, labelOutfit, labelTabOutfit, outfitSchema, teksWaktuOutfit, urutOutfit,
} from "./outfit.ts";

// Validasi tulis: foto hanya https, isian kosong dibuang jadi undefined, paling banyak tiga.
const ok = outfitSchema.safeParse([{ when: "  Gala dinner • 19.00 ", what: " Batik ", note: "", photo_url: "https://x.supabase.co/a.jpg" }]);
assert.ok(ok.success);
assert.deepEqual(JSON.parse(JSON.stringify(ok.data)), [{ when: "Gala dinner • 19.00", what: "Batik", photo_url: "https://x.supabase.co/a.jpg" }]);
for (const foto of ["javascript:alert(1)", "http://x.test/a.jpg", "data:image/png;base64,AAAA", "https://x.test/a b.jpg", "//x.test/a.jpg"]) {
  assert.equal(outfitSchema.safeParse([{ what: "Batik", photo_url: foto }]).success, false, foto);
}
assert.equal(outfitSchema.safeParse([{ what: "" }]).success, false);
assert.equal(outfitSchema.safeParse([{ what: "x".repeat(121) }]).success, false);
assert.equal(outfitSchema.safeParse([{ what: "a", when: "x".repeat(41) }]).success, false);
assert.equal(outfitSchema.safeParse([{ what: "a", note: "x".repeat(201) }]).success, false);
assert.equal(outfitSchema.safeParse([{ what: "a" }, { what: "b" }, { what: "c" }, { what: "d" }]).success, false);

// Baca toleran: bukan array, tanpa what, dan foto javascript: dibuang.
assert.deepEqual(bacaOutfit(null), []);
assert.deepEqual(bacaOutfit({ what: "x" }), []);
assert.deepEqual(bacaOutfit([{ what: " " }, "x", { what: "Batik", photo_url: "javascript:alert(1)" }]), [{ what: "Batik" }]);

assert.equal(labelOutfit(null), "Outfit");
assert.equal(labelOutfit("  "), "Outfit");
assert.equal(labelOutfit("Dress code"), "Dress code");

// item_id lolos skema tulis dan bacaOutfit; zod membuang kunci yang tidak dikenal.
const bertaut = outfitSchema.safeParse([{ item_id: 42, when: null, what: "Batik" }, { item_id: null, what: "Kaos" }]);
assert.ok(bertaut.success);
assert.deepEqual(JSON.parse(JSON.stringify(bertaut.data)), [{ item_id: 42, what: "Batik" }, { what: "Kaos" }]);
for (const salah of [0, -1, 1.5, "3"]) assert.equal(outfitSchema.safeParse([{ item_id: salah, what: "Batik" }]).success, false, String(salah));
assert.deepEqual(bacaOutfit([{ item_id: 42, when: "17.30 Gala Dinner", what: "Batik" }]), [{ item_id: 42, when: "17.30 Gala Dinner", what: "Batik" }]);
assert.deepEqual(bacaOutfit(JSON.parse(JSON.stringify(bertaut.data))), [{ item_id: 42, what: "Batik" }, { what: "Kaos" }]);
assert.deepEqual(bacaOutfit([{ item_id: "42", what: "A" }, { item_id: 0, what: "B" }, { item_id: 2.5, what: "C" }]), [{ what: "A" }, { what: "B" }, { what: "C" }]);

// Jenis diturunkan dari isinya, jadi isian lama tanpa item_id tetap terbaca.
assert.equal(jenisOutfit({ item_id: 7, when: "17.30 Gala Dinner" }), "baris");
assert.equal(jenisOutfit({ when: "Malam hari" }), "waktu");
assert.equal(jenisOutfit({ when: "  " }), "seharian");
assert.equal(jenisOutfit({}), "seharian");

// Teks waktu dari baris: jam bertitik, label batch dibuang, paling panjang 40 huruf termasuk "…".
assert.equal(teksWaktuOutfit("17:30:00", "Gala Dinner"), "17.30 Gala Dinner");
assert.equal(teksWaktuOutfit("7:05", " Sarapan "), "07.05 Sarapan");
assert.equal(teksWaktuOutfit("05:00:00", "Berkumpul di Stasiun Gambir (Batch 1)", "Batch 1"), "05.00 Berkumpul di Stasiun Gambir");
assert.equal(teksWaktuOutfit("05:00:00", "Sesi (Batch 2)", "Batch 1"), "05.00 Sesi (Batch 2)");
const pas = `09.00 ${"a".repeat(34)}`;
assert.equal(teksWaktuOutfit("09:00:00", "a".repeat(34)), pas);
const panjang = teksWaktuOutfit("06:20:00", "Perjalanan menuju Yogyakarta dengan Kereta Api Taksaka");
assert.ok(panjang.length <= 40 && panjang.endsWith("…") && panjang.startsWith("06.20 Perjalanan menuju"), panjang);
assert.equal(teksWaktuOutfit("06:20:00", "x".repeat(60)), `06.20 ${"x".repeat(33)}…`);
// Emoji di batas potong tidak terbelah jadi surrogate tunggal.
const emoji = teksWaktuOutfit("10:00:00", `${"b".repeat(32)}🎉🎉🎉`);
assert.ok(emoji.length <= 40 && !/[\uD800-\uDBFF]…$/.test(emoji), emoji);

// Label batch dari nama tab bertanggal sama, seperti segmen Batch di portal.
const tabJumat = [
  { id: 1, name: "Jumat, 06 November 2026 (Batch 1)", event_date: "2026-11-06" },
  { id: 2, name: "Jumat, 06 November 2026 (Batch 2)", event_date: "2026-11-06" },
  { id: 3, name: "Sabtu, 07 November 2026", event_date: "2026-11-07" },
];
assert.equal(labelTabOutfit(tabJumat, 1), "Batch 1");
assert.equal(labelTabOutfit(tabJumat, 2), "Batch 2");
assert.equal(labelTabOutfit(tabJumat, 3), null);
assert.equal(labelTabOutfit(tabJumat, 9), null);

// Aturan daftar: tiga isian, satu seharian, satu baris tidak dua kali.
assert.equal(cekDaftarOutfit([{}, { item_id: 3 }, { when: "Malam hari" }]), null);
assert.deepEqual(cekDaftarOutfit([{}, { when: " " }]), { jenis: "seharianGanda" });
assert.deepEqual(cekDaftarOutfit([{ item_id: 3 }, { item_id: 3, when: "17.30 Gala Dinner" }]), { jenis: "barisGanda", item_id: 3 });
assert.deepEqual(cekDaftarOutfit([{ when: "a" }, { when: "b" }, { when: "c" }, { when: "d" }]), { jenis: "terlaluBanyak" });
assert.equal(cekDaftarOutfit([]), null);

// Urutan tersimpan tetap, isian seharian selalu di depan.
assert.deepEqual(urutOutfit([{ when: "Malam hari", what: "a" }, { item_id: 2, what: "b" }, { what: "c" }]).map((isian) => isian.what), ["c", "a", "b"]);
assert.deepEqual(urutOutfit([{ item_id: 2, what: "b" }, { when: "Pagi", what: "a" }]).map((isian) => isian.what), ["b", "a"]);

// Hari di Beranda.
const isi = [{ what: "Batik" }];
const hari = [
  { tanggal: "2026-11-05", outfit: isi },
  { tanggal: "2026-11-06", outfit: [] },
  { tanggal: "2026-11-06", outfit: isi },
  { tanggal: "2026-11-07", outfit: [] },
  { tanggal: "2026-11-08", outfit: isi },
];
assert.deepEqual(hariOutfitBeranda(hari, "2026-10-16", "2026-10-17"), { indeks: 0, jenis: "pertama" });
assert.deepEqual(hariOutfitBeranda(hari, "2026-11-04", "2026-11-05"), { indeks: 0, jenis: "besok" });
assert.deepEqual(hariOutfitBeranda(hari, "2026-11-05", "2026-11-06"), { indeks: 0, jenis: "hariIni" });
// Batch 1 tanpa outfit, Batch 2 berisi: yang berisi.
assert.deepEqual(hariOutfitBeranda(hari, "2026-11-06", "2026-11-07"), { indeks: 2, jenis: "hariIni" });
// Hari ini tanpa outfit: tidak ada baris.
assert.equal(hariOutfitBeranda(hari, "2026-11-07", "2026-11-08"), null);
assert.deepEqual(hariOutfitBeranda(hari, "2026-12-01", "2026-12-02"), { indeks: 4, jenis: "terakhir" });
assert.deepEqual(hariOutfitBeranda([{ tanggal: null, outfit: isi }], "2026-11-05", "2026-11-06"), { indeks: 0, jenis: "pertama" });
assert.equal(hariOutfitBeranda([], "2026-11-05", "2026-11-06"), null);

// Ikut batch peserta (Agenda > Who it's for): tanggal dengan Batch 1 dan 2.
const hariBatch = [
  { tanggal: "2026-11-06", outfit: [{ what: "Kaos B1" }] },
  { tanggal: "2026-11-06", outfit: [{ what: "Kaos B2" }] },
  { tanggal: "2026-11-07", outfit: [{ what: "Formal" }] },
  { tanggal: "2026-11-08", outfit: [] },
  { tanggal: "2026-11-08", outfit: [{ what: "Rapi" }] },
];
const batch1 = { milik: new Set([0, 3]), bukanMilik: new Set([1, 4]) };
const batch2 = { milik: new Set([1, 4]), bukanMilik: new Set([0, 3]) };
assert.deepEqual(hariOutfitBeranda(hariBatch, "2026-11-06", "2026-11-07", batch2), { indeks: 1, jenis: "hariIni" });
assert.deepEqual(hariOutfitBeranda(hariBatch, "2026-11-06", "2026-11-07", batch1), { indeks: 0, jenis: "hariIni" });
assert.deepEqual(hariOutfitBeranda(hariBatch, "2026-11-05", "2026-11-06", batch2), { indeks: 1, jenis: "besok" });
// Bagian Batch 1 tanggal 8 tanpa outfit: peserta Batch 1 tidak melihat outfit Batch 2.
assert.equal(hariOutfitBeranda(hariBatch, "2026-11-08", "2026-11-09", batch1), null);
assert.deepEqual(hariOutfitBeranda(hariBatch, "2026-11-08", "2026-11-09", batch2), { indeks: 4, jenis: "hariIni" });
// Tanpa jawaban batch: seperti sebelumnya, bagian pertama yang berisi.
assert.deepEqual(hariOutfitBeranda(hariBatch, "2026-11-08", "2026-11-09"), { indeks: 4, jenis: "hariIni" });
assert.deepEqual(hariOutfitBeranda(hariBatch, "2026-11-08", "2026-11-09", { milik: new Set(), bukanMilik: new Set() }), { indeks: 4, jenis: "hariIni" });
assert.equal(bagianOutfitTanggal(hariBatch, "2026-11-06", batch2), 1);
assert.equal(bagianOutfitTanggal(hariBatch, "2026-11-07", batch1), 2);
assert.equal(bagianOutfitTanggal(hariBatch, "2026-11-09", batch1), -1);
// Semua bagian tanggal itu untuk kelompok lain: halaman tetap membukanya (seperti Jadwal), Beranda tidak.
assert.equal(bagianOutfitTanggal(hariBatch, "2026-11-06", { milik: new Set(), bukanMilik: new Set([0, 1]) }, true), 0);
assert.equal(bagianOutfitTanggal(hariBatch, "2026-11-06", { milik: new Set(), bukanMilik: new Set([0, 1]) }), -1);
// Sesudah acara: hari terakhir milik peserta, bukan bagian terakhir agenda (Batch 2).
assert.equal(hariOutfitBeranda(hariBatch, "2026-11-09", "2026-11-10", batch1), null);
assert.deepEqual(hariOutfitBeranda(hariBatch, "2026-11-09", "2026-11-10", batch2), { indeks: 4, jenis: "terakhir" });
// Batch berselang: 5 Nov hanya Batch 1, jadi untuk Batch 2 hari itu dilewati.
const hariSelang = [
  { tanggal: "2026-11-05", outfit: [{ what: "Rapi B1" }] },
  { tanggal: "2026-11-06", outfit: [{ what: "Kaos B2" }] },
];
const selang2 = { milik: new Set([1]), bukanMilik: new Set([0]) };
assert.deepEqual(hariOutfitBeranda(hariSelang, "2026-11-05", "2026-11-06", selang2), { indeks: 1, jenis: "besok" });
assert.deepEqual(hariOutfitBeranda(hariSelang, "2026-11-03", "2026-11-04", selang2), { indeks: 1, jenis: "pertama" });
// Bagian milik peserta tanpa outfit, bagian untuk semua berisi: yang berisi.
const hariSemua = [
  { tanggal: "2026-11-07", outfit: [{ what: "Formal" }] },
  { tanggal: "2026-11-07", outfit: [] },
];
assert.deepEqual(hariOutfitBeranda(hariSemua, "2026-11-07", "2026-11-08", { milik: new Set([1]), bukanMilik: new Set() }), { indeks: 0, jenis: "hariIni" });
// "Hari pertama" dari tanggal, bukan dari indeks: Batch 2 di hari pertama juga.
assert.deepEqual(hariOutfitBeranda(hariBatch, "2026-11-01", "2026-11-02", batch2), { indeks: 1, jenis: "pertama" });
