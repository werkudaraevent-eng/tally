import assert from "node:assert/strict";
import { bahanContoh } from "../contoh.ts";
import { bacaHarian, bacaSetelanHari, SETELAN_KOSONG } from "./config.ts";
import { hariAcara, susunHari } from "./hitung.ts";
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

// Hari terakhir: ada rekap, penutup terima kasih.
const h3 = susunHari(b, "2026-11-08", SETELAN_KOSONG, huruf).hari;
assert.ok(h3.halaman.some((p) => p.kunci === "rekap"));
assert.equal(h3.halaman.at(-1)!.judul, "Terima kasih sudah bersama kami.");

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
  }
}
assert.match(warnaMuda("#E9C46A"), /^#[0-9A-F]{6}$/);
assert.equal(warnaMuda("#808080"), "#DCEBFA");
console.log("harian.check ok");

const { fotoLaporanSah } = await import("./foto.ts");
const SB = "https://abc.supabase.co";
assert.ok(fotoLaporanSah(`${SB}/storage/v1/object/public/display-assets/laporan/a-1.jpg`, SB));
assert.ok(!fotoLaporanSah(`${SB}/storage/v1/object/public/display-assets/pengumuman/a.jpg`, SB));
assert.ok(!fotoLaporanSah(`${SB}/storage/v1/object/public/display-assets/laporan/../x.jpg`, SB));
assert.ok(!fotoLaporanSah("https://evil.test/x.jpg", SB));
console.log("foto ok");
