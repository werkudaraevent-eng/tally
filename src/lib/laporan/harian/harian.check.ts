import assert from "node:assert/strict";
import { bahanContoh } from "../contoh.ts";
import { bacaHarian, bacaSetelanHari, SETELAN_KOSONG } from "./config.ts";
import { hariAcara, kedatanganHari, sibukHari, susunHari, susunRingkasan } from "./hitung.ts";
import { RINGKASAN } from "./jenis.ts";
import { warnaHalaman, warnaMuda } from "./warna.ts";
import { kontras } from "../../landing-hitung-mundur.ts";

const huruf = { judul: "Plus Jakarta Sans", isi: "Inter" };
const b = bahanContoh();
assert.deepEqual(hariAcara(b), ["2026-11-06", "2026-11-07", "2026-11-08"]);

// Hari pertama: sampul, hadir, jam, menit, agenda, penutup dengan agenda besok.
const h1 = susunHari(b, "2026-11-06", SETELAN_KOSONG, huruf).hari;
assert.deepEqual(h1.halaman.map((p) => p.kunci), ["sampul", "hadir", "jam", "menit", "agenda", "penutup"]);
assert.equal(h1.hariKe, 1);
const sampul = h1.halaman[0];
assert.ok(sampul.kunci === "sampul" && /^180 peserta datang di hari pertama\.$/.test(sampul.judul), sampul.kunci === "sampul" ? sampul.judul : "");
const hadir = h1.halaman[1];
assert.ok(hadir.kunci === "hadir" && hadir.isi === 9 && hadir.judul === "9 dari 10 peserta datang hari ini.");
const tutup = h1.halaman.at(-1)!;
assert.ok(tutup.kunci === "penutup" && tutup.judul === "Besok, Sesi 2 mulai 08.00.");
const jam = h1.halaman[2];
assert.ok(jam.kunci === "jam" && jam.batang.filter((x) => x.puncak).length === 1 && jam.batang.length <= 8);

// Hari terakhir: rekap pindah ke Seluruh acara; penutup terima kasih.
const h3 = susunHari(b, "2026-11-08", SETELAN_KOSONG, huruf).hari;
assert.ok(!h3.halaman.some((p) => p.kunci === "rekap"));
assert.equal(h3.halaman.at(-1)!.judul, "Terima kasih sudah bersama kami.");
// Persen agenda disertai jumlahnya.
const agH1 = h1.halaman.find((p) => p.kunci === "agenda");
assert.ok(agH1?.kunci === "agenda" && agH1.baris.every((r) => r.persen === null || /^\d[\d.]* dari \d[\d.]*$/.test(r.ket ?? "")), JSON.stringify(agH1));

// Seluruh acara: kunci RINGKASAN, hari 0, tiap persen ada "x dari y".
const rk = susunRingkasan(b, SETELAN_KOSONG, huruf);
assert.equal(rk.hari.tanggal, RINGKASAN);
assert.equal(rk.hari.hariKe, 0);
assert.equal(rk.hari.halaman[0].kunci, "sampul");
assert.equal(rk.hari.halaman.at(-1)!.kunci, "penutup");
const rekap = rk.hari.halaman.find((p) => p.kunci === "rekap");
assert.ok(rekap?.kunci === "rekap" && rekap.hari.length === 3 && rekap.hari.every((d) => / dari /.test(d.ket ?? "")), JSON.stringify(rekap));
for (const p of rk.hari.halaman) if (p.kunci === "puas") assert.ok(p.segmen.every((g) => /orang$/.test(g.ket)));
// Halaman tanpa data absen dengan alasan, bukan hilang diam-diam.
assert.ok(rk.ada.length + rk.absen.length >= 8, JSON.stringify([rk.ada, rk.absen]));
// Sembunyi berlaku juga di Seluruh acara.
assert.ok(!susunRingkasan(b, { ...SETELAN_KOSONG, sembunyi: ["rekap"] }, huruf).hari.halaman.some((p) => p.kunci === "rekap"));
// Kunci "semua" dibaca dari config, tanggal ngawur tetap dibuang.
assert.deepEqual(Object.keys(bacaHarian({ semua: {}, "2026-13-45": {}, "2026-11-06": {} })), ["2026-11-06", RINGKASAN]);

