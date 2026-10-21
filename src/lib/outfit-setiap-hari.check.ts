import assert from "node:assert/strict";
import { hariOutfitBeranda, type OutfitEntry } from "./outfit.ts";
import { bacaOutfitSetiapHari, denganSetiapHari, hariOutfitBerandaSetiapHari, hariTanpaAgenda, outfitSetiapHariSchema, teksBarisOutfit } from "./outfit-setiap-hari.ts";

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

console.log("outfit-setiap-hari: ok");
