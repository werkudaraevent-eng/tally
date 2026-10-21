import assert from "node:assert/strict";
import { z } from "zod";
import type { LandingMemberConfig } from "./domain.ts";
import { hariOutfitBeranda, type OutfitEntry } from "./outfit.ts";
import {
  SETIAP_HARI_ADMIN, bacaOutfitSetiapHari, barisDenganSetiapHari, denganSetiapHari, drafSetiapHari, galatSetiapHari, hariOutfitBerandaSetiapHari, hariTanpaAgenda, isianSetiapHari,
  keteranganSetiapHari, kirimanSetiapHari, kosongDresscode, lihatSetiapHari, outfitSetiapHariSchema, petunjukSeharian, samaSetiapHari, setiapHariDiTab, tanpaSetiapHariKosong, teksBarisOutfit,
} from "./outfit-setiap-hari.ts";

const LABEL = "Setiap hari";
const kaos = { what: "Kaos KSO", note: "Dibagikan panitia saat ambil badge" };
const barisKaos = { when: LABEL, what: "Kaos KSO", note: "Dibagikan panitia saat ambil badge" };
const gala = { when: "17.30 Gala Dinner", what: "Batik lengan panjang", note: "Wanita: batik atau kebaya modern" };
const malam = { when: "Malam hari", what: "Bebas rapi" };

// Setiap hari di depan, sebagai baris berlabel; urutan baris tab tetap.
assert.deepEqual(denganSetiapHari([gala, malam], kaos, LABEL), [barisKaos, gala, malam]);
assert.deepEqual(denganSetiapHari([malam, gala], kaos, LABEL), [barisKaos, malam, gala]);
// Tab tanpa baris: hanya Setiap hari, jadi hari tidak pernah kosong.
assert.deepEqual(denganSetiapHari([], kaos, LABEL), [barisKaos]);
// Foto ikut; catatan kosong tidak.
assert.deepEqual(denganSetiapHari([], { what: "Kaos KSO", photo_url: "https://x.supabase.co/k.jpg" }, "Every day"), [{ when: "Every day", what: "Kaos KSO", photo_url: "https://x.supabase.co/k.jpg" }]);
// Tanpa Setiap hari (tidak ada, null, what kosong): baris tab apa adanya.
for (const kosong of [undefined, null, { what: "" }, { what: "   " }]) {
  assert.deepEqual(denganSetiapHari([gala], kosong, LABEL), [gala]);
  assert.deepEqual(denganSetiapHari([], kosong, LABEL), []);
}
// Tab dengan baris Seharian sendiri (tanpa item_id, tanpa when): Setiap hari diganti, di posisi mana pun.
assert.deepEqual(denganSetiapHari([{ what: "Pakaian olahraga" }], kaos, LABEL), [{ what: "Pakaian olahraga" }]);
assert.deepEqual(denganSetiapHari([gala, { what: "Pakaian olahraga", when: "  " }], kaos, LABEL), [gala, { what: "Pakaian olahraga", when: "  " }]);
// Baris agenda item (item_id) bukan Seharian, juga tanpa when.
const item = { item_id: 42, what: "Batik" } as OutfitEntry;
assert.deepEqual(denganSetiapHari([item], kaos, LABEL), [barisKaos, item]);
// Daftar asal tidak diubah.
const asal = [gala];
denganSetiapHari(asal, kaos, LABEL);
assert.deepEqual(asal, [gala]);

// Baca toleran: bentuk lain dan what kosong = tidak ada; foto javascript: dan kunci lain dibuang.
assert.equal(bacaOutfitSetiapHari(undefined), null);
assert.equal(bacaOutfitSetiapHari(null), null);
assert.equal(bacaOutfitSetiapHari("Kaos KSO"), null);
assert.equal(bacaOutfitSetiapHari([{ what: "Kaos KSO" }]), null);
assert.equal(bacaOutfitSetiapHari({ what: "  " }), null);
assert.equal(bacaOutfitSetiapHari({ note: "Tanpa pakaian" }), null);
assert.deepEqual(bacaOutfitSetiapHari({ what: " Kaos KSO ", note: " ", when: "Pagi", item_id: 3, photo_url: "javascript:alert(1)" }), { what: "Kaos KSO" });
assert.deepEqual(bacaOutfitSetiapHari({ what: "Kaos KSO", note: "Dibagikan panitia saat ambil badge", photo_url: "https://x.supabase.co/k.jpg" }), {
  what: "Kaos KSO",
  note: "Dibagikan panitia saat ambil badge",
  photo_url: "https://x.supabase.co/k.jpg",
});

