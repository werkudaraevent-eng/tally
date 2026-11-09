import assert from "node:assert/strict";
import { bahanContoh as bahan } from "./contoh.ts";
import { bacaConfig, bacaKecuali, CONFIG_KOSONG, geser, urutkan } from "./config.ts";
import { catatanSaring, daftarTipe, pesertaKeluar } from "./saring.ts";
import type { Slide } from "./jenis.ts";
import { pasangLatar, susunDeck } from "./susun.ts";
import { hitungTitik, slideTitik } from "./slide/titik.ts";
import { temaDeck } from "./warna.ts";
import { LEBAR_KIRI, lebarKolom, potong, ujung, ukuranAngka, ukuranJudul } from "./ukuran.ts";

const teksSlide = (s: Slide): string[] => {
  if (s.jenis === "sampul") return [s.judul, ...s.baris, s.kaki, s.stiker ?? ""];
  const isi: string[] = [s.judul, s.kaki ?? "", s.stiker?.teks ?? ""];
  for (const b of s.blok) {
    if (b.jenis === "angka") for (const x of b.isi) isi.push(x.label, x.nilai, x.ket);
    if (b.jenis === "tabel") for (const r of b.baris) isi.push(...r.sel);
    if (b.jenis === "batang") for (const x of b.seri) isi.push(x.label, x.teks);
    if (b.jenis === "teks") isi.push(...b.paragraf, ...(b.poin ?? []), ...(b.kecil ?? []));
    if (b.jenis === "panas") for (const r of b.baris) isi.push(r.label, r.sub, r.total, r.ket, b.keterangan);
    if (b.jenis === "chip") for (const x of b.isi) isi.push(x.label, x.nilai);
  }
  return isi;
};

// 1. Deck lengkap: sampul pertama, tanpa slide kosong, Usulan tanpa baris tidak ikut.
{
  const { deck, daftar, absen } = susunDeck(bahan(), CONFIG_KOSONG);
  assert.equal(deck.slide[0].kunci, "sampul");
  assert.equal(deck.slide[1].kunci, "ringkas");
  assert.ok(deck.slide.every((s) => s.jenis === "sampul" || s.blok.length > 0));
  assert.ok(!deck.slide.some((s) => s.kunci === "usulan"), "Usulan kosong tidak diekspor");
  assert.ok(daftar.find((d) => d.kunci === "usulan")?.kosong);
  for (const k of ["corong", "kelompok", "sesi", "portal", "kepuasan", "pengumuman", "undian", "operasional", "harih", "panas", "titik.cp-1", "titik.cp-2", "titik.cp-3", "lampiran"]) {
    assert.ok(deck.slide.some((s) => s.kunci === k), `slide ${k} tampil`);
  }
  assert.ok(absen.every((a) => a.alasan.length > 0));

  // Aturan tulisan: tanpa em/en dash, judul tanpa titik dua, tanpa "karena".
  for (const s of deck.slide) {
    for (const t of teksSlide(s)) assert.ok(!/[–—]/.test(t), `dash di "${t}"`);
    if (s.jenis === "isi") {
      assert.ok(!s.judul.includes(":"), `titik dua di judul "${s.judul}"`);
      assert.ok(!/\bkarena\b|\bbecause\b/i.test(s.judul), `klaim sebab di "${s.judul}"`);
      assert.ok(s.judul.length <= 140);
    }
  }

  // Ringkasan merujuk nomor slide yang benar.
  const ringkas = deck.slide[1];
  assert.equal(ringkas.jenis, "isi");
  const poin = ringkas.jenis === "isi" ? ringkas.blok.find((b) => b.jenis === "teks") : undefined;
  if (poin && poin.jenis === "teks") {
    for (const p of poin.poin ?? []) {
      const n = Number(/\(slide (\d+)\)$/.exec(p)?.[1]);
      assert.ok(n >= 3 && n <= deck.slide.length, `rujukan slide ${n}`);
    }
  }
}

