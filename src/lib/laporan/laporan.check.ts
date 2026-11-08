import assert from "node:assert/strict";
import { bahanContoh as bahan } from "./contoh.ts";
import { bacaConfig, CONFIG_KOSONG, geser, urutkan } from "./config.ts";
import type { Slide } from "./jenis.ts";
import { susunDeck } from "./susun.ts";
import { LEBAR_KIRI, lebarKolom, potong, ujung, ukuranAngka, ukuranJudul } from "./ukuran.ts";

const teksSlide = (s: Slide): string[] => {
  if (s.jenis === "sampul") return [s.judul, ...s.baris, s.kaki];
  const isi: string[] = [s.judul, s.kaki ?? ""];
  for (const b of s.blok) {
    if (b.jenis === "angka") for (const x of b.isi) isi.push(x.label, x.nilai, x.ket);
    if (b.jenis === "tabel") for (const r of b.baris) isi.push(...r.sel);
    if (b.jenis === "batang") for (const x of b.seri) isi.push(x.label, x.teks);
    if (b.jenis === "teks") isi.push(...b.paragraf, ...(b.poin ?? []), ...(b.kecil ?? []));
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
  for (const k of ["corong", "kelompok", "sesi", "portal", "kepuasan", "kedatangan", "pengumuman", "undian", "operasional"]) {
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
  assert.ok(sampul.jenis === "sampul" && sampul.baris.some((x) => x === "Committee report for management"));
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

console.log("laporan.check: ok");