// Skema tulis: tidak dikirim = tidak diubah, null atau what kosong = tidak ada, batas sama dengan baris Agenda.
const tulis = (nilai: unknown) => outfitSetiapHariSchema.safeParse(nilai);
assert.deepEqual(tulis(undefined), { success: true, data: undefined });
assert.deepEqual(tulis(null), { success: true, data: null });
assert.deepEqual(tulis({ what: "  ", note: "Catatan", photo_url: "https://x.supabase.co/k.jpg" }), { success: true, data: null });
assert.deepEqual(tulis({ note: "Catatan" }), { success: true, data: null });
assert.deepEqual(tulis({ what: " Kaos KSO ", note: "", photo_url: "", when: "Pagi" }), { success: true, data: { what: "Kaos KSO" } });
assert.deepEqual(tulis({ what: "Kaos KSO", note: " Dibagikan ", photo_url: "https://x.supabase.co/k.jpg" }), { success: true, data: { what: "Kaos KSO", note: "Dibagikan", photo_url: "https://x.supabase.co/k.jpg" } });
assert.equal(tulis({ what: "x".repeat(121) }).success, false);
assert.equal(tulis({ what: "a", note: "x".repeat(201) }).success, false);
assert.equal(tulis({ what: 5 }).success, false);
assert.equal(tulis("Kaos KSO").success, false);
for (const foto of ["javascript:alert(1)", "http://x.test/a.jpg", "data:image/png;base64,AAAA", "//x.test/a.jpg"]) {
  assert.equal(tulis({ what: "Kaos KSO", photo_url: foto }).success, false, foto);
}

// Baris "Berikutnya": setiap baris hari itu, Setiap hari dulu, format strip.
assert.deepEqual(teksBarisOutfit(denganSetiapHari([gala], kaos, LABEL)), ["Setiap hari · Kaos KSO", "17.30 Gala Dinner · Batik lengan panjang"]);
assert.deepEqual(teksBarisOutfit([gala, { what: "Pakaian olahraga" }]), ["17.30 Gala Dinner · Batik lengan panjang", "Pakaian olahraga"]);
assert.deepEqual(teksBarisOutfit([]), []);

// Beranda: bagian dipilih dari baris tab sendiri; Setiap hari mengisi hari tanpa baris.
const hari = [
  { tanggal: "2026-11-05", outfit: [] },
  { tanggal: "2026-11-06", outfit: [] },
  { tanggal: "2026-11-06", outfit: [gala] },
  { tanggal: "2026-11-07", outfit: [{ what: "Pakaian olahraga" }] },
  { tanggal: "2026-11-08", outfit: [] },
];
const batch1 = { milik: new Set([1]), bukanMilik: new Set([2]) };
const batch2 = { milik: new Set([2]), bukanMilik: new Set([1]) };
const beranda = (hariIni: string, besok: string, pilihan: typeof batch1 | null, everyDay: typeof kaos | null) => hariOutfitBerandaSetiapHari(hari, hariIni, besok, pilihan, everyDay);
// Tanpa Setiap hari: sama persis dengan hariOutfitBeranda.
for (const [hariIni, besok] of [["2026-11-01", "2026-11-02"], ["2026-11-04", "2026-11-05"], ["2026-11-05", "2026-11-06"], ["2026-11-06", "2026-11-07"], ["2026-11-09", "2026-11-10"]]) {
  for (const pilihan of [null, batch1, batch2]) assert.deepEqual(beranda(hariIni, besok, pilihan, null), hariOutfitBeranda(hari, hariIni, besok, pilihan));
}
assert.equal(beranda("2026-11-05", "2026-11-06", null, null), null);
// Dengan Setiap hari, hari tanpa baris tetap tampil.
assert.deepEqual(beranda("2026-11-05", "2026-11-06", null, kaos), { indeks: 0, jenis: "hariIni" });
assert.deepEqual(beranda("2026-11-01", "2026-11-02", null, kaos), { indeks: 0, jenis: "pertama" });
assert.deepEqual(beranda("2026-11-04", "2026-11-05", null, kaos), { indeks: 0, jenis: "besok" });
assert.deepEqual(beranda("2026-11-08", "2026-11-09", null, kaos), { indeks: 4, jenis: "hariIni" });
assert.deepEqual(beranda("2026-11-09", "2026-11-10", null, kaos), { indeks: 4, jenis: "terakhir" });
// Pilihan bagian tidak berubah: tanpa batch tetap tab yang berisi (Batch 2), Batch 1 tetap tabnya sendiri.
assert.deepEqual(beranda("2026-11-06", "2026-11-07", null, kaos), { indeks: 2, jenis: "hariIni" });
assert.deepEqual(beranda("2026-11-06", "2026-11-07", batch2, kaos), { indeks: 2, jenis: "hariIni" });
assert.equal(beranda("2026-11-06", "2026-11-07", batch1, null), null);
assert.deepEqual(beranda("2026-11-06", "2026-11-07", batch1, kaos), { indeks: 1, jenis: "hariIni" });
// Semua bagian tanggal itu untuk kelompok lain: tetap tidak ada kartu.
assert.equal(hariOutfitBerandaSetiapHari([{ tanggal: "2026-11-06", outfit: [] }], "2026-11-06", "2026-11-07", { milik: new Set(), bukanMilik: new Set([0]) }, kaos), null);
assert.deepEqual(hariOutfitBerandaSetiapHari([{ tanggal: null, outfit: [] }], "2026-11-06", "2026-11-07", null, kaos), { indeks: 0, jenis: "pertama" });
assert.equal(hariOutfitBerandaSetiapHari([], "2026-11-06", "2026-11-07", null, kaos), null);