// 2. Kelompok di bawah 10 orang digabung ke "Lainnya", tidak tampil sendiri.
{
  const { semua } = susunDeck(bahan(), CONFIG_KOSONG);
  const s = semua.kelompok;
  assert.equal(s.jenis, "isi");
  const tabel = s.jenis === "isi" ? s.blok.find((b) => b.jenis === "tabel") : undefined;
  assert.ok(tabel && tabel.jenis === "tabel");
  const label = tabel.baris.map((r) => r.sel[0]);
  assert.ok(!label.includes("Tamu"));
  assert.ok(label.includes("Lainnya"));
}

// 3. Pilihan panitia: sembunyi, judul sendiri, catatan, urutan.
{
  const config = bacaConfig({ sembunyi: ["portal"], judul: { corong: "Judul sendiri" }, catatan: { corong: "Catatan" }, urutan: ["undian"] });
  const { deck, daftar } = susunDeck(bahan(), config);
  assert.ok(!deck.slide.some((s) => s.kunci === "portal"));
  assert.ok(daftar.find((d) => d.kunci === "portal")?.disembunyikan);
  const corong = deck.slide.find((s) => s.kunci === "corong");
  assert.ok(corong && corong.jenis === "isi" && corong.judul === "Judul sendiri" && corong.catatan === "Catatan");
  assert.equal(deck.slide[1].kunci, "undian");
}

// 4. Acara tanpa data apa pun: hanya sampul, dan alasan tiap slide yang absen.
{
  const kosong = bahan({ peserta: [], hadir: new Set(), sesi: [], semuaSesi: [], sesiDiikuti: new Map(), portal: null, feedback: null, pengumuman: null, undian: null, logistik: null, diundang: null, mendaftar: null, disetujui: null });
  const { deck, absen } = susunDeck(kosong, CONFIG_KOSONG);
  assert.deepEqual(deck.slide.map((s) => s.kunci), ["sampul"]);
  assert.ok(absen.length >= 8);
}

// 5. Slide tambahan: grafik dari pertanyaan, slide teks, dan pertanyaan yang sudah hilang.
{
  const config = bacaConfig({
    tambahan: [
      { id: "t-a1", jenis: "pertanyaan", sumber: "feedback", kunci: "suka" },
      { id: "t-a2", jenis: "teks", judul: "Catatan", poin: ["Satu", "  ", "Dua"] },
      { id: "t-a3", jenis: "pertanyaan", sumber: "daftar", kunci: "hilang" },
      { id: "bukan-id", jenis: "teks", judul: "x", poin: ["x"] },
    ],
  });
  assert.equal(config.tambahan.length, 3);
  const { deck, absen } = susunDeck(bahan(), config);
  const grafik = deck.slide.find((s) => s.kunci === "t-a1");
  assert.ok(grafik && grafik.jenis === "isi" && grafik.judul.startsWith("Makanan"));
  const teks = deck.slide.find((s) => s.kunci === "t-a2");
  assert.ok(teks && teks.jenis === "isi" && teks.blok[0].jenis === "teks" && teks.blok[0].poin?.length === 2);
  assert.ok(absen.some((a) => a.kunci === "t-a3"));
}

// 6. Config rusak dibaca aman; urutan dan geser menjaga sampul di depan.
{
  assert.deepEqual(bacaConfig(null), CONFIG_KOSONG);
  assert.deepEqual(bacaConfig({ sembunyi: "x", kelompok: "extra.DROP TABLE" }).kelompok, null);
  const urut = urutkan(bacaConfig({ urutan: ["usulan", "sampul", "zzz"] }));
  assert.equal(urut[0], "sampul");
  assert.equal(urut[1], "usulan");
  assert.ok(!urut.includes("zzz"));
  assert.equal(geser(CONFIG_KOSONG, "sampul", 1), CONFIG_KOSONG);
  assert.equal(urutkan(geser(CONFIG_KOSONG, "corong", -1))[1], "corong");
}

