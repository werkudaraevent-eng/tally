/**
 * Bagian Hari H: pembatas, peta panas semua titik, satu slide per titik
 * check-in yang tertaut ke Agenda, dan lampiran. Semua dari pindaian pertama
 * tiap orang di tiap titik (SesiBahan.datang), dihitung di zona acara.
 *
 * Satu titik digambar per jam, atau per 15 menit bila hampir semua orang
 * datang dalam 3 jam. Jam tersibuk diperbesar per 15 menit, dan menit
 * tersibuk ditulis sebagai "9 / menit, satu orang tiap 7 detik".
 */
import type { BahanLaporan, SesiBahan } from "../bahan.ts";
import type { BlokAngka, BlokBatang, BlokTabel, Sorot } from "../jenis.ts";
import { potong } from "../ukuran.ts";
import { angka, dari, jam, namaHari, persen, pilih, type Bahasa, type HasilSlide } from "../teks.ts";

const MENIT = 60000;
const LIMA_BELAS = 15 * MENIT;
const JAM = 60 * MENIT;
/** Titik dengan kedatangan sebanyak ini dapat slide sendiri. */
export const MIN_ORANG = 30;
/** Kedatangan dalam rentang ini (tanpa 2% paling awal dan paling akhir) digambar per 15 menit. */
const RENTANG_RAPAT = 3 * JAM;
const MAKS_KOLOM_PANAS = 16;
const MAKS_BARIS_PANAS = 8;

/** Waktu mulai (ms UTC) dari tanggal dan jam Agenda di zona acara. */
export function mulaiSesi(s: Pick<SesiBahan, "tanggal" | "jam">, offset: string): number | null {
  if (!s.tanggal || !s.jam) return null;
  const t = Date.parse(`${s.tanggal}T${s.jam.slice(0, 5)}:00${offset}`);
  return Number.isFinite(t) ? t : null;
}

const geserMs = (offset: string) => {
  const tanda = offset.startsWith("-") ? -1 : 1;
  const [oj, om] = offset.slice(1).split(":").map(Number);
  return tanda * (oj * 60 + om) * MENIT;
};
/** Jam 0..23 di zona acara. */
const jamLokal = (t: number, geser: number) => new Date(t + geser).getUTCHours();
const iso = (t: number) => new Date(t).toISOString();
const dua = (n: number) => String(n).padStart(2, "0");
const labelJam = (h: number, bh: Bahasa) => (bh === "id" ? `${dua(h)}.00` : `${dua(h)}:00`);

/** Ringkasan satu titik: semua angka yang dipakai slide, peta panas dan lampiran. */
export type HitungTitik = {
  s: SesiBahan;
  n: number;
  /** Persen hadir dari yang diharapkan, null bila tidak ada yang diharapkan. */
  pHadir: number | null;
  mulai: number | null;
  telat: number | null;
  pTelat: number | null;
  /** Orang per jam di zona acara (0..23), semua hari digabung. */
  perJam: number[];
  jamPuncak: number;
  /** Persen kedatangan di jam tersibuk. */
  pJamPuncak: number;
  menitPuncak: { t: number; n: number } | null;
  /** Rentang inti (tanpa 2% di tiap ujung), ms UTC. */
  rendah: number;
  tinggi: number;
};

export function hitungTitik(s: SesiBahan, offset: string): HitungTitik {
  const geser = geserMs(offset);
  const waktu = s.datang.map(Date.parse).filter(Number.isFinite).sort((a, c) => a - c);
  const n = waktu.length;
  const perJam = Array.from({ length: 24 }, () => 0);
  const perMenit = new Map<number, number>();
  for (const t of waktu) {
    perJam[jamLokal(t, geser)] += 1;
    const m = Math.floor(t / MENIT);
    perMenit.set(m, (perMenit.get(m) ?? 0) + 1);
  }
  const jamPuncak = perJam.reduce((a, v, i) => (v > perJam[a] ? i : a), 0);
  let menitPuncak: HitungTitik["menitPuncak"] = null;
  for (const [m, v] of perMenit) if (!menitPuncak || v > menitPuncak.n) menitPuncak = { t: m * MENIT, n: v };
  const mulai = mulaiSesi(s, offset);
  const telat = mulai === null ? null : waktu.filter((t) => t >= mulai).length;
  return {
    s,
    n,
    pHadir: s.diharapkan > 0 ? persen(s.sudah, s.diharapkan) : null,
    mulai,
    telat,
    pTelat: telat === null ? null : persen(telat, n),
    perJam,
    jamPuncak,
    pJamPuncak: persen(perJam[jamPuncak], n),
    menitPuncak,
    rendah: n ? waktu[Math.floor(n * 0.02)] : 0,
    tinggi: n ? waktu[Math.max(Math.ceil(n * 0.98) - 1, 0)] : 0,
  };
}