// Acara tanpa tab Agenda: hari dari tanggal acara, dengan aturan yang sama.
assert.deepEqual(hariTanpaAgenda("2026-11-06", "2026-11-08", "2026-11-02"), ["2026-11-06", "2026-11-08"]);
assert.deepEqual(hariTanpaAgenda("2026-11-06", "2026-11-08", "2026-11-07"), ["2026-11-06", "2026-11-07", "2026-11-08"]);
assert.deepEqual(hariTanpaAgenda("2026-11-06", "2026-11-08", "2026-11-08"), ["2026-11-06", "2026-11-08"]);
assert.deepEqual(hariTanpaAgenda("2026-12-01", null, "2026-12-01"), ["2026-12-01"]);
assert.deepEqual(hariTanpaAgenda("2026-12-01", "2026-11-30", "2026-12-01"), ["2026-12-01"]);
assert.deepEqual(hariTanpaAgenda(null, "2026-11-08", "2026-11-07"), [null]);
assert.deepEqual(hariTanpaAgenda("6 Nov", null, "2026-11-07"), [null]);
const tanpaAgenda = (mulai: string | null, selesai: string | null, hariIni: string, besok: string) => {
  const hariAcara = hariTanpaAgenda(mulai, selesai, hariIni).map((tanggal) => ({ tanggal, outfit: [] }));
  const hasil = hariOutfitBerandaSetiapHari(hariAcara, hariIni, besok, null, kaos);
  return hasil && { tanggal: hariAcara[hasil.indeks].tanggal, jenis: hasil.jenis };
};
assert.deepEqual(tanpaAgenda("2026-11-06", "2026-11-08", "2026-11-02", "2026-11-03"), { tanggal: "2026-11-06", jenis: "pertama" });
assert.deepEqual(tanpaAgenda("2026-11-06", "2026-11-08", "2026-11-05", "2026-11-06"), { tanggal: "2026-11-06", jenis: "besok" });
assert.deepEqual(tanpaAgenda("2026-11-06", "2026-11-08", "2026-11-07", "2026-11-08"), { tanggal: "2026-11-07", jenis: "hariIni" });
assert.deepEqual(tanpaAgenda("2026-11-06", "2026-11-08", "2026-11-09", "2026-11-10"), { tanggal: "2026-11-08", jenis: "terakhir" });
assert.deepEqual(tanpaAgenda(null, null, "2026-11-07", "2026-11-08"), { tanggal: null, jenis: "pertama" });
// Sama dengan menjabarkan setiap hari acara, untuk tiap hari di sekitar acara.
const geser = (tanggal: string, hari: number) => new Date(Date.parse(`${tanggal}T00:00:00Z`) + hari * 864e5).toISOString().slice(0, 10);
const semuaHari = Array.from({ length: 10 }, (_, urutan) => ({ tanggal: geser("2026-11-06", urutan), outfit: [] }));
for (let selisih = -5; selisih <= 14; selisih += 1) {
  const hariIni = geser("2026-11-06", selisih);
  const penuh = hariOutfitBerandaSetiapHari(semuaHari, hariIni, geser(hariIni, 1), null, kaos);
  assert.deepEqual(tanpaAgenda("2026-11-06", "2026-11-15", hariIni, geser(hariIni, 1)), penuh && { tanggal: semuaHari[penuh.indeks].tanggal, jenis: penuh.jenis }, hariIni);
}