// 7. Bahasa Inggris: label dan angka mengikuti bahasa acara.
{
  const b = bahan();
  b.acara.bahasa = "en";
  const { deck } = susunDeck(b, CONFIG_KOSONG);
  const sampul = deck.slide[0];
  assert.ok(sampul.jenis === "sampul" && sampul.baris.some((x) => x === "For the board and management") && sampul.stiker === "Committee report");
}

// 8. Ukuran: teks panjang mengecil atau dipotong, tidak menumbuhkan slide.
{
  assert.equal(ukuranJudul("Pendek"), 40);
  assert.ok(ukuranJudul("x".repeat(140)) < 34);
  const tiga = { jenis: "angka" as const, isi: ["26 / 30", "46%", "520"].map((nilai) => ({ label: "L", nilai, ket: "" })) };
  const u = ukuranAngka(tiga, LEBAR_KIRI);
  assert.ok(u < 64 && u >= 32 && u * 0.6 * 7 <= LEBAR_KIRI / 3 - 36, `angka ${u}px`);
  assert.equal(potong("abcdef", 4), "abc…");
  assert.equal(potong("abc", 4), "abc");
  assert.deepEqual(ujung([1, 2, 3, 4, 5, 6], 3, 2).tengah, []);
  assert.deepEqual(ujung([1, 2, 3, 4, 5, 6, 7, 8], 3, 2).tengah, [4, 5, 6]);
  const tbl = { jenis: "tabel" as const, kolom: [{ label: "Nama" }, { label: "Hadir", kanan: true }, { label: "%", kanan: true }], baris: [{ sel: ["x".repeat(63), "1.126", "90%"], batang: 90 }], batangSetelah: 2 };
  const lebar = lebarKolom(tbl, LEBAR_KIRI);
  assert.equal(lebar.length, 4);
  assert.ok(Math.abs(lebar.reduce((a, x) => a + x, 0) - LEBAR_KIRI) < 1);
}

// 9. Banyak kelompok: tiga teratas, dua terbawah, sisanya satu baris "di tengah".
{
  const b = bahan();
  b.peserta = b.peserta.map((p, i) => ({ ...p, kelompok: `Unit ${i % 10}` }));
  const { deck } = susunDeck(b, CONFIG_KOSONG);
  const s = deck.slide.find((x) => x.kunci === "kelompok");
  assert.ok(s && s.jenis === "isi");
  const t = s.blok.find((x) => x.jenis === "tabel");
  assert.ok(t && t.jenis === "tabel");
  assert.equal(t.baris.length, 7, t.baris.map((r) => r.sel[0]).join("|"));
  assert.ok(t.baris.some((r) => r.sel[0] === "5 divisi lain"));
  assert.equal(t.baris.at(-1)?.sel[1], "200");
}