// Hadir unik per hari memakai id bila ada, bukan jumlah terbesar.
const dobel = bahanContoh();
dobel.sesi = [
  { kunci: "a", nama: "Pagi", tanggal: "2026-11-06", jam: "08:00", diharapkan: 200, sudah: 2, datang: ["2026-11-06T01:00:00Z", "2026-11-06T01:01:00Z"], orang: ["p1", "p2"] },
  { kunci: "b", nama: "Malam", tanggal: "2026-11-06", jam: "19:00", diharapkan: 200, sudah: 2, datang: ["2026-11-06T12:00:00Z", "2026-11-06T12:01:00Z"], orang: ["p2", "p3"] },
];
const hd = susunHari(dobel, "2026-11-06", SETELAN_KOSONG, huruf);
assert.ok(hd.hari.halaman[0].kunci === "sampul" && hd.hari.halaman[0].judul.startsWith("3 peserta"));
// Sedikit kedatangan: jam dan menit absen dengan alasan; satu hari saja: "hari ini" / tanpa rekap.
assert.deepEqual(hd.absen.map((a) => a.kunci), ["jam", "menit"]);
assert.ok(hd.hari.halaman[0].kunci === "sampul" && hd.hari.halaman[0].judul.endsWith("hari ini."));

// Sembunyi: halaman hilang, sampul tidak bisa disembunyikan.
const semH = susunHari(b, "2026-11-06", { ...SETELAN_KOSONG, sembunyi: ["sampul", "menit"] }, huruf);
const sem = semH.hari;
assert.deepEqual(sem.halaman.map((p) => p.kunci), ["sampul", "hadir", "jam", "agenda", "penutup"]);
// Yang disembunyikan tetap terdaftar sebagai ada, supaya sakelarnya bisa dinyalakan lagi.
assert.ok(semH.ada.includes("menit"));

// Foto panitia: sampul, jam, penutup; tanpa foto sampul memakai foto hero.
const foto = susunHari(b, "2026-11-06", { ...SETELAN_KOSONG, foto: ["https://x/a.jpg", "https://x/b.jpg"] }, huruf).hari;
const tengah = susunHari(b, "2026-11-06", { ...SETELAN_KOSONG, foto: ["", "", "https://x/c.jpg"] }, huruf).hari;
assert.equal(tengah.halaman[0].foto, b.acara.tema.foto);
assert.equal(tengah.halaman.at(-1)!.foto, "https://x/c.jpg");
assert.equal(foto.halaman[0].foto, "https://x/a.jpg");
assert.equal(foto.halaman.find((p) => p.kunci === "jam")!.foto, "https://x/b.jpg");
assert.equal(foto.halaman.at(-1)!.foto, null);

// Bahasa Inggris.
const en = susunHari(bahanContoh({ acara: { ...b.acara, bahasa: "en" } }), "2026-11-06", SETELAN_KOSONG, huruf).hari;
assert.equal(en.halaman[1].kunci === "hadir" && en.halaman[1].judul, "9 in 10 guests came today.");

