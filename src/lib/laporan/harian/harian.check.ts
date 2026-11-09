import assert from "node:assert/strict";
import { bahanContoh } from "../contoh.ts";
import { bacaHarian, bacaSetelanHari, SETELAN_KOSONG } from "./config.ts";
import { hariAcara, susunHari, susunRingkasan, tanpaSekitar } from "./hitung.ts";
import { RINGKASAN } from "./jenis.ts";
import { warnaHalaman, warnaMuda } from "./warna.ts";
import { kontras } from "../../landing-hitung-mundur.ts";

const huruf = { judul: "Plus Jakarta Sans", isi: "Inter" };
const b = bahanContoh();
assert.deepEqual(hariAcara(b), ["2026-11-06", "2026-11-07", "2026-11-08"]);

// Hari pertama (satu sesi): sampul dengan persen sesi itu, penutup dengan sesi besok.
const h1 = susunHari(b, "2026-11-06", SETELAN_KOSONG, huruf).hari;
assert.deepEqual(h1.halaman.map((p) => p.kunci), ["sampul", "penutup"]);
assert.equal(h1.hariKe, 1);
const sampul = h1.halaman[0];
assert.ok(sampul.kunci === "sampul" && sampul.judul === "90% hadir di Sesi 1." && sampul.teks === "Check-in sesi: 180 dari 200.", JSON.stringify(sampul));
const tutup = h1.halaman.at(-1)!;
assert.ok(tutup.kunci === "penutup" && tutup.judul === "Besok, Sesi 2 mulai 08.00.");
// Hari kedua dibanding kemarin.
const h2 = susunHari(b, "2026-11-07", SETELAN_KOSONG, huruf).hari.halaman[0];
assert.ok(h2.kunci === "sampul" && /^Check-in sesi: [0-9.]+ dari [0-9.]+\. Turun dari 90% kemarin\./.test(h2.teks ?? ""), JSON.stringify(h2));

// Hari terakhir: penutup terima kasih.
const h3 = susunHari(b, "2026-11-08", SETELAN_KOSONG, huruf).hari;
assert.equal(h3.halaman.at(-1)!.judul, "Terima kasih sudah bersama kami.");

// Seluruh acara: kunci RINGKASAN, hari 0, tiap persen ada "x dari y".
const rk = susunRingkasan(b, SETELAN_KOSONG, huruf);
assert.equal(rk.hari.tanggal, RINGKASAN);
assert.equal(rk.hari.hariKe, 0);
assert.equal(rk.hari.halaman[0].kunci, "sampul");
assert.equal(rk.hari.halaman.at(-1)!.kunci, "penutup");
const rSampul = rk.hari.halaman[0];
assert.ok(rSampul.kunci === "sampul" && /^Rata-rata \d+% peserta hadir di tiap sesi\.$/.test(rSampul.judul), JSON.stringify(rSampul));
const rekap = rk.hari.halaman.find((p) => p.kunci === "rekap");
assert.ok(rekap?.kunci === "rekap" && rekap.hari.length === 3 && rekap.hari.every((d) => / dari /.test(d.ket ?? "")), JSON.stringify(rekap));
for (const p of rk.hari.halaman) if (p.kunci === "puas") assert.ok(p.segmen.every((g) => /orang$/.test(g.ket)));
// Semua sesi diurutkan dari tertinggi, dengan garis rata-rata.
const agR = rk.hari.halaman.find((p) => p.kunci === "agenda");
assert.ok(agR?.kunci === "agenda" && agR.baris.map((r) => r.nama).join() === "Sesi 1,Sesi 2,Sesi 3" && typeof agR.rata === "number" && agR.baris.every((r) => / dari /.test(r.ket ?? "")), JSON.stringify(agR));
// Sesi paling sepi: 10 poin atau lebih di bawah rata-rata.
const sepi = rk.hari.halaman.find((p) => p.kunci === "sepi");
assert.ok(sepi?.kunci === "sepi" && sepi.judul === "Sesi 3" && / poin di bawah rata-rata sesi \(\d+%\)\.$/.test(sepi.teks), JSON.stringify(sepi));
// Tanpa id orang: tidak ada rincian kelompok (penyebut tidak bisa dihitung).
assert.ok(sepi?.kunci === "sepi" && sepi.kelompok.length === 0 && rk.absen.some((a) => a.kunci === "kelompok"));
// Belum selesai: hanya yang masih ada selisihnya, sisanya catatan.
const layar = rk.hari.halaman.find((p) => p.kunci === "layar");
assert.ok(layar?.kunci === "layar" && layar.judul === "Dua hal belum selesai." && layar.baris[0].besar === "2" && /^Juga tercatat: /.test(layar.catatan ?? ""), JSON.stringify(layar));
// Penutup: tiga temuan dari halaman yang tampil.
const pen = rk.hari.halaman.at(-1)!;
assert.ok(pen.kunci === "penutup" && pen.judul === "Tiga hal dari acara ini." && pen.poin?.length === 3, JSON.stringify(pen));
const penTanpaSepi = susunRingkasan(b, { ...SETELAN_KOSONG, sembunyi: ["sepi"] }, huruf).hari.halaman.at(-1)!;
assert.ok(penTanpaSepi.kunci === "penutup" && !penTanpaSepi.poin?.some((x) => x.judul.startsWith("Sesi 3")), JSON.stringify(penTanpaSepi));
// Halaman tanpa data absen dengan alasan, bukan hilang diam-diam.
assert.ok(rk.ada.length + rk.absen.length >= 8, JSON.stringify([rk.ada, rk.absen]));
// Sembunyi berlaku juga di Seluruh acara.
assert.ok(!susunRingkasan(b, { ...SETELAN_KOSONG, sembunyi: ["rekap"] }, huruf).hari.halaman.some((p) => p.kunci === "rekap"));
// Kunci "semua" dibaca dari config, tanggal ngawur tetap dibuang.
assert.deepEqual(Object.keys(bacaHarian({ semua: {}, "2026-13-45": {}, "2026-11-06": {} })), ["2026-11-06", RINGKASAN]);

