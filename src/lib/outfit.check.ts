import assert from "node:assert/strict";
import {
  adaTautan, alasanDaftarOutfit, bacaOutfit, bagianOutfitTanggal, cekDaftarOutfit, hariOutfitBeranda, jenisOutfit, labelOutfit, labelTabOutfit, outfitSchema, outfitTerlihat,
  segarkanIsianBaris, tabTerlihatOutfit, tanpaIsianBaris, tautkanOutfit, teksWaktuOutfit, urutOutfit,
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

// Tab yang dibuka portal: terbit dan punya butir publik berjudul.
const terlihatUji = tabTerlihatOutfit(
  [{ id: 1, is_published: true }, { id: 2, is_published: true }, { id: 3, is_published: false }, { id: 4, is_published: true }],
  [
    { section_id: 1, title: "Gala Dinner", is_published: true },
    { section_id: 2, title: "Kejutan", is_published: false },
    { section_id: 2, title: "  ", is_published: true },
    { section_id: 3, title: "Sarapan", is_published: true },
  ],
);
assert.deepEqual([...terlihatUji], [1]);

// Label batch dari nama tab bertanggal sama yang dibuka peserta, seperti segmen Batch di portal.
const tabJumat = [
  { id: 1, name: "Jumat, 06 November 2026 (Batch 1)", event_date: "2026-11-06" },
  { id: 2, name: "Jumat, 06 November 2026 (Batch 2)", event_date: "2026-11-06" },
  { id: 3, name: "Sabtu, 07 November 2026", event_date: "2026-11-07" },
];
const semuaTerlihat = new Set([1, 2, 3]);
assert.equal(labelTabOutfit(tabJumat, 1, semuaTerlihat), "Batch 1");
assert.equal(labelTabOutfit(tabJumat, 2, semuaTerlihat), "Batch 2");
assert.equal(labelTabOutfit(tabJumat, 3, semuaTerlihat), null);
assert.equal(labelTabOutfit(tabJumat, 9, semuaTerlihat), null);
// Tab draf bertanggal sama tidak dibuka portal, jadi tidak mengubah label:
// "(Batch 1)" tetap dibuang, seperti di Jadwal peserta.
const denganDraf = [...tabJumat, { id: 4, name: "Jumat, 06 November 2026", event_date: "2026-11-06" }];
assert.equal(labelTabOutfit(denganDraf, 1, semuaTerlihat), "Batch 1");
assert.equal(teksWaktuOutfit("17:30:00", "Gala Dinner (Batch 1)", labelTabOutfit(denganDraf, 1, semuaTerlihat)), "17.30 Gala Dinner");
// Bila draf itu ikut dihitung, labelnya jadi nama utuh dan "(Batch 1)" tertinggal.
assert.equal(labelTabOutfit(denganDraf, 1, new Set([1, 2, 3, 4])), "Jumat, 06 November 2026 (Batch 1)");
// Tab ini sendiri selalu ikut: Batch 2 yang masih draf sudah berlabel sebelum diterbitkan.
assert.equal(labelTabOutfit(tabJumat, 2, new Set([1, 3])), "Batch 2");
// Satu-satunya tab terlihat di tanggal itu: tanpa label, judul utuh seperti di portal.
assert.equal(labelTabOutfit(tabJumat, 1, new Set([1, 3])), null);

// Aturan daftar: tiga isian, satu seharian, satu baris tidak dua kali.
assert.equal(cekDaftarOutfit([{}, { item_id: 3 }, { when: "Malam hari" }]), null);
assert.deepEqual(cekDaftarOutfit([{}, { when: " " }]), { jenis: "seharianGanda" });
assert.deepEqual(cekDaftarOutfit([{ item_id: 3 }, { item_id: 3, when: "17.30 Gala Dinner" }]), { jenis: "barisGanda", item_id: 3 });
assert.deepEqual(cekDaftarOutfit([{ when: "a" }, { when: "b" }, { when: "c" }, { when: "d" }]), { jenis: "terlaluBanyak" });
assert.equal(cekDaftarOutfit([]), null);
// Kiriman editor memakai null untuk kosong: dua isian lama tanpa When = dua Whole day.
assert.deepEqual(cekDaftarOutfit([{ item_id: null, when: null }, { item_id: null, when: null }]), { jenis: "seharianGanda" });
assert.equal(alasanDaftarOutfit({ jenis: "seharianGanda" }, () => ""), "Only one Whole day line per tab.");
assert.equal(alasanDaftarOutfit({ jenis: "barisGanda", item_id: 3 }, (id) => `Baris ${id}`), "Baris 3 already has a dress code.");
assert.equal(alasanDaftarOutfit({ jenis: "terlaluBanyak" }, () => ""), "3 is the most per tab, so the phone strip stays short.");

// Keputusan Save dress code per isian (tautkanOutfit, dipakai PATCH outfit).
const barisTab = new Map([
  [101, { start_time: "17:30:00", title: "Gala Dinner (Batch 1)", is_published: true }],
  [102, { start_time: "21:00:00", title: "Kejutan", is_published: false }],
  [103, { start_time: "22:00:00", title: "  ", is_published: true }],
]);
const belumAda = new Map<number, string | undefined>();
const alasanDari = (hasil: ReturnType<typeof tautkanOutfit>) => ("alasan" in hasil ? hasil.alasan : null);
const isianDari = (hasil: ReturnType<typeof tautkanOutfit>) => ("isian" in hasil ? JSON.parse(JSON.stringify(hasil.isian)) : hasil.alasan);
// Tautan baru: harus ada di tab ini, berjudul, dan tampil di halaman publik.
assert.equal(alasanDari(tautkanOutfit([{ item_id: 102, what: "Batik" }], belumAda, barisTab, null)), "Kejutan is hidden, so it cannot be picked.");
assert.equal(alasanDari(tautkanOutfit([{ item_id: 999, what: "Batik" }], belumAda, barisTab, null)), "That item is not on this tab any more. Pick another.");
assert.equal(alasanDari(tautkanOutfit([{ item_id: 103, what: "Batik" }], belumAda, barisTab, null)), "That item is not on this tab any more. Pick another.");
// Tautan baru yang sah: when dari barisnya (bukan ketikan), label batch dibuang, Whole day di depan.
assert.deepEqual(
  isianDari(tautkanOutfit([{ item_id: 101, when: "ketikan lama", what: "Batik" }, { what: "Kaos" }], belumAda, barisTab, "Batch 1")),
  [{ what: "Kaos" }, { item_id: 101, when: "17.30 Gala Dinner", what: "Batik" }],
);
// Tautan tersimpan tidak diperiksa ulang: baris yang kini tersembunyi diterima, when-nya disegarkan.
assert.deepEqual(isianDari(tautkanOutfit([{ item_id: 102, what: "Jaket" }], new Map([[102, "20.00 Kejutan"]]), barisTab, null)), [{ item_id: 102, when: "21.00 Kejutan", what: "Jaket" }]);
// Tautan tersimpan ke baris yang hilang (salinan acara, hapus yang gagal): teks tersimpan tetap.
assert.deepEqual(isianDari(tautkanOutfit([{ item_id: 999, what: "Batik panjang" }], new Map([[999, "19.00 Gala lama"]]), barisTab, null)), [{ item_id: 999, when: "19.00 Gala lama", what: "Batik panjang" }]);
// Aturan daftar dengan alasannya; judul dari baris, atau teks tersimpan bila barisnya hilang.
assert.equal(alasanDari(tautkanOutfit([{ what: "A" }, { what: "B" }], belumAda, barisTab, null)), "Only one Whole day line per tab.");
assert.equal(alasanDari(tautkanOutfit([{ item_id: 101, what: "A" }, { item_id: 101, what: "B" }], belumAda, barisTab, null)), "Gala Dinner (Batch 1) already has a dress code.");
assert.equal(alasanDari(tautkanOutfit([{ item_id: 999, what: "A" }, { item_id: 999, what: "B" }], new Map([[999, "19.00 Gala lama"]]), barisTab, null)), "19.00 Gala lama already has a dress code.");

// Tulisan kedua sesudah baris berubah atau dihapus: jsonb apa adanya, hanya isian bertaut yang disentuh.
const jsonb = [
  { what: "Kaos" },
  { item_id: 101, when: "17.30 Gala Dinner", what: "Batik", note: "Wanita: kebaya" },
  { item_id: 999, when: "19.00 Gala lama", what: "Jas" },
  { when: "Malam hari", what: "Jaket", lain: "tetap" },
];
assert.deepEqual(tanpaIsianBaris(jsonb, 101), [jsonb[0], jsonb[2], jsonb[3]]);
assert.deepEqual(tanpaIsianBaris(jsonb, 5), jsonb);
const segar = segarkanIsianBaris(jsonb, new Map([[101, { start_time: "18:00:00", title: "Gala Dinner (Batch 1)" }]]), "Batch 1");
assert.deepEqual(segar, [
  { what: "Kaos" },
  { item_id: 101, when: "18.00 Gala Dinner", what: "Batik", note: "Wanita: kebaya" },
  { item_id: 999, when: "19.00 Gala lama", what: "Jas" },
  { when: "Malam hari", what: "Jaket", lain: "tetap" },
]);
assert.equal(segar[2], jsonb[2], "barisnya tidak ditemukan: isian tidak disentuh");
assert.equal(adaTautan(jsonb), true);
assert.equal(adaTautan([{ what: "Kaos" }, { item_id: "101", what: "x" }]), false);
assert.equal(adaTautan(null), false);

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

// Isian bertaut hanya untuk baris yang tampil bagi peserta; item_id tidak ikut ke halaman.
{
  const isian = [
    { what: "Batik" },
    { item_id: 5, when: "17.30 Gala dinner", what: "Formal" },
    { item_id: 6, when: "06.00 Berkumpul (Batch 2)", what: "Kaos" },
  ];
  assert.deepEqual(outfitTerlihat(isian, [{ id: 5 }]), [{ what: "Batik" }, { when: "17.30 Gala dinner", what: "Formal" }]);
  assert.deepEqual(outfitTerlihat(isian, []), [{ what: "Batik" }]);
}