// 10. Hari H: pembatas, peta panas, satu slide per titik Agenda, lampiran; urutan titik sesudah peta panas.
{
  const { deck, daftar } = susunDeck(bahan(), CONFIG_KOSONG);
  const k = deck.slide.map((s) => s.kunci);
  assert.deepEqual(k.slice(k.indexOf("harih"), k.indexOf("harih") + 5), ["harih", "panas", "titik.cp-1", "titik.cp-2", "titik.cp-3"]);
  assert.equal(k.at(-1), "lampiran");
  assert.equal(daftar.find((d) => d.kunci === "titik.cp-2")?.nama, "Check-in point: Sesi 2");
  const pembatas = deck.slide.find((s) => s.kunci === "harih");
  assert.ok(pembatas && pembatas.jenis === "isi" && pembatas.tata === "pembatas" && pembatas.latar === "gelap");
  assert.ok(pembatas.blok[0].jenis === "chip" && pembatas.blok[0].isi.length === 3);
  const panas = deck.slide.find((s) => s.kunci === "panas");
  assert.ok(panas && panas.jenis === "isi" && panas.blok[0].jenis === "panas");
  const peta = panas.blok[0];
  assert.ok(peta.jenis === "panas" && peta.baris.length === 3 && peta.kolom.length >= 2 && peta.kolom.length <= 16);
  // Contoh: semua datang 0 sampai 80 menit sebelum 08.00, jadi per 15 menit dan tanpa yang telat.
  const satu = deck.slide.find((s) => s.kunci === "titik.cp-1");
  assert.ok(satu && satu.jenis === "isi" && satu.tata === "penuh");
  const g = satu.blok[0];
  assert.ok(g.jenis === "batang" && g.seri.length >= 5 && g.seri.length <= 13 && g.penanda?.label === "Mulai 08.00");
  assert.equal(g.seri.reduce((a, x) => a + x.nilai, 0), bahan().sesi[0].datang.length, "jumlah ember = jumlah orang");

  // Ganti urutan: titik bisa digeser seperti slide lain.
  const dinamis = ["titik.cp-1", "titik.cp-2", "titik.cp-3"];
  const naik = geser(CONFIG_KOSONG, "titik.cp-2", -1, dinamis);
  const u = urutkan(naik, dinamis);
  assert.ok(u.indexOf("titik.cp-2") < u.indexOf("titik.cp-1"));
  // Kunci titik yang tidak ada lagi dibuang dari urutan.
  assert.ok(!urutkan(bacaConfig({ urutan: ["titik.cp-9"] }), dinamis).includes("titik.cp-9"));
}

// 11. Satu titik yang tersebar sepanjang hari: per jam, jam tersibuk diperbesar, telat dan menit tersibuk dihitung.
{
  const b = bahan();
  const datang: string[] = [];
  // 60 orang 07.00 sampai 07.59 (12 di menit 07.38), 30 orang 09.00 sampai 13.00, 20 orang setelah mulai 10.00 di antaranya.
  for (let i = 0; i < 48; i++) datang.push(`2026-11-07T07:${String(i).padStart(2, "0")}:00+07:00`);
  for (let i = 0; i < 12; i++) datang.push(`2026-11-07T07:38:${String(i * 4).padStart(2, "0")}+07:00`);
  for (let i = 0; i < 30; i++) datang.push(`2026-11-07T${String(9 + Math.floor(i / 8)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00+07:00`);
  const sesi = { kunci: "cp-7", nama: "Pleno", tanggal: "2026-11-07", jam: "10:00", diharapkan: 100, sudah: 90, datang: datang.map((x) => new Date(x).toISOString()) };
  const h = hitungTitik(sesi, "+07:00");
  assert.equal(h.n, 90);
  assert.equal(h.jamPuncak, 7);
  assert.equal(h.pJamPuncak, 67);
  assert.equal(h.menitPuncak?.n, 13);
  assert.equal(h.telat, datang.filter((x) => Date.parse(x) >= Date.parse("2026-11-07T10:00:00+07:00")).length);
  const s = slideTitik(b, h);
  assert.equal(s.slide.tata, "dua");
  const [jam, angkaSisi, zoom] = s.slide.blok;
  assert.ok(jam.jenis === "batang" && jam.seri[0].label === "07.00" && jam.seri.reduce((a, x) => a + x.nilai, 0) === 90);
  assert.ok(angkaSisi.jenis === "angka" && angkaSisi.tumpuk && angkaSisi.isi[1].nilai === ((h.pTelat ?? 0) >= 20 ? `${h.pTelat}%` : "13 / menit"));
  assert.ok(zoom.jenis === "batang" && zoom.seri.length === 4 && zoom.seri.reduce((a, x) => a + x.nilai, 0) === 60);
  assert.ok(!s.slide.saran.includes(":"));
  if ((h.pTelat ?? 0) >= 20) assert.ok(s.slide.stiker?.merah && s.temuan);
  else assert.ok(s.slide.stiker?.teks === "67% di jam ini" && s.temuan?.startsWith("67% kedatangan Pleno"));
}