// Dua sesi sehari dengan id orang: hadir unik, sesi diurutkan, kelompok dirinci bila selisih 15 poin.
const grup = bahanContoh();
const ids = grup.peserta.map((p) => p.id);
const divisi = (k: string) => grup.peserta.filter((p) => p.kelompok === k).map((p) => p.id);
grup.sesi = [
  { kunci: "a", nama: "Pagi", tanggal: "2026-11-06", jam: "08:00", diharapkan: 200, sudah: 180, datang: [], orang: ids.slice(0, 180) },
  // Divisi D hampir tidak datang ke Malam.
  { kunci: "b", nama: "Malam", tanggal: "2026-11-06", jam: "19:00", diharapkan: 200, sudah: 0, datang: [], orang: [] },
];
const malam = ids.filter((id) => !divisi("Divisi D").includes(id)).slice(0, 110);
grup.sesi[1] = { ...grup.sesi[1], sudah: malam.length, orang: malam };
const hg = susunHari(grup, "2026-11-06", SETELAN_KOSONG, huruf);
assert.deepEqual(hg.hari.halaman.map((p) => p.kunci), ["sampul", "agenda", "sepi", "penutup"]);
const sG = hg.hari.halaman[0];
assert.ok(sG.kunci === "sampul" && sG.judul === "73% hadir di 2 sesi hari ini.", JSON.stringify(sG));
const agG = hg.hari.halaman[1];
assert.ok(agG.kunci === "agenda" && agG.baris[0].nama === "Pagi" && agG.baris[1].rendah === true && agG.judul === "1 dari 2 sesi di bawah 64%.", JSON.stringify(agG));
const sp = hg.hari.halaman[2];
assert.ok(sp.kunci === "sepi" && sp.kelompok.at(-1)!.label === "Divisi D" && sp.kelompok.at(-1)!.rendah && sp.kelompok.at(-1)!.ket === "0 dari 49", JSON.stringify(sp));
// Kelompok kecil (Tamu, 4 orang) tidak ikut.
assert.ok(sp.kunci === "sepi" && !sp.kelompok.some((k) => k.label === "Tamu"));
// Satu hari saja: "hari ini", tanpa rekap.
const rG = susunRingkasan(grup, SETELAN_KOSONG, huruf);
assert.ok(rG.absen.some((a) => a.kunci === "rekap"));
const kG = rG.hari.halaman.find((p) => p.kunci === "kelompok");
assert.ok(kG?.kunci === "kelompok" && kG.judul === "Divisi D paling jarang hadir: 46%." && kG.baris.length === 4, JSON.stringify(kG));
// Sesi untuk sebagian peserta saja: kelompok tidak dirinci (penyebutnya bukan anggota kelompok).
const sebagian = { ...grup, sesi: grup.sesi.map((s) => ({ ...s, diharapkan: 150 })) };
assert.ok(!susunRingkasan(sebagian, SETELAN_KOSONG, huruf).hari.halaman.some((p) => p.kunci === "kelompok"));
// Lebih dari 12 sesi: 6 teratas dan 6 terbawah.
const banyak15 = { ...grup, sesi: Array.from({ length: 15 }, (_, i) => ({ kunci: `s${i}`, nama: `S${i}`, tanggal: "2026-11-06", jam: `0${i % 10}:00`, diharapkan: 200, sudah: 200 - i * 10, datang: [] })) };
const ag15 = susunRingkasan(banyak15, SETELAN_KOSONG, huruf).hari.halaman.find((p) => p.kunci === "agenda");
assert.ok(ag15?.kunci === "agenda" && ag15.baris.length === 12 && ag15.baris[0].nama === "S0" && ag15.baris.at(-1)!.nama === "S14" && /6 teratas dan 6 terbawah dari 15 sesi/.test(ag15.teks ?? ""), JSON.stringify(ag15?.teks));