// ---- Admin (PR B2) --------------------------------------------------------------

// Setiap hari di satu tab: aturan yang sama dengan denganSetiapHari.
assert.equal(setiapHariDiTab([gala, malam], kaos), kaos);
assert.equal(setiapHariDiTab([], kaos), kaos);
assert.equal(setiapHariDiTab([item], kaos), kaos);
assert.equal(setiapHariDiTab([{ what: "Pakaian olahraga" }], kaos), null);
assert.equal(setiapHariDiTab([gala, { what: "Pakaian olahraga", when: "  " }], kaos), null);
for (const kosong of [undefined, null, { what: "" }, { what: "   " }]) assert.equal(setiapHariDiTab([gala], kosong), null);
// denganSetiapHari menambah satu baris tepat saat setiapHariDiTab tidak null.
for (const daftar of [[], [gala], [item, malam], [{ what: "Pakaian olahraga" }], [gala, { what: "Pakaian olahraga" }]] as OutfitEntry[][]) {
  for (const setiap of [kaos, null]) assert.equal(denganSetiapHari(daftar, setiap, LABEL).length, daftar.length + (setiapHariDiTab(daftar, setiap) ? 1 : 0));
}

// Baris Dress code Agenda: Every day lebih dulu, lalu baris tab sendiri dalam urutannya.
const galaBaris = { untuk: "17:30 Gala Dinner", apa: "Batik lengan panjang" };
const malamBaris = { untuk: "Malam hari", apa: "Bebas rapi" };
assert.deepEqual(barisDenganSetiapHari([galaBaris, malamBaris], "Kaos KSO"), [{ untuk: "Every day", apa: "Kaos KSO" }, galaBaris, malamBaris]);
assert.deepEqual(barisDenganSetiapHari([], "Kaos KSO"), [{ untuk: SETIAP_HARI_ADMIN, apa: "Kaos KSO" }]);
assert.deepEqual(barisDenganSetiapHari([galaBaris], null), [galaBaris]);
assert.deepEqual(barisDenganSetiapHari([], null), []);
// Dari isian tersimpan: tab dengan Whole day sendiri tidak menampilkan Every day.
const barisTab = (simpanan: OutfitEntry[], ringkas: Array<{ untuk: string; apa: string }>) => barisDenganSetiapHari(ringkas, setiapHariDiTab(simpanan, kaos)?.what ?? null);
assert.deepEqual(barisTab([gala], [galaBaris]), [{ untuk: "Every day", apa: "Kaos KSO" }, galaBaris]);
assert.deepEqual(barisTab([item], [galaBaris]), [{ untuk: "Every day", apa: "Kaos KSO" }, galaBaris]);
assert.deepEqual(barisTab([{ what: "Pakaian olahraga" }], [{ untuk: "Whole day", apa: "Pakaian olahraga" }]), [{ untuk: "Whole day", apa: "Pakaian olahraga" }]);

// Petunjuk Whole day, kotak Every day, dan keadaan kosong editor tab.
assert.equal(petunjukSeharian(kaos), "Replaces “Kaos KSO” (Every day) on this tab. Other tabs keep it.");
assert.equal(petunjukSeharian(null), "Covers the whole of this tab. Other tabs need their own.");
assert.equal(keteranganSetiapHari(false), "Set in Participant area for the whole event, so this tab shows it too.");
assert.equal(keteranganSetiapHari(true), "Not shown on this tab, because this tab has its own Whole day line.");
assert.deepEqual(kosongDresscode(kaos), {
  judul: "No extra dress code for this tab",
  teks: "Participants see the every-day dress code (Kaos KSO). Add a line for the whole day or for one of this tab’s agenda items if this day needs more.",
});
assert.deepEqual(kosongDresscode(null), {
  judul: "No dress code for this tab yet",
  teks: "Add one for the whole day, or for one of this tab’s agenda items. Participants see it above this day in their schedule.",
});