// 12. Permukaan: tidak ada dua slide bersebelahan sama, pembatas gelap, slide bertanda merah tidak di aksen.
{
  const { deck } = susunDeck(bahan(), CONFIG_KOSONG);
  const isi = deck.slide.filter((s) => s.jenis === "isi");
  assert.ok(isi.every((s) => s.jenis === "isi" && s.latar));
  for (let i = 1; i < deck.slide.length; i++) {
    const a = deck.slide[i - 1];
    const c = deck.slide[i];
    if (a.jenis === "isi" && c.jenis === "isi" && c.tata !== "pembatas" && !c.blok.some((x) => (x.jenis === "tabel" && x.baris.length > 7) || x.jenis === "panas")) assert.notEqual(a.latar, c.latar, `${a.kunci} dan ${c.kunci}`);
  }
  const merah = pasangLatar([{ kunci: "x", jenis: "isi", judul: "x", saran: "x", tata: "penuh", stiker: { teks: "x", merah: true }, blok: [], catatan: null, kaki: "" }]);
  assert.ok(merah[0].jenis === "isi" && merah[0].latar !== "aksen");
  assert.ok(deck.tema && deck.tema.latar.startsWith("#"));
  // Deck lama yang hanya menyimpan satu warna tetap punya tema.
  const lama = temaDeck({ warna: "#1F5FAD" });
  assert.ok(lama.aksen && lama.kertas && lama.judul.startsWith("var("));
}

// 13. Titik yang melewati tengah malam: garis waktu sungguhan, ujung yang dilipat diberi tanda.
{
  const b = bahan();
  const datang: string[] = [];
  for (let i = 0; i < 40; i++) datang.push(`2026-11-07T23:${String(i).padStart(2, "0")}:00+07:00`);
  for (let i = 0; i < 50; i++) datang.push(`2026-11-08T0${Math.floor(i / 20)}:${String(i % 20).padStart(2, "0")}:00+07:00`);
  datang.push("2026-11-08T09:00:00+07:00");
  const sesi = { kunci: "cp-8", nama: "Fun run", tanggal: "2026-11-07", jam: null, diharapkan: 0, sudah: 91, datang: datang.map((x) => new Date(x).toISOString()) };
  const s = slideTitik(b, hitungTitik(sesi, "+07:00"));
  const g = s.slide.blok[0];
  assert.ok(g.jenis === "batang");
  assert.deepEqual(g.seri.map((x) => x.label), ["23.00", "00.00", "01.00", "≥02.00"]);
  assert.deepEqual(g.seri.map((x) => x.nilai), [40, 20, 20, 11]);
  assert.equal(g.seri.findIndex((x) => x.sorot === "utama"), 0, "sorot jam di judul");
}

// 14. Kontras: teks redup dan merah >= 4,5:1 di tiap permukaan; merek terang tidak memakai permukaan aksen.
{
  const { kontras } = await import("../landing-hitung-mundur.ts");
  const { temaAcara, warnaPermukaan, aksenTerbaca } = await import("./warna.ts");
  for (const lc of [{}, { theme: { seed: "#0E5A3A" } }, { theme: { seed: "#F6E27A" } }, { layout: "modern", gathering: true, theme: { seed: "#1B2A6B" }, accent: "#F2B33D" }]) {
    const t = temaAcara(lc as never);
    for (const l of ["gelap", "aksen", "kertas"] as const) {
      if (l === "aksen" && !aksenTerbaca(t)) continue;
      const w = warnaPermukaan(t, l);
      assert.ok(kontras(w.teks2, w.bg) >= 4.5, `teks2 ${l} ${JSON.stringify(lc)}`);
      assert.ok(kontras(w.merah, w.bg) >= 4.5, `merah ${l} ${JSON.stringify(lc)}`);
    }
  }
  const terang = temaAcara({ theme: { seed: "#F6E27A" } } as never);
  if (!aksenTerbaca(terang)) {
    const b = bahan();
    b.acara.tema = terang;
    assert.ok(susunDeck(b, CONFIG_KOSONG).deck.slide.every((x) => x.jenis === "sampul" || x.latar !== "aksen"));
  }
}