// Config: tanggal tidak sah dibuang, batas 14 hari, kunci halaman dan foto disaring.
const c = bacaHarian({ "bukan": {}, "2026-11-06": { sembunyi: ["menit", "x", "menit"], catatan: "  a   b ", foto: ["u1", 3, "u2", "u3", "u4"] } });
assert.deepEqual(Object.keys(c), ["2026-11-06"]);
assert.deepEqual(c["2026-11-06"], { sembunyi: ["menit"], catatan: "a b", foto: ["u1", "", "u2"], kunci: null });
assert.deepEqual(bacaSetelanHari({ foto: ["", "u", ""] }).foto, ["", "u"]);
const banyak = bacaHarian(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`2026-12-${String(i + 1).padStart(2, "0")}`, {}])));
assert.equal(Object.keys(banyak).length, 14);
assert.deepEqual(bacaSetelanHari({ foto: ["https://bad/x.jpg"] }, () => false).foto, []);
assert.equal(bacaSetelanHari({ kunci: { at: "x", hari: { tanggal: "2026-11-06", halaman: [] } } }).kunci?.at, "x");
assert.equal(bacaSetelanHari({ kunci: { at: 1 } }).kunci, null);

// Warna: semua permukaan terbaca (teks utama >= 4,5:1) untuk merek gelap, terang, dan tanpa warna.
for (const merek of ["#1F5FAD", "#FFD400", "#777777", "#0B182D", "#E11D48"]) {
  const t = bahanContoh({ acara: { ...b.acara, tema: (await import("../warna.ts")).temaDariWarna(merek) } }).acara.tema;
  for (const p of ["gelap", "aksen", "kertas", "putih", "muda"] as const) {
    if (p === "aksen" && kontras(t.aksen, t.aksenTeks) < 4.5) continue;
    const w = warnaHalaman(t, p);
    assert.ok(kontras(w.teks, w.bg) >= 4.5, `${merek} ${p} ${w.teks} on ${w.bg}`);
    if (p !== "putih" && p !== "muda") assert.ok(kontras(w.angka, w.bg) >= 3, `${merek} ${p} angka ${w.angka} on ${w.bg}`);
    // Teks redup juga >= 4,5:1 di tiap permukaan (QA #444 M3), batang puncak >= 3:1.
    assert.ok(kontras(w.teks2, w.bg) >= 4.5, `${merek} ${p} teks2 ${w.teks2} on ${w.bg}`);
    assert.ok(kontras(w.isi, w.bg) >= 3 || w.isi === w.teks, `${merek} ${p} isi ${w.isi} on ${w.bg}`);
  }
}
for (const merek of ["#0E7C66", "#F97316", "#FFFFFF", "#F9C6D3", "#FFE14D"]) {
  const t = (await import("../warna.ts")).temaDariWarna(merek);
  for (const p of ["gelap", "aksen", "kertas", "putih", "muda"] as const) {
    if (p === "aksen" && kontras(t.aksen, t.aksenTeks) < 4.5) continue;
    const w = warnaHalaman(t, p);
    assert.ok(kontras(w.teks2, w.bg) >= 4.5, `${merek} ${p} teks2 ${w.teks2} on ${w.bg}`);
    assert.ok(kontras(w.isi, w.bg) >= 3, `${merek} ${p} isi ${w.isi} on ${w.bg}`);
  }
}
assert.match(warnaMuda("#E9C46A"), /^#[0-9A-F]{6}$/);
assert.equal(warnaMuda("#808080"), "#DCEBFA");

// QA #444 M1: jam tersibuk dari pindaian pertama tiap orang di SEMUA titik hari itu.
const T = (jamMenit: string) => `2026-11-06T${jamMenit}:00Z`;
const banyakTitik = bahanContoh();
const pagi = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, at: T(`01:${String(i % 60).padStart(2, "0")}`) }));
const kecil = Array.from({ length: 31 }, (_, i) => ({ id: `q${i}`, at: T(`05:${String(i).padStart(2, "0")}`) }));
banyakTitik.sesi = [
  // Titik terbesar (Lari) datang tersebar; titik lain (Registrasi) jam 01 UTC berisi 40 orang berbeda.
  { kunci: "a", nama: "Registrasi", tanggal: "2026-11-06", jam: "08:00", diharapkan: 100, sudah: 40, datang: pagi.map((x) => x.at), orang: pagi.map((x) => x.id) },
  { kunci: "b", nama: "Lari", tanggal: "2026-11-06", jam: "12:00", diharapkan: 100, sudah: 31, datang: kecil.map((x) => x.at), orang: kecil.map((x) => x.id) },
];
const bt = susunHari(banyakTitik, "2026-11-06", SETELAN_KOSONG, huruf).hari.halaman.find((p) => p.kunci === "jam");
assert.ok(bt && bt.kunci === "jam" && bt.judul === `Pukul ${String(1 + 7).padStart(2, "0")}.00 paling ramai.`, bt?.judul);
assert.ok(bt.kunci === "jam" && bt.teks.startsWith("40 orang tiba antara 08.00 dan 09.00, 56%"), bt.teks);
// Orang yang sama di dua titik dihitung sekali, di pindaian pertamanya.
assert.equal(kedatanganHari([{ ...banyakTitik.sesi[0], datang: [T("03:00")], orang: ["z"] }, { ...banyakTitik.sesi[1], datang: [T("02:00")], orang: ["z"] }]).length, 1);
// Lewat tengah malam: garis waktu 22, 23, 00, bukan 00..23 dan bukan "24.00".
const malam = sibukHari([...Array(5).fill(Date.parse("2026-11-05T15:10:00Z")), ...Array(9).fill(Date.parse("2026-11-05T16:10:00Z")), ...Array(3).fill(Date.parse("2026-11-05T17:10:00Z"))], "+07:00");
assert.deepEqual(malam.jam.map((j) => j.jam), [22, 23, 0]);
assert.equal(malam.jamPuncak, 23);

