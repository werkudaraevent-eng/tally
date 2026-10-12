import assert from "node:assert/strict";
import { FOTO_PALING_GELAP, FOTO_PALING_TERANG, jedaBerikutnya, keadaanHitungMundur, kontras, LATAR_PAPAN, pecahSisa, sisaHariKalender, warnaHitungMundur, TINTA, type JadwalHitungMundur } from "./landing-hitung-mundur.ts";

// KSO: 6-8 November 2026, mulai 08.00 WIB.
const kso: JadwalHitungMundur = { event_date: "2026-11-06", end_date: "2026-11-08", start_time: "08:00:00", end_time: "17:00:00", time_zone: "Asia/Jakarta" };
const t = (iso: string) => Date.parse(iso);

// Menuju: 12 Oktober 09.05 WIB -> 24 hari 22 jam 55 menit.
assert.deepEqual(keadaanHitungMundur(kso, t("2026-10-12T09:05:00+07:00")), { fase: "menuju", hari: 24, jam: 22, menit: 55 });
// Menit dibulatkan ke atas: 30 detik sebelum mulai masih "1 menit", bukan nol.
assert.deepEqual(keadaanHitungMundur(kso, t("2026-11-06T07:59:30+07:00")), { fase: "menuju", hari: 0, jam: 0, menit: 1 });
// Tepat mulai: berlangsung, hari ke-1 dari 3.
assert.deepEqual(keadaanHitungMundur(kso, t("2026-11-06T08:00:00+07:00")), { fase: "berlangsung", hariKe: 1, lama: 3 });
// Malam hari kedua tetap berlangsung, hari ke-2.
assert.deepEqual(keadaanHitungMundur(kso, t("2026-11-07T23:30:00+07:00")), { fase: "berlangsung", hariKe: 2, lama: 3 });
// Jam selesai di hari terakhir menutup acara.
assert.deepEqual(keadaanHitungMundur(kso, t("2026-11-08T17:00:00+07:00")), { fase: "selesai" });

// Zona acara dipakai, bukan zona server: 08.00 WITA = 07.00 WIB.
const bali: JadwalHitungMundur = { ...kso, time_zone: "Asia/Makassar" };
assert.deepEqual(keadaanHitungMundur(bali, t("2026-11-06T06:59:00+07:00")), { fase: "menuju", hari: 0, jam: 0, menit: 1 });
assert.equal(keadaanHitungMundur(bali, t("2026-11-06T07:00:00+07:00"))?.fase, "berlangsung");

// Tanpa jam: mulai 00.00, selesai di ujung hari terakhir.
const polos: JadwalHitungMundur = { event_date: "2026-10-15", end_date: null, start_time: null, end_time: null, time_zone: "Asia/Jakarta" };
assert.deepEqual(keadaanHitungMundur(polos, t("2026-10-14T23:00:00+07:00")), { fase: "menuju", hari: 0, jam: 1, menit: 0 });
assert.deepEqual(keadaanHitungMundur(polos, t("2026-10-15T23:59:00+07:00")), { fase: "berlangsung", hariKe: 1, lama: 1 });
assert.deepEqual(keadaanHitungMundur(polos, t("2026-10-16T00:00:00+07:00")), { fase: "selesai" });

// Jam selesai lebih awal dari jam mulai di acara sehari tidak membuatnya selesai sebelum mulai.
const rusak: JadwalHitungMundur = { ...polos, start_time: "19:00", end_time: "02:00" };
assert.equal(keadaanHitungMundur(rusak, t("2026-10-15T19:00:30+07:00"))?.fase, "berlangsung");

// Tanggal akhir sebelum tanggal mulai diabaikan.
assert.deepEqual(keadaanHitungMundur({ ...polos, end_date: "2026-10-01" }, t("2026-10-15T12:00:00+07:00")), { fase: "berlangsung", hariKe: 1, lama: 1 });