// Participant area: kolom dari nilai apa pun.
assert.deepEqual(isianSetiapHari(undefined), { what: "", note: "", photo_url: null });
assert.deepEqual(isianSetiapHari(null), { what: "", note: "", photo_url: null });
assert.deepEqual(isianSetiapHari("Kaos KSO"), { what: "", note: "", photo_url: null });
assert.deepEqual(isianSetiapHari({ what: "Kaos KSO ", note: 3, photo_url: "https://x.supabase.co/k.jpg" }), { what: "Kaos KSO ", note: "", photo_url: "https://x.supabase.co/k.jpg" });

// Draf: teks apa adanya, jadi spasi di ujung bisa diketik.
assert.deepEqual(drafSetiapHari({ what: "Kaos" }, { what: "Kaos " }, { what: "Kaos" }), { what: "Kaos " });
// Mengetik lalu menghapus: kembali ke nilai tersimpan itu sendiri, juga dengan urutan kunci jsonb (note lebih dulu).
const tersimpan = { note: "Dibagikan panitia saat ambil badge", what: "Kaos KSO" };
const langkah1 = drafSetiapHari(tersimpan, { what: "Kaos KSO!" }, tersimpan);
assert.deepEqual(langkah1, { what: "Kaos KSO!", note: "Dibagikan panitia saat ambil badge" });
assert.equal(drafSetiapHari(langkah1, { what: "Kaos KSO" }, tersimpan), tersimpan);
const anggota = { enabled: true, outfit_every_day: tersimpan };
assert.equal(JSON.stringify({ ...anggota, outfit_every_day: drafSetiapHari(langkah1, { what: "Kaos KSO" }, tersimpan) }), JSON.stringify(anggota));
// Tanpa simpanan: mengetik lalu menghapus kembali ke tidak ada.
assert.equal(drafSetiapHari({ what: "K" }, { what: "" }, undefined), undefined);
assert.equal(drafSetiapHari({ what: "K" }, { what: "" }, null), null);
// Dikosongkan dari simpanan: draf yang menyatakan kosong, dikirim sebagai null.
assert.deepEqual(drafSetiapHari(tersimpan, { what: "" }, tersimpan), { what: "", note: "Dibagikan panitia saat ambil badge" });
assert.equal(kirimanSetiapHari(drafSetiapHari(tersimpan, { what: "" }, tersimpan)), null);
// Catatan kosong dan foto yang dilepas tidak ikut di draf.
assert.deepEqual(drafSetiapHari({ what: "Kaos KSO", note: "x", photo_url: "https://x.supabase.co/k.jpg" }, { note: "", photo_url: null }, undefined), { what: "Kaos KSO" });
assert.deepEqual(drafSetiapHari(undefined, { photo_url: "https://x.supabase.co/k.jpg" }, undefined), { what: "", photo_url: "https://x.supabase.co/k.jpg" });

// Yang dikirim: dipangkas, kolom kosong dibuang, null tanpa What to wear (juga dengan catatan atau foto).
assert.deepEqual(kirimanSetiapHari({ what: " Kaos KSO ", note: "  ", photo_url: " https://x.supabase.co/k.jpg " }), { what: "Kaos KSO", photo_url: "https://x.supabase.co/k.jpg" });
assert.equal(kirimanSetiapHari({ what: "  ", note: "Catatan", photo_url: "https://x.supabase.co/k.jpg" }), null);
assert.equal(kirimanSetiapHari(undefined), null);
// Yang salah tetap dikirim, supaya server menolaknya dengan alasannya.
assert.deepEqual(kirimanSetiapHari({ what: "Kaos KSO", photo_url: "http://x.test/k.jpg" }), { what: "Kaos KSO", photo_url: "http://x.test/k.jpg" });
// Sama menurut yang akan tersimpan: spasi, urutan kunci, dan tiga bentuk "tidak ada".
assert.equal(samaSetiapHari({ what: "Kaos KSO " }, { what: "Kaos KSO" }), true);
assert.equal(samaSetiapHari(tersimpan, { what: "Kaos KSO", note: "Dibagikan panitia saat ambil badge" }), true);
assert.equal(samaSetiapHari(undefined, null), true);
assert.equal(samaSetiapHari(undefined, { what: "", note: "x" }), true);
assert.equal(samaSetiapHari({ what: "Kaos KSO" }, { what: "Kaos" }), false);
assert.equal(samaSetiapHari({ what: "Kaos KSO" }, { what: "Kaos KSO", photo_url: "https://x.supabase.co/k.jpg" }), false);
// "Participants see …": format strip peserta, hanya dengan What to wear.
assert.equal(lihatSetiapHari({ what: " Kaos KSO ", note: "x" }), "Setiap hari · Kaos KSO");
assert.equal(lihatSetiapHari({ what: " " }), null);
assert.equal(lihatSetiapHari(undefined), null);