// What's counted: config dibaca aman, Type tanpa beda huruf, catatan kaki dua bahasa.
{
  const a = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.deepEqual(bacaKecuali(null), { peserta: [], tipe: [], sumber: [] });
  assert.deepEqual(bacaKecuali({ peserta: [a.toUpperCase(), a, "bukan-uuid", 5], tipe: [" Panitia ", "", 3], sumber: ["feedback", "hapus", "daftar"] }), { peserta: [a], tipe: ["Panitia"], sumber: ["daftar", "feedback"] });
  assert.equal(bacaKecuali({ peserta: Array.from({ length: 250 }, (_, i) => `0f8fad5b-d9cb-469f-a165-${String(i).padStart(12, "0")}`) }).peserta.length, 200);
  assert.deepEqual(bacaConfig({}).kecuali, { peserta: [], tipe: [], sumber: [] });

  const tipe = new Map([["p1", "Panitia"], ["p2", "panitia "], ["p3", "Peserta"], ["p4", "Peserta"]]);
  assert.deepEqual([...pesertaKeluar({ peserta: ["p9"], tipe: ["PANITIA"], sumber: [] }, tipe)].sort(), ["p1", "p2", "p9"]);
  assert.equal(pesertaKeluar({ peserta: [], tipe: [], sumber: [] }, tipe).size, 0);
  assert.deepEqual(daftarTipe(tipe, new Set(["p1", "p2", "p3"])), [{ nama: "Panitia", jumlah: 2 }, { nama: "Peserta", jumlah: 1 }]);

  assert.equal(catatanSaring("id", 0, []), null);
  assert.equal(catatanSaring("id", 1, ["daftar", "feedback"]), "Tidak dihitung: 1 peserta, pendaftaran online dan jawaban Feedback.");
  assert.equal(catatanSaring("en", 2, []), "Not counted: 2 participants.");
  assert.equal(catatanSaring("en", 0, ["undian"]), "Not counted: lucky draw and voting.");

  // Catatan masuk kaki sampul dan corong; tanpa catatan, kaki sampul tidak berubah.
  const polos = susunDeck(bahan(), CONFIG_KOSONG).semua;
  const b = bahan();
  b.saring = { total: 10, dihitung: 9, tipe: [], sumber: { daftar: null, feedback: "6 answers", portal: null, pengumuman: null, undian: null, logistik: null }, catatan: "Tidak dihitung: 1 peserta." };
  const { semua } = susunDeck(b, { ...CONFIG_KOSONG, kecuali: { peserta: [], tipe: [], sumber: ["feedback"] } });
  const kaki = (s: Slide | undefined) => (s && "kaki" in s ? s.kaki : "");
  assert.equal(kaki(semua.sampul), `${kaki(polos.sampul)}. Tidak dihitung: 1 peserta.`);
  if (semua.corong) assert.ok(kaki(semua.corong).endsWith("Tidak dihitung: 1 peserta."));
  // Slide yang sumbernya dimatikan menyebut alasannya.
  const kosong = bahan({ feedback: null });
  const { absen } = susunDeck(kosong, { ...CONFIG_KOSONG, kecuali: { peserta: [], tipe: [], sumber: ["feedback"] } });
  assert.equal(absen.find((x) => x.kunci === "kepuasan")?.alasan, "Switched off in What's counted");
}

console.log("laporan.check: ok");