// Sembunyi: halaman hilang, sampul tidak bisa disembunyikan; yang disembunyikan tetap terdaftar sebagai ada.
const semH = susunHari(grup, "2026-11-06", { ...SETELAN_KOSONG, sembunyi: ["sampul", "sepi"] }, huruf);
assert.deepEqual(semH.hari.halaman.map((p) => p.kunci), ["sampul", "agenda", "penutup"]);
assert.ok(semH.ada.includes("sepi"));

// Foto panitia: sampul, sesi (4 baris atau kurang), penutup; tanpa foto sampul memakai foto hero.
const foto = susunHari(grup, "2026-11-06", { ...SETELAN_KOSONG, foto: ["https://x/a.jpg", "https://x/b.jpg"] }, huruf).hari;
const tengah = susunHari(b, "2026-11-06", { ...SETELAN_KOSONG, foto: ["", "", "https://x/c.jpg"] }, huruf).hari;
assert.equal(tengah.halaman[0].foto, b.acara.tema.foto);
assert.equal(tengah.halaman.at(-1)!.foto, "https://x/c.jpg");
assert.equal(foto.halaman[0].foto, "https://x/a.jpg");
assert.equal(foto.halaman.find((p) => p.kunci === "agenda")!.foto, "https://x/b.jpg");
assert.equal(foto.halaman.at(-1)!.foto, null);

// Bahasa Inggris.
const en = susunHari(bahanContoh({ acara: { ...b.acara, bahasa: "en" } }), "2026-11-06", SETELAN_KOSONG, huruf).hari;
assert.equal(en.halaman[0].judul, "90% attended Sesi 1.");
const enR = susunRingkasan({ ...grup, acara: { ...grup.acara, bahasa: "en" } }, SETELAN_KOSONG, huruf).hari;
assert.equal(enR.halaman.at(-1)!.judul, "Three things from this event.");