/** Titik yang dapat slide sendiri, urut waktu seperti Agenda. */
export function titikSlide(b: BahanLaporan): HitungTitik[] {
  return b.sesi.filter((s) => s.datang.length >= MIN_ORANG).map((s) => hitungTitik(s, b.acara.offset));
}

export const kunciTitik = (s: Pick<SesiBahan, "kunci">) => `titik.${s.kunci}`;

const hariTitik = (s: SesiBahan, bh: Bahasa) => {
  if (!s.tanggal) return "";
  const [, m, d] = s.tanggal.split("-").map(Number);
  const bulan = new Date(Date.UTC(2000, m - 1, 1)).toLocaleString(bh === "id" ? "id-ID" : "en-GB", { month: "short", timeZone: "UTC" });
  return `${namaHari(s.tanggal, bh)} ${d} ${bulan.replace(".", "")}`;
};

const labelHadir = (h: HitungTitik, bh: Bahasa) => (h.pHadir === null ? angka(h.n, bh) : `${h.pHadir}%`);

/** Satu titik per jam (atau per 15 menit bila rapat), dengan angka samping. */
export function slideTitik(b: BahanLaporan, h: HitungTitik): HasilSlide & { ada: true } {
  const bh = b.acara.bahasa;
  const { s } = h;
  const geser = geserMs(b.acara.offset);
  const nama = potong(s.nama, 50);
  const rapat = h.tinggi - h.rendah <= RENTANG_RAPAT;
  const jamMulai = h.mulai === null ? null : jam(iso(h.mulai), b.acara.offset, bh);
  const hari = hariTitik(s, bh);

  const angkaHadir: BlokAngka["isi"][number] = {
    label: pilih(bh, { id: "Hadir", en: "Attended" }),
    nilai: labelHadir(h, bh),
    ket: h.pHadir === null ? pilih(bh, { id: "orang di-scan", en: "people scanned" }) : dari(s.sudah, s.diharapkan, bh),
  };
  const angkaMenit: BlokAngka["isi"][number] | null =
    h.menitPuncak && h.menitPuncak.n >= 3
      ? {
          label: pilih(bh, { id: "Menit tersibuk", en: "Busiest minute" }),
          nilai: pilih(bh, { id: `${h.menitPuncak.n} / menit`, en: `${h.menitPuncak.n} / min` }),
          ket: pilih(bh, {
            id: `pukul ${jam(iso(h.menitPuncak.t), b.acara.offset, bh)}, satu orang tiap ${Math.round(60 / h.menitPuncak.n)} detik`,
            en: `at ${jam(iso(h.menitPuncak.t), b.acara.offset, bh)}, one person every ${Math.round(60 / h.menitPuncak.n)} seconds`,
          }),
        }
      : null;
  const angkaTelat: BlokAngka["isi"][number] | null =
    h.pTelat !== null && h.telat !== null && jamMulai
      ? {
          label: pilih(bh, { id: "Datang setelah mulai", en: "Arrived after start" }),
          nilai: `${h.pTelat}%`,
          ket: pilih(bh, { id: `${angka(h.telat, bh)} orang setelah ${jamMulai}`, en: `${angka(h.telat, bh)} people after ${jamMulai}` }),
          masalah: h.pTelat >= 20,
        }
      : null;

  let judul: string;
  let stiker: { teks: string; merah?: boolean } | undefined;
  let blok: Array<BlokBatang | BlokAngka>;
  let tata: "penuh" | "dua";
  let kakiSatuan: string;

  if (rapat) {
    // Per 15 menit dari ujung awal sampai ujung akhir; yang di luar masuk ember pertama atau terakhir.
    const awal = Math.floor(h.rendah / LIMA_BELAS) * LIMA_BELAS;
    const jumlahEmber = Math.min(13, Math.floor((h.tinggi - awal) / LIMA_BELAS) + 1);
    const ember = Array.from({ length: jumlahEmber }, (_, i) => ({ dari: awal + i * LIMA_BELAS, n: 0 }));
    let luarAwal = false;
    let luarAkhir = false;
    for (const x of s.datang) {
      const t = Date.parse(x);
      let i = Math.floor((t - awal) / LIMA_BELAS);
      if (i < 0) { i = 0; luarAwal = true; }
      if (i >= jumlahEmber) { i = jumlahEmber - 1; luarAkhir = true; }
      ember[i].n += 1;
    }
    const sebelum = ember.filter((e) => h.mulai === null || e.dari < h.mulai);
    const puncak = (sebelum.length ? sebelum : ember).reduce((a, e) => (e.n > a.n ? e : a));
    const garis = h.mulai === null ? -1 : Math.round((h.mulai - awal) / LIMA_BELAS);
    const seri = ember.map((e, i) => {
      const lbl = jam(iso(e.dari), b.acara.offset, bh);
      const telat = h.mulai !== null && e.dari >= h.mulai;
      const sorot: Sorot = telat && (h.pTelat ?? 0) >= 20 ? "masalah" : e === puncak ? "utama" : null;
      return { label: i === 0 && luarAwal ? `≤${lbl}` : i === jumlahEmber - 1 && luarAkhir ? `≥${lbl}` : lbl, nilai: e.n, teks: e.n ? angka(e.n, bh) : "", sorot };
    });
    const pPuncak = persen(puncak.n, h.n);
    const jamPuncak15 = jam(iso(puncak.dari), b.acara.offset, bh);
    if (h.pTelat !== null && h.pTelat >= 20 && h.telat !== null) {
      judul = pilih(bh, { id: `${angka(h.telat, bh)} orang masuk ${nama} setelah jadwal mulai`, en: `${angka(h.telat, bh)} people entered ${nama} after it started` });
      stiker = { teks: pilih(bh, { id: `${h.pTelat}% telat`, en: `${h.pTelat}% late` }), merah: true };
    } else {
      judul = pilih(bh, { id: `${nama} paling ramai pukul ${jamPuncak15}, ${angka(puncak.n, bh)} orang dalam 15 menit`, en: `${nama} was busiest at ${jamPuncak15}, ${angka(puncak.n, bh)} people in 15 minutes` });
      if (pPuncak >= 25) stiker = { teks: pilih(bh, { id: `${pPuncak}% dalam 15 menit`, en: `${pPuncak}% in 15 minutes` }) };
    }
    blok = [
      {
        jenis: "batang",
        arah: "tegak",
        tinggi: "sedang",
        maks: Math.max(...ember.map((e) => e.n), 1),
        seri,
        ...(garis > 0 && garis < jumlahEmber && jamMulai ? { penanda: { setelah: garis - 1, label: pilih(bh, { id: `Mulai ${jamMulai}`, en: `Starts ${jamMulai}` }) } } : {}),
      },
      {
        jenis: "angka",
        isi: [
          angkaHadir,
          ...(angkaTelat ? [angkaTelat] : []),
          { label: pilih(bh, { id: "15 menit tersibuk", en: "Busiest 15 minutes" }), nilai: jamPuncak15, ket: pilih(bh, { id: `${angka(puncak.n, bh)} orang`, en: `${angka(puncak.n, bh)} people` }) },
          ...(angkaMenit ? [angkaMenit] : []),
        ].slice(0, 4),
      },
    ];
    tata = "penuh";
    kakiSatuan = pilih(bh, { id: "per 15 menit", en: "per 15 minutes" });
  } else {
    // Per jam di zona acara, dari jam inti pertama sampai terakhir; hari-hari digabung.
    const jamAwal = Math.min(jamLokal(h.rendah, geser), h.jamPuncak);
    const jamAkhir = Math.max(jamLokal(h.tinggi, geser), h.jamPuncak);
    const dariJam = jamAwal <= jamAkhir ? jamAwal : 0;
    const sampaiJam = jamAwal <= jamAkhir ? jamAkhir : 23;
    const jamDipakai = Array.from({ length: sampaiJam - dariJam + 1 }, (_, i) => dariJam + i);
    const nilai = jamDipakai.map((j) => h.perJam[j]);
    // Yang di luar rentang masuk jam pertama atau terakhir, supaya totalnya tetap n.
    h.perJam.forEach((v, j) => {
      if (j < dariJam) nilai[0] += v;
      else if (j > sampaiJam) nilai[nilai.length - 1] += v;
    });
    const pendek = jamDipakai.length > 10;
    const seri = jamDipakai.map((j, i) => ({
      label: pendek ? dua(j) : labelJam(j, bh),
      nilai: nilai[i],
      teks: nilai[i] && (!pendek || nilai[i] >= Math.max(...nilai) * 0.2) ? angka(nilai[i], bh) : "",
      sorot: (j === h.jamPuncak ? "utama" : null) as Sorot,
    }));
    const jp = labelJam(h.jamPuncak, bh);
    const jpAkhir = labelJam((h.jamPuncak + 1) % 24, bh);
    if (h.pTelat !== null && h.pTelat >= 20 && h.telat !== null) {
      judul = pilih(bh, { id: `${angka(h.telat, bh)} orang masuk ${nama} setelah jadwal mulai`, en: `${angka(h.telat, bh)} people entered ${nama} after it started` });
      stiker = { teks: pilih(bh, { id: `${h.pTelat}% telat`, en: `${h.pTelat}% late` }), merah: true };
    } else if (h.pJamPuncak >= 35) {
      judul = pilih(bh, { id: `${nama} paling ramai pukul ${jp}, ${angka(h.perJam[h.jamPuncak], bh)} orang dalam satu jam`, en: `${nama} was busiest at ${jp}, ${angka(h.perJam[h.jamPuncak], bh)} people in one hour` });
      stiker = { teks: pilih(bh, { id: `${h.pJamPuncak}% di jam ini`, en: `${h.pJamPuncak}% in this hour` }) };
    } else {
      judul = h.pHadir === null
        ? pilih(bh, { id: `${angka(h.n, bh)} orang di-scan di ${nama}, paling ramai pukul ${jp}`, en: `${angka(h.n, bh)} people scanned at ${nama}, busiest at ${jp}` })
        : pilih(bh, { id: `${nama} terisi ${h.pHadir}%, paling ramai pukul ${jp}`, en: `${nama} reached ${h.pHadir}%, busiest at ${jp}` });
    }
    // Jam tersibuk per 15 menit (menit dalam jam, semua hari digabung).
    const zoom = [0, 0, 0, 0];
    for (const x of s.datang) {
      const t = Date.parse(x);
      if (jamLokal(t, geser) !== h.jamPuncak) continue;
      zoom[Math.min(3, Math.floor(new Date(t + geser).getUTCMinutes() / 15))] += 1;
    }
    const zp = zoom.indexOf(Math.max(...zoom));
    blok = [
      { jenis: "batang", arah: "tegak", maks: Math.max(...nilai, 1), seri },
      { jenis: "angka", tumpuk: true, isi: [angkaHadir, angkaMenit ?? angkaTelat ?? { label: pilih(bh, { id: "Jam tersibuk", en: "Busiest hour" }), nilai: jp, ket: pilih(bh, { id: `${angka(h.perJam[h.jamPuncak], bh)} orang, ${h.pJamPuncak}% dari semua`, en: `${angka(h.perJam[h.jamPuncak], bh)} people, ${h.pJamPuncak}% of all` }) }] },
      {
        jenis: "batang",
        arah: "tegak",
        tinggi: "kecil",
        judul: pilih(bh, { id: `Pukul ${jp} sampai ${jpAkhir}, per 15 menit`, en: `${jp} to ${jpAkhir}, per 15 minutes` }),
        maks: Math.max(...zoom, 1),
        seri: zoom.map((v, i) => ({
          label: jam(iso(Date.UTC(2000, 0, 1, h.jamPuncak, i * 15)), "+00:00", bh),
          nilai: v,
          teks: v ? angka(v, bh) : "",
          sorot: (i === zp ? "utama" : null) as Sorot,
        })),
      },
    ];
    tata = "dua";
    kakiSatuan = pilih(bh, { id: "per jam", en: "per hour" });
  }

  const temuanTelat = h.pTelat !== null && h.pTelat >= 20;
  const temuanJam = !rapat && h.pJamPuncak >= 40;
  const dariJp = labelJam(h.jamPuncak, bh);
  const sampaiJp = labelJam((h.jamPuncak + 1) % 24, bh);
  return {
    ada: true,
    bobot: temuanTelat ? (h.pTelat ?? 0) / 100 : temuanJam ? h.pJamPuncak / 150 : 0,
    temuan: temuanTelat
      ? pilih(bh, { id: `${h.pTelat}% peserta ${nama} datang setelah jadwal mulai.`, en: `${h.pTelat}% of people at ${nama} arrived after it started.` })
      : temuanJam
        ? pilih(bh, { id: `${h.pJamPuncak}% kedatangan ${nama} terjadi antara pukul ${dariJp} dan ${sampaiJp}.`, en: `${h.pJamPuncak}% of ${nama} arrivals came between ${dariJp} and ${sampaiJp}.` })
        : null,
    slide: {
      kunci: kunciTitik(s),
      jenis: "isi",
      saran: judul,
      tata,
      ...(stiker ? { stiker } : {}),
      blok,
      kaki: [
        [potong(s.nama, 60), hari].filter(Boolean).join(", ") + ".",
        pilih(bh, { id: `Orang yang di-scan pertama kali ${kakiSatuan}.`, en: `People scanned for the first time ${kakiSatuan}.` }),
        jamMulai ? pilih(bh, { id: `Jadwal mulai ${jamMulai}.`, en: `Scheduled start ${jamMulai}.` }) : "",
        b.acara.zona ? pilih(bh, { id: `Jam dalam ${b.acara.zona}.`, en: `Times in ${b.acara.zona}.` }) : "",
      ].filter(Boolean).join(" "),
    },
  };
}