// Gabungan PATCH Participant area ({ ...tersimpan, ...patch } lalu tanpaSetiapHariKosong),
// dengan skema kolom yang sama dengan memberSchema.
const skemaPatch = z.object({ enabled: z.boolean(), show_bus_plate: z.boolean().optional(), outfit_every_day: outfitSetiapHariSchema }).partial({ enabled: true });
const simpananAnggota: LandingMemberConfig = { enabled: true, outfit_label: "Dresscode", outfit_every_day: { what: "Kaos KSO", note: "Dibagikan panitia saat ambil badge" } };
const gabungPatch = (patch: unknown) => {
  const hasil = skemaPatch.safeParse(patch);
  if (!hasil.success) throw new Error(`ditolak: ${JSON.stringify(patch)}`);
  return tanpaSetiapHariKosong({ ...simpananAnggota, ...hasil.data } as LandingMemberConfig);
};
// Simpanan yang tidak menyentuhnya (Logistics > Buses, Save changes tanpa ubahan Every day) mempertahankannya.
assert.deepEqual(gabungPatch({ show_bus_plate: true }).outfit_every_day, simpananAnggota.outfit_every_day);
assert.deepEqual(gabungPatch({ enabled: false }).outfit_every_day, simpananAnggota.outfit_every_day);
// Diganti; dikosongkan: kuncinya dibuang, bukan disimpan null, dan kunci lain tetap.
assert.deepEqual(gabungPatch({ outfit_every_day: { what: "Batik" } }).outfit_every_day, { what: "Batik" });
for (const kosong of [null, { what: "" }, { what: "  ", note: "Catatan", photo_url: "https://x.supabase.co/k.jpg" }]) {
  const hasil = gabungPatch({ outfit_every_day: kosong });
  assert.equal("outfit_every_day" in hasil, false, JSON.stringify(kosong));
  assert.equal(hasil.outfit_label, "Dresscode");
}
// Masukannya tidak diubah.
const masukan: LandingMemberConfig = { enabled: true, outfit_every_day: null };
assert.deepEqual(tanpaSetiapHariKosong(masukan), { enabled: true });
assert.equal(masukan.outfit_every_day, null);
assert.equal(tanpaSetiapHariKosong(simpananAnggota), simpananAnggota);

// 422 PATCH Participant area: kalimat English per kolom sampai ke fieldErrors.outfit_every_day
// (zod.flatten), lalu galatSetiapHari membacanya untuk kelompok Every day.
const tolak = (nilai: unknown) => {
  const hasil = z.object({ outfit_every_day: outfitSetiapHariSchema }).safeParse({ outfit_every_day: nilai });
  if (hasil.success) throw new Error(`diterima: ${JSON.stringify(nilai)}`);
  return galatSetiapHari({ error: { code: "VALIDATION_ERROR", message: "Some of the data sent is not valid.", details: hasil.error.flatten() } });
};
assert.equal(tolak({ what: "x".repeat(121) }), "What to wear can be at most 120 characters.");
assert.equal(tolak({ what: "Kaos KSO", note: "x".repeat(201) }), "The note can be at most 200 characters.");
assert.equal(tolak({ what: "Kaos KSO", photo_url: "http://x.test/k.jpg" }), "The photo must be an https:// address. Upload the photo again.");
assert.equal(tolak({ what: "Kaos KSO", photo_url: `https://x.supabase.co/${"k".repeat(600)}.jpg` }), "The photo address is too long. Upload the photo again.");
assert.equal(tolak("Kaos KSO"), "Every day is not in the expected shape. Reload the page and try again.");
assert.equal(tolak({ what: 5 }), "Every day is not in the expected shape. Reload the page and try again.");
// Galat kolom lain, atau jawaban tanpa fieldErrors: tidak ada kalimat Every day.
assert.equal(galatSetiapHari({ error: { details: { formErrors: [], fieldErrors: { feedback_url: ["Invalid url"] } } } }), null);
assert.equal(galatSetiapHari({ error: { details: { message: "x" } } }), null);
assert.equal(galatSetiapHari(null), null);
assert.equal(galatSetiapHari("teks"), null);

console.log("outfit-setiap-hari: ok");