// Tanpa tanggal atau tanggal rusak: tidak ada blok.
assert.equal(keadaanHitungMundur({ ...polos, event_date: null }, Date.now()), null);
assert.equal(keadaanHitungMundur({ ...polos, event_date: "15-10-2026" }, Date.now()), null);

// Jeda ke pergantian menit berikutnya.
assert.equal(jedaBerikutnya(kso, t("2026-10-12T09:05:00+07:00")), 60_000);
assert.equal(jedaBerikutnya(kso, t("2026-10-12T09:05:45+07:00")), 15_000);
assert.equal(jedaBerikutnya(kso, t("2026-10-12T09:05:59.500+07:00")), 1_000);

// Pecah sisa: dengan detik membulatkan detik, tanpa detik membulatkan menit.
assert.deepEqual(pecahSisa(90_061_500, true), { hari: 1, jam: 1, menit: 1, detik: 2 });
assert.deepEqual(pecahSisa(90_061_500, false), { hari: 1, jam: 1, menit: 2, detik: 0 });
assert.deepEqual(pecahSisa(-5, true), { hari: 0, jam: 0, menit: 0, detik: 0 });

// Warna. Merek navy, aksen emas KSO.
const tema = { brand: "#1B2D57", accent: "#E9C46A" };
// Otomatis di Merek gelap: aksen emas; tanpa aksen (Modern) navy tidak lolos, jadi putih, tanpa peringatan.
assert.equal(warnaHitungMundur({}, tema).sorot, "#E9C46A");
assert.equal(warnaHitungMundur({}, tema).sorotDiganti, false);
assert.equal(warnaHitungMundur({}, { brand: "#1B2D57", accent: null }).sorot, "#FFFFFF");
assert.equal(warnaHitungMundur({}, { brand: "#1B2D57", accent: null }).sorotDiganti, false);
// Merek dipilih sendiri di Merek gelap: diganti putih, dengan peringatan.
assert.equal(warnaHitungMundur({ highlight: "brand" }, tema).sorotDiganti, true);
// Aksen emas di Merek gelap lolos.
assert.equal(warnaHitungMundur({ highlight: "accent" }, tema).sorot, "#E9C46A");
// Latar terang Otomatis: emas di putih tidak lolos, merek lolos.
assert.equal(warnaHitungMundur({ tone: "light" }, tema).sorot, "#1B2D57");
assert.equal(warnaHitungMundur({ tone: "light", highlight: "accent" }, tema).sorot, TINTA);
assert.equal(warnaHitungMundur({ tone: "light", highlight: "accent" }, tema).sorotDiganti, true);
// Latar sendiri: teks dipilih otomatis.
assert.equal(warnaHitungMundur({ bg_color: "#FFE8A3" }, tema).teks, TINTA);
assert.equal(warnaHitungMundur({ bg_color: "#7A1F2B" }, tema).teks, "#FFFFFF");
// Heksa rusak diabaikan, tidak membuat halaman gagal.
assert.equal(warnaHitungMundur({ bg_color: "merah", highlight: "#zzz" as `#${string}` }, tema).latar, null);
// Tinta tidak pernah dilaporkan sebagai "diganti".
assert.equal(warnaHitungMundur({ highlight: "ink" }, tema).sorotDiganti, false);
// Aturan kontras: putih di atas hitam 21:1.
assert.equal(Math.round(kontras("#FFFFFF", "#000000")), 21);