/** Pembuka bagian Hari H: satu chip per titik dengan persen hadirnya. */
export function slidePembatas(b: BahanLaporan, titik: HitungTitik[]): HasilSlide {
  const bh = b.acara.bahasa;
  const nama = "Event day divider";
  if (titik.length === 0) return { ada: false, nama, alasan: `No Agenda-linked check-in point with ${MIN_ORANG}+ arrivals` };
  return {
    ada: true,
    bobot: 0,
    temuan: null,
    slide: {
      kunci: "harih",
      jenis: "isi",
      saran: pilih(bh, { id: "Hari H, titik demi titik", en: "Event day, point by point" }),
      tata: "pembatas",
      stiker: { teks: pilih(bh, { id: `${titik.length} titik check-in`, en: `${titik.length} check-in points` }) },
      blok: [{ jenis: "chip", isi: titik.slice(0, 10).map((h) => ({ label: potong(h.s.nama, 28), nilai: labelHadir(h, bh) })) }],
      kaki: pilih(bh, {
        id: `Titik check-in yang tertaut ke Agenda dengan ${MIN_ORANG} orang atau lebih.`,
        en: `Check-in points linked to the Agenda with ${MIN_ORANG} or more people.`,
      }),
    },
  };
}

/** Peta panas: semua titik dalam satu layar, per jam. */
export function slidePanas(b: BahanLaporan, titik: HitungTitik[]): HasilSlide {
  const bh = b.acara.bahasa;
  const nama = "Arrivals by hour, all points";
  if (titik.length < 2) return { ada: false, nama, alasan: "Needs 2 or more Agenda-linked check-in points with 30+ arrivals" };
  // Paling banyak 8 titik (yang paling ramai), tetap urut waktu.
  const terpilih = new Set([...titik].sort((a, c) => c.n - a.n).slice(0, MAKS_BARIS_PANAS));
  const baris = titik.filter((h) => terpilih.has(h));
  const totalJam = Array.from({ length: 24 }, (_, j) => baris.reduce((a, h) => a + h.perJam[j], 0));
  const kolom = totalJam
    .map((v, j) => ({ j, v }))
    .filter((x) => x.v > 0)
    .sort((a, c) => c.v - a.v)
    .slice(0, MAKS_KOLOM_PANAS)
    .map((x) => x.j)
    .sort((a, c) => a - c);
  const maks = Math.max(...baris.flatMap((h) => kolom.map((j) => h.perJam[j])), 1);
  const ambang = Math.max(1, Math.ceil(maks * 0.2));
  let puncak = { h: baris[0], j: kolom[0], v: -1 };
  for (const h of baris) for (const j of kolom) if (h.perJam[j] > puncak.v) puncak = { h, j, v: h.perJam[j] };
  const zona = b.acara.zona ? ` ${b.acara.zona}` : "";
  return {
    ada: true,
    bobot: 0,
    temuan: null,
    slide: {
      kunci: "panas",
      jenis: "isi",
      saran: pilih(bh, {
        id: `Jam paling sibuk di Hari H pukul ${labelJam(puncak.j, bh)} di ${potong(puncak.h.s.nama, 40)}, ${angka(puncak.v, bh)} orang`,
        en: `The busiest hour was ${labelJam(puncak.j, bh)} at ${potong(puncak.h.s.nama, 40)}, ${angka(puncak.v, bh)} people`,
      }),
      tata: "penuh",
      blok: [
        {
          jenis: "panas",
          kolom: kolom.map(dua),
          baris: baris.map((h) => ({ label: potong(h.s.nama, 30), sub: hariTitik(h.s, bh), nilai: kolom.map((j) => h.perJam[j]), total: labelHadir(h, bh), ket: h.pHadir === null ? "" : dari(h.s.sudah, h.s.diharapkan, bh) })),
          maks,
          ambang,
          labelTotal: pilih(bh, { id: "Hadir", en: "Attended" }),
          keterangan: pilih(bh, {
            id: `Angka di sel = orang yang di-scan pertama kali di jam itu. Sel tanpa angka di bawah ${angka(ambang, bh)} orang.`,
            en: `Cell figure = people scanned for the first time in that hour. Cells without a figure are under ${angka(ambang, bh)} people.`,
          }),
        },
      ],
      kaki: [
        pilih(bh, { id: "Satu orang dihitung sekali per titik.", en: "Each person counts once per point." }),
        titik.length > baris.length ? pilih(bh, { id: `${baris.length} titik paling ramai dari ${titik.length}.`, en: `The ${baris.length} busiest of ${titik.length} points.` }) : "",
        zona ? pilih(bh, { id: `Jam dalam${zona}.`, en: `Times in${zona}.` }) : "",
      ].filter(Boolean).join(" "),
    },
  };
}