// Config: tanggal tidak sah dibuang, batas 14 hari, kunci halaman dan foto disaring.
const c = bacaHarian({ "bukan": {}, "2026-11-06": { sembunyi: ["menit", "x", "menit"], catatan: "  a   b ", foto: ["u1", 3, "u2", "u3", "u4"] } });
assert.deepEqual(Object.keys(c), ["2026-11-06"]);
assert.deepEqual(c["2026-11-06"], { sembunyi: ["menit"], catatan: "a b", foto: ["u1", "", "u2"], tanpa: [], kunci: null });
// Titik check-in yang dikeluarkan: kunci disaring, unik, dibatasi.
assert.deepEqual(bacaSetelanHari({ tanpa: ["cp-1", "cp-1", "Bad Key", 3, "sesi-2"] }).tanpa, ["cp-1", "sesi-2"]);
assert.equal(bacaSetelanHari({ tanpa: Array.from({ length: 150 }, (_, i) => `cp-${i}`) }).tanpa.length, 100);
// Dikeluarkan: hilang dari agenda hari itu dan dari Seluruh acara, beserta pindaiannya.
{
  const k1 = b.sesi.filter((s) => s.tanggal === "2026-11-06").map((s) => s.kunci);
  const tanpa1 = susunHari(b, "2026-11-06", { ...SETELAN_KOSONG, tanpa: [k1[0]] }, huruf);
  const ag = tanpa1.hari.halaman.find((p) => p.kunci === "agenda");
  const nama0 = b.sesi.find((s) => s.kunci === k1[0])!.nama;
  assert.ok(!ag || (ag.kunci === "agenda" && !ag.baris.some((r) => r.nama === nama0)));
  // Semua titik hari itu dikeluarkan: tidak ada sesi, halaman sesi absen.
  const kosong = susunHari(b, "2026-11-06", { ...SETELAN_KOSONG, tanpa: k1 }, huruf);
  assert.ok(kosong.absen.some((x) => x.kunci === "agenda"));
  const rkT = susunRingkasan(b, { ...SETELAN_KOSONG, tanpa: [k1[0]] }, huruf).hari.halaman.find((p) => p.kunci === "agenda");
  assert.ok(rkT?.kunci === "agenda" && !rkT.baris.some((r) => r.nama === nama0));
  // Each day: hari yang semua titiknya dikeluarkan tidak ikut; semua dikeluarkan = halaman absen.
  const rkH = susunRingkasan(b, { ...SETELAN_KOSONG, tanpa: k1 }, huruf);
  const rekapT = rkH.hari.halaman.find((p) => p.kunci === "rekap");
  assert.ok(rekapT?.kunci === "rekap" && rekapT.hari.length === 2 && !rekapT.hari.some((d) => d.label.startsWith("Hari 1")), JSON.stringify(rekapT));
  const nol = susunRingkasan(b, { ...SETELAN_KOSONG, tanpa: b.sesi.map((s) => s.kunci) }, huruf);
  assert.ok(!nol.hari.halaman.some((p) => p.kunci === "rekap") && nol.absen.some((x) => x.kunci === "rekap"));
  // "Besok, ..." mengikuti titik yang dikeluarkan di hari berikutnya.
  const k2 = b.sesi.filter((s) => s.tanggal === "2026-11-07").sort((x, y) => (x.jam ?? "").localeCompare(y.jam ?? ""));
  assert.deepEqual(tanpaSekitar({ "2026-11-07": { tanpa: ["x"] }, "2026-11-05": { tanpa: ["y"] } }, hariAcara(b), "2026-11-06"), { kemarin: [], besok: ["x"] });
  assert.deepEqual(tanpaSekitar({ "2026-11-07": { tanpa: ["x"] } }, hariAcara(b), "2026-11-08"), { kemarin: ["x"], besok: [] });
  const tb = susunHari(b, "2026-11-06", SETELAN_KOSONG, huruf, { kemarin: [], besok: [k2[0].kunci] }).hari.halaman.at(-1)!;
  assert.ok(tb.kunci === "penutup" && !tb.judul.includes(`${k2[0].nama} mulai`), tb.judul);
}
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

// QA #450 r3 M2: warna peringatan terlihat (>= 3:1, bukan warna tulisan) di permukaan yang memakainya.
for (const merek of ["#1F5FAD", "#FFD400", "#777777", "#0B182D", "#E11D48", "#0E7C66", "#F97316", "#FFFFFF", "#F9C6D3", "#FFE14D", "#C2410C", "#2E7D32"]) {
  const t = (await import("../warna.ts")).temaDariWarna(merek);
  for (const p of ["gelap", "kertas", "putih", "muda"] as const) {
    const w = warnaHalaman(t, p);
    assert.ok(w.awas !== w.teks && kontras(w.awas, w.bg) >= 3, `${merek} ${p} awas ${w.awas} on ${w.bg}`);
  }
}
// QA #450 r3 M1: 4 sesi bernama panjang tidak memakai ukuran lega bila tidak muat.
{
  const { tingkatAgenda } = await import("../../../components/laporan/harian/gaya-halaman.ts");
  const panjang = (nama: string) => ({ nama, ket: "1.162 dari 1.251", persen: 90 });
  const p = { judul: "Kehadiran 4 sesi merata, 86 sampai 91%.", baris: ["Fun Run Pagi bersama Seluruh Peserta Gathering", "Town Hall Direksi dan Kepala Divisi Seluruh Indonesia", "Gala Dinner dan Malam Penghargaan Karyawan Teladan", "Workshop Kepemimpinan untuk Manajer Muda"].map(panjang), teks: "Garis tipis: rata-rata 89%." };
  assert.ok(tingkatAgenda(p) > 0, "4 nama panjang");
  assert.equal(tingkatAgenda({ judul: "1 dari 3 sesi di bawah 70%.", baris: ["A", "B", "C"].map(panjang) }), 0);
}
console.log("harian.check r3 ok");