// Kartu tiket putih (QA H1): sorotnya diukur terhadap putih, bukan latar blok.
// Modern tanpa aksen di Merek gelap: sorot blok putih, di tiket merek navy.
const modern = { brand: "#1B2D57", accent: null };
assert.equal(warnaHitungMundur({}, modern).sorotPutih, "#1B2D57");
// KSO Otomatis: emas tidak terbaca di putih, jadi navy, tanpa peringatan.
assert.equal(warnaHitungMundur({}, tema).sorotPutih, "#1B2D57");
assert.equal(warnaHitungMundur({}, tema).putihDiganti, false);
// Aksen emas dipilih sendiri: di tiket jadi tinta, dengan peringatan.
assert.equal(warnaHitungMundur({ highlight: "accent" }, tema).sorotPutih, TINTA);
assert.equal(warnaHitungMundur({ highlight: "accent" }, tema).putihDiganti, true);
// Setiap kombinasi: sorot tiket selalu >= 3:1 di putih.
for (const highlight of [undefined, "brand", "accent", "ink", "#F5C451", "#E10600", "#FFFFFF"] as const) {
  for (const t2 of [tema, modern, { brand: "#D7141A", accent: null }, { brand: "#0B0B0B", accent: null }, { brand: "#000000", accent: null }, { brand: "#0B0B0B", accent: "#111111" }]) {
    for (const tone of ["light", "panel", "dark"] as const) {
      const w = warnaHitungMundur({ tone, highlight }, t2);
      assert.ok(kontras(w.sorotPutih, "#FFFFFF") >= 3, `tiket ${highlight} ${t2.brand} ${tone}`);
      // Teks kecil (QA M3): label dan tanggal papan >= 4,5:1.
      assert.ok(kontras(w.sorotPapan, LATAR_PAPAN) >= 4.5, `papan ${highlight} ${t2.brand}`);
      assert.ok(w.sorotKecil === w.sorot || w.sorotKecil === w.teks, "sorot kecil");
    }
    // Foto (QA H2): diukur terhadap bagian lapisan paling terang, teks putih.
    const f = warnaHitungMundur({ highlight }, t2, true);
    assert.equal(f.teks, "#FFFFFF");
    for (const ujung of [FOTO_PALING_TERANG, FOTO_PALING_GELAP]) {
      assert.ok(kontras(f.sorot, ujung) >= 3, `foto ${highlight} ${t2.brand} ${ujung}`);
      assert.ok(kontras(f.sorotKecil, ujung) >= 4.5, `foto kecil ${highlight} ${t2.brand} ${ujung}`);
    }
  }
}
// Merah merek di foto, Otomatis: tidak terbaca, jadi putih (dulu tetap merah, 2,33:1).
assert.equal(warnaHitungMundur({}, { brand: "#D7141A", accent: null }, true).sorot, "#FFFFFF");
// Merek hitam di foto (QA R2-H1): lolos di ujung terang, hilang di ujung gelap, jadi putih.
assert.equal(warnaHitungMundur({}, { brand: "#0B0B0B", accent: null }, true).sorot, "#FFFFFF");
assert.equal(warnaHitungMundur({ highlight: "brand" }, { brand: "#000000", accent: null }, true).sorotDiganti, true);
// Lapisan foto terang pun masih memberi teks putih 4,5:1.
assert.ok(kontras("#FFFFFF", FOTO_PALING_TERANG) >= 4.5);
// Merah sendiri di navy gelap: 3,69:1 cukup untuk angka, tidak untuk label kecil.
const merah = warnaHitungMundur({ highlight: "#E10600", bg_color: "#101A33" }, tema);
assert.equal(merah.sorot, "#E10600");
assert.equal(merah.sorotKecil, "#FFFFFF");

// Hari menurut kalender di zona acara (QA M1). Acara KSO 6 Nov 08.00 WIB.
assert.equal(sisaHariKalender(kso, t("2026-11-05T10:00:00+07:00")), 1); // besok, walau < 24 jam
assert.equal(sisaHariKalender(kso, t("2026-11-04T20:00:00+07:00")), 2);
assert.equal(sisaHariKalender(kso, t("2026-11-06T07:00:00+07:00")), 0);
// 23.30 WIB 5 Nov = 00.30 WITA 6 Nov: untuk acara di Makassar sudah hari H.
assert.equal(sisaHariKalender(bali, t("2026-11-05T23:30:00+07:00")), 0);
assert.equal(sisaHariKalender(kso, t("2026-11-05T23:30:00+07:00")), 1);

console.log("landing-hitung-mundur ok");