// QA #444 L1: 1.236 dari 1.251 bukan "10 dari 10"; L2: 79,9% bukan "80% ke atas".
const hampir = bahanContoh();
hampir.peserta = Array.from({ length: 1000 }, (_, i) => ({ ...bahanContoh().peserta[0], id: `x${i}` }));
hampir.sesi = [
  { kunci: "a", nama: "A", tanggal: "2026-11-06", jam: "08:00", diharapkan: 1000, sudah: 799, datang: [], orang: Array.from({ length: 990 }, (_, i) => `x${i}`) },
  { kunci: "b", nama: "B", tanggal: "2026-11-06", jam: "10:00", diharapkan: 1000, sudah: 990, datang: [], orang: [] },
];
const hh = susunHari(hampir, "2026-11-06", SETELAN_KOSONG, huruf).hari.halaman;
const hd2 = hh.find((p) => p.kunci === "hadir");
assert.ok(hd2 && hd2.kunci === "hadir" && hd2.isi === 9 && hd2.judul === "Hampir semua peserta datang ke acara.", hd2?.judul);
const ag = hh.find((p) => p.kunci === "agenda");
assert.ok(ag && ag.judul === "2 agenda hari ini, semuanya terisi 75% ke atas.", ag?.judul);

const { tanggalSah } = await import("./config.ts");
assert.ok(tanggalSah("2026-11-06") && !tanggalSah("2026-13-45") && !tanggalSah("2026-02-30"));
assert.deepEqual(Object.keys(bacaHarian({ "2026-13-45": {}, "2026-11-06": {} })), ["2026-11-06"]);
console.log("harian.check ok");

const { fotoLaporanSah } = await import("./foto.ts");
const SB = "https://abc.supabase.co";
assert.ok(fotoLaporanSah(`${SB}/storage/v1/object/public/display-assets/laporan/a-1.jpg`, SB));
assert.ok(!fotoLaporanSah(`${SB}/storage/v1/object/public/display-assets/pengumuman/a.jpg`, SB));
assert.ok(!fotoLaporanSah(`${SB}/storage/v1/object/public/display-assets/laporan/../x.jpg`, SB));
assert.ok(!fotoLaporanSah("https://evil.test/x.jpg", SB));
console.log("foto ok");