/** Lampiran: satu baris per titik Agenda, untuk panitia dan vendor. */
export function slideLampiran(b: BahanLaporan): HasilSlide {
  const bh = b.acara.bahasa;
  const nama = "Appendix, all check-in points";
  const titik = b.sesi.filter((s) => s.datang.length > 0).map((s) => hitungTitik(s, b.acara.offset));
  if (titik.length === 0) return { ada: false, nama, alasan: "No Agenda-linked check-in point has arrivals yet" };
  const adaMulai = titik.some((h) => h.pTelat !== null);
  const kolom: BlokTabel["kolom"] = [
    { label: pilih(bh, { id: "Titik", en: "Point" }) },
    { label: pilih(bh, { id: "Hari", en: "Day" }) },
    { label: pilih(bh, { id: "Hadir", en: "Attended" }), kanan: true },
    { label: "%", kanan: true },
    { label: pilih(bh, { id: "Jam tersibuk", en: "Busiest hour" }), kanan: true },
    { label: pilih(bh, { id: "Per menit", en: "Per minute" }), kanan: true },
    ...(adaMulai ? [{ label: pilih(bh, { id: "Setelah mulai", en: "After start" }), kanan: true }] : []),
  ];
  const tampil = titik.slice(0, 12);
  return {
    ada: true,
    bobot: 0,
    temuan: null,
    slide: {
      kunci: "lampiran",
      jenis: "isi",
      saran: pilih(bh, { id: "Lampiran, kedatangan di semua titik check-in", en: "Appendix, arrivals at every check-in point" }),
      tata: "penuh",
      blok: [
        {
          jenis: "tabel",
          kolom,
          baris: tampil.map((h) => ({
            sel: [
              potong(h.s.nama, 60),
              hariTitik(h.s, bh),
              h.pHadir === null ? angka(h.n, bh) : dari(h.s.sudah, h.s.diharapkan, bh),
              h.pHadir === null ? "" : `${h.pHadir}%`,
              `${labelJam(h.jamPuncak, bh)} (${angka(h.perJam[h.jamPuncak], bh)})`,
              h.menitPuncak ? angka(h.menitPuncak.n, bh) : "",
              ...(adaMulai ? [h.pTelat === null ? "" : `${h.pTelat}%`] : []),
            ],
            sorot: (h.pTelat ?? 0) >= 20 ? ("masalah" as const) : null,
          })),
        },
      ],
      kaki: [
        pilih(bh, { id: "Per menit = orang di menit tersibuk. Rincian per orang ada di Check-in.", en: "Per minute = people in the busiest minute. Per-person detail is in Check-in." }),
        titik.length > tampil.length ? pilih(bh, { id: `${tampil.length} dari ${titik.length} titik.`, en: `${tampil.length} of ${titik.length} points.` }) : "",
      ].filter(Boolean).join(" "),
    },
  };
}
