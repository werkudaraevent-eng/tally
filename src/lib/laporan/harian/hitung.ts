/**
 * Menyusun highlight satu hari dari bahan Event report yang sama dengan deck
 * (bahan-server.ts), disaring ke sesi Agenda di tanggal itu. Fungsi murni.
 *
 * Halaman tanpa data hilang sendiri (mis. "jam" bila tidak ada titik dengan
 * 30 kedatangan), dengan alasannya untuk panitia.
 */
import type { BahanLaporan, SesiBahan } from "../bahan.ts";
import { aksenTerbaca } from "../warna.ts";
import { skorNps } from "../../kilas-balik/setelan.ts";
import { nilaiNps } from "../slide/kepuasan.ts";
import { MIN_ORANG } from "../slide/titik.ts";
import { angka, dari, jam, namaHari, persen, pilih, rentang, SAMPEL_KECIL, tanggal as teksTanggal, type Bahasa } from "../teks.ts";
import type { SetelanHari } from "./config.ts";
import { RINGKASAN, type HalamanAbsen, type HalamanHarian, type HariHighlight, type KunciHalaman } from "./jenis.ts";

/** Tanggal acara yang punya sesi Agenda, urut. */
export const hariAcara = (b: BahanLaporan) => [...new Set(b.sesi.map((s) => s.tanggal).filter((t): t is string => !!t))].sort();

const jamAgenda = (s: SesiBahan, bh: Bahasa) => (s.jam ? (bh === "id" ? s.jam.slice(0, 5).replace(":", ".") : s.jam.slice(0, 5)) : "");
const labelJam = (h: number, bh: Bahasa) => `${String(h).padStart(2, "0")}${bh === "id" ? "." : ":"}00`;


/** Peserta unik yang dipindai di sesi-sesi ini (sesi lama tanpa id: jumlah terbesar). */
function unik(sesi: SesiBahan[]): number {
  if (sesi.every((s) => s.orang)) return new Set(sesi.flatMap((s) => s.orang!)).size;
  return Math.max(0, ...sesi.map((s) => s.sudah));
}

const MENIT = 60000;
const JAM = 60 * MENIT;
/** Menit tersibuk di bawah ini tidak cukup kuat untuk satu halaman. */
const MIN_MENIT = 5;

/**
 * Pindaian pertama tiap orang di hari itu, di titik mana pun (ms UTC, urut).
 * Sesi lama tanpa id orang: semua pindaian digabung.
 */
export function kedatanganHari(sesi: SesiBahan[]): number[] {
  const pertama = new Map<string, number>();
  const tanpaId: number[] = [];
  for (const s of sesi) {
    s.datang.forEach((at, i) => {
      const t = Date.parse(at);
      if (!Number.isFinite(t)) return;
      const id = s.orang?.[i];
      if (!id) { tanpaId.push(t); return; }
      const lama = pertama.get(id);
      if (lama === undefined || t < lama) pertama.set(id, t);
    });
  }
  return [...pertama.values(), ...tanpaId].sort((a, c) => a - c);
}

const geserMs = (offset: string) => {
  const tanda = offset.startsWith("-") ? -1 : 1;
  const [oj, om] = offset.slice(1).split(":").map(Number);
  return tanda * ((oj || 0) * 60 + (om || 0)) * MENIT;
};

/**
 * Jam dan menit tersibuk satu hari. Jam dihitung sebagai garis waktu (jam
 * absolut), jadi kedatangan yang melewati tengah malam tetap berurutan:
 * 22, 23, 00, 01, bukan 00..23 yang dilipat.
 */
export function sibukHari(waktu: number[], offset: string) {
  const geser = geserMs(offset);
  const perJam = new Map<number, number>();
  const perMenit = new Map<number, number>();
  for (const t of waktu) {
    const j = Math.floor((t + geser) / JAM);
    perJam.set(j, (perJam.get(j) ?? 0) + 1);
    const m = Math.floor(t / MENIT);
    perMenit.set(m, (perMenit.get(m) ?? 0) + 1);
  }
  const jamAda = [...perJam.keys()].sort((a, c) => a - c);
  let puncak = jamAda[0];
  for (const j of jamAda) if ((perJam.get(j) ?? 0) > (perJam.get(puncak) ?? 0)) puncak = j;
  let menit: { t: number; n: number } | null = null;
  for (const [m, n] of [...perMenit].sort(([a], [c]) => a - c)) if (!menit || n > menit.n) menit = { t: m * MENIT, n };
  // Paling banyak 8 jam di sekitar puncak, di dalam rentang yang ada datanya.
  const awal = jamAda[0];
  const akhir = jamAda[jamAda.length - 1];
  const sampai = Math.min(akhir, Math.max(puncak, Math.max(awal, puncak - 4) + 7));
  const dari = Math.max(awal, sampai - 7);
  const jam = Array.from({ length: sampai - dari + 1 }, (_, i) => ({ jam: (((dari + i) % 24) + 24) % 24, n: perJam.get(dari + i) ?? 0, puncak: dari + i === puncak }));
  return { n: waktu.length, jam, jamPuncak: ((puncak % 24) + 24) % 24, nPuncak: perJam.get(puncak) ?? 0, menit };
}

/** `ada` = halaman yang punya data hari itu, termasuk yang disembunyikan panitia. */
export function susunHari(b: BahanLaporan, tgl: string, setelan: SetelanHari, huruf: HariHighlight["huruf"]): { hari: HariHighlight; absen: HalamanAbsen[]; ada: KunciHalaman[] } {
  const bh = b.acara.bahasa;
  const semua = hariAcara(b);
  const ke = semua.indexOf(tgl) + 1;
  const total = semua.length;
  const sesi = b.sesi.filter((s) => s.tanggal === tgl).sort((x, y) => (x.jam ?? "").localeCompare(y.jam ?? ""));
  const besok = semua[semua.indexOf(tgl) + 1];
  const sesiBesok = besok ? b.sesi.filter((s) => s.tanggal === besok).sort((x, y) => (x.jam ?? "").localeCompare(y.jam ?? ""))[0] : undefined;
  const peserta = b.peserta.length;
  const datang = unik(sesi);
  const [f0, f1, f2] = setelan.foto;
  const aksen = aksenTerbaca(b.acara.tema) ? "aksen" : "kertas";
  const halaman: HalamanHarian[] = [];
  const absen: HalamanAbsen[] = [];
  const urutan = { id: ["pertama", "kedua", "ketiga", "keempat", "kelima"], en: ["first", "second", "third", "fourth", "fifth"] };
  const hariKe = total <= 1
    ? pilih(bh, { id: "hari ini", en: "today" })
    : pilih(bh, { id: `hari ${urutan.id[ke - 1] ?? `ke-${ke}`}`, en: `the ${urutan.en[ke - 1] ?? `${ke}th`} day` });

  halaman.push({
    kunci: "sampul", permukaan: "foto", foto: f0 || b.acara.tema.foto,
    kecil: `${total > 1 ? pilih(bh, { id: `Hari ${ke}, `, en: `Day ${ke}, ` }) : ""}${namaHari(tgl, bh)} ${teksTanggal(tgl, bh)}`,
    judul: pilih(bh, { id: `${angka(datang, bh)} peserta datang di ${hariKe}.`, en: `${angka(datang, bh)} guests came on ${hariKe}.` }),
  });

  if (peserta > 0 && datang > 0) {
    // Dibulatkan ke bawah: 1.236 dari 1.251 bukan "10 dari 10". Semua datang baru 10.
    const isi = datang >= peserta ? 10 : Math.min(9, Math.max(1, Math.floor((datang / peserta) * 10)));
    const hampir = datang < peserta && datang / peserta >= 0.95;
    const kapan = { id: total > 1 ? "hari ini" : "ke acara", en: total > 1 ? "today" : "to the event" };
    halaman.push({
      kunci: "hadir", permukaan: aksen, foto: null, isi,
      judul: datang >= peserta
        ? pilih(bh, { id: `Semua peserta datang ${kapan.id}.`, en: `Every guest came ${kapan.en}.` })
        : hampir
          ? pilih(bh, { id: `Hampir semua peserta datang ${kapan.id}.`, en: `Almost every guest came ${kapan.en}.` })
          : pilih(bh, { id: `${isi} dari 10 peserta datang ${kapan.id}.`, en: `${isi} in 10 guests came ${kapan.en}.` }),
      teks: pilih(bh, {
        id: `${angka(datang, bh)} dari ${angka(peserta, bh)} peserta sudah di-scan di titik check-in. ${angka(peserta - datang, bh)} orang tidak tercatat datang.`,
        en: `${angka(datang, bh)} of ${angka(peserta, bh)} guests were scanned at a check-in point. ${angka(peserta - datang, bh)} were not recorded.`,
      }),
    });
  } else absen.push({ kunci: "hadir", alasan: "No one was scanned at this day's check-in points yet." });

  // Jam dan menit tersibuk: pindaian pertama tiap orang hari itu, di semua titik.
  const sibuk = sibukHari(kedatanganHari(sesi), b.acara.offset);
  const satuTitik = sesi.length === 1 ? sesi[0].nama : null;
  if (sibuk.n >= MIN_ORANG) {
    const jamP = labelJam(sibuk.jamPuncak, bh);
    const jamS = labelJam((sibuk.jamPuncak + 1) % 24, bh);
    const p = persen(sibuk.nPuncak, sibuk.n);
    halaman.push({
      kunci: "jam", permukaan: "putih", foto: f1 || null,
      judul: pilih(bh, { id: `Pukul ${jamP} paling ramai.`, en: `${jamP} was the busiest hour.` }),
      batang: sibuk.jam.map((j) => ({ label: String(j.jam).padStart(2, "0"), nilai: j.n, puncak: j.puncak })),
      teks: satuTitik
        ? pilih(bh, {
          id: `${angka(sibuk.nPuncak, bh)} orang datang ke ${satuTitik} antara ${jamP} dan ${jamS}, ${p}% dari kedatangan hari itu.`,
          en: `${angka(sibuk.nPuncak, bh)} people arrived at ${satuTitik} between ${jamP} and ${jamS}, ${p}% of the day's arrivals.`,
        })
        : pilih(bh, {
          id: `${angka(sibuk.nPuncak, bh)} orang tiba antara ${jamP} dan ${jamS}, ${p}% dari kedatangan hari itu.`,
          en: `${angka(sibuk.nPuncak, bh)} people arrived between ${jamP} and ${jamS}, ${p}% of the day's arrivals.`,
        }),
    });
    if (sibuk.menit && sibuk.menit.n >= MIN_MENIT) {
      const detik = Math.round(60 / sibuk.menit.n);
      const pukul = jam(new Date(sibuk.menit.t).toISOString(), b.acara.offset, bh);
      halaman.push({
        kunci: "menit", permukaan: "gelap", foto: null,
        besar: pilih(bh, { id: `${detik} detik`, en: `${detik} sec` }),
        judul: pilih(bh, { id: `Di menit tersibuk, satu orang masuk tiap ${detik} detik.`, en: `In the busiest minute, one person got in every ${detik} seconds.` }),
        teks: pilih(bh, { id: `${sibuk.menit.n} orang dalam satu menit, pukul ${pukul}.`, en: `${sibuk.menit.n} people in one minute, at ${pukul}.` }),
      });
    } else absen.push({ kunci: "menit", alasan: `No minute had ${MIN_MENIT} or more arrivals.` });
  } else {
    absen.push({ kunci: "jam", alasan: `Needs ${MIN_ORANG} or more arrivals this day.` });
    absen.push({ kunci: "menit", alasan: `Needs ${MIN_ORANG} or more arrivals this day.` });
  }

  const baris = sesi.slice(0, 6).map((s) => ({
    jam: jamAgenda(s, bh), nama: s.nama,
    persen: s.diharapkan > 0 ? persen(s.sudah, s.diharapkan) : null,
    teks: s.diharapkan > 0 ? `${persen(s.sudah, s.diharapkan)}%` : angka(s.sudah, bh),
    ...(s.diharapkan > 0 ? { ket: dari(s.sudah, s.diharapkan, bh) } : {}),
  }));
  if (baris.length) {
    // Dari angka mentah, bukan yang dibulatkan: 79,9% bukan "80% ke atas".
    const mentah = sesi.slice(0, 6).filter((s) => s.diharapkan > 0).map((s) => (s.sudah / s.diharapkan) * 100);
    const min = mentah.length === baris.length && mentah.length > 1 ? Math.min(...mentah) : null;
    const n = sesi.length;
    halaman.push({
      kunci: "agenda", permukaan: "muda", foto: null, baris,
      judul: min !== null && min >= 60
        ? pilih(bh, { id: `${n} agenda hari ini, semuanya terisi ${Math.floor(min / 5) * 5}% ke atas.`, en: `${n} agenda items today, each at least ${Math.floor(min / 5) * 5}% full.` })
        : pilih(bh, { id: `${n} agenda hari ini.`, en: `${n} agenda item${n > 1 ? "s" : ""} today.` }),
    });
  } else absen.push({ kunci: "agenda", alasan: "No agenda items linked to a check-in point on this day." });

  const tutup = sesiBesok
    ? pilih(bh, { id: `Besok, ${sesiBesok.nama} mulai ${jamAgenda(sesiBesok, bh)}.`, en: `Tomorrow, ${sesiBesok.nama} starts at ${jamAgenda(sesiBesok, bh)}.` })
    : pilih(bh, { id: "Terima kasih sudah bersama kami.", en: "Thank you for being with us." });
  halaman.push({ kunci: "penutup", permukaan: "kertas", foto: f2 || null, judul: tutup, teks: setelan.catatan || null, ttd: pilih(bh, { id: `Panitia ${b.acara.nama}`, en: `${b.acara.nama} committee` }) });

  const tampil = halaman.filter((p) => p.kunci === "sampul" || !setelan.sembunyi.includes(p.kunci));
  return { hari: { tanggal: tgl, hariKe: ke, totalHari: total, nama: b.acara.nama, bahasa: bh, tema: b.acara.tema, huruf, halaman: tampil, dibuat: b.sekarang }, absen, ada: halaman.map((p) => p.kunci) };
}

const tanda = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Story Seluruh acara: satu set 9:16 dari bahan yang sama dengan deck, untuk
 * acara lebih dari satu hari. Setiap persen disertai jumlahnya ("x dari y").
 */
export function susunRingkasan(b: BahanLaporan, setelan: SetelanHari, huruf: HariHighlight["huruf"]): { hari: HariHighlight; absen: HalamanAbsen[]; ada: KunciHalaman[] } {
  const bh = b.acara.bahasa;
  const semua = hariAcara(b);
  const total = semua.length;
  const peserta = b.peserta.length;
  const datang = b.hadir.size;
  const [f0, , f2] = setelan.foto;
  const bisaAksen = aksenTerbaca(b.acara.tema);
  const halaman: HalamanHarian[] = [];
  const absen: HalamanAbsen[] = [];
  const tgl = rentang(semua[0] ?? null, semua[total - 1] ?? null, bh) ?? "";
  const orang = pilih(bh, { id: "orang", en: "people" });

  halaman.push({
    kunci: "sampul", permukaan: "foto", foto: f0 || b.acara.tema.foto,
    kecil: `${pilih(bh, { id: "Ringkasan acara", en: "Event recap" })} · ${tgl}`,
    judul: pilih(bh, { id: `${angka(datang, bh)} peserta datang dalam ${total} hari.`, en: `${angka(datang, bh)} guests came over ${total} days.` }),
  });

  if (peserta > 0 && datang > 0) {
    const isi = datang >= peserta ? 10 : Math.min(9, Math.max(1, Math.floor((datang / peserta) * 10)));
    halaman.push({
      kunci: "hadir", permukaan: bisaAksen ? "aksen" : "kertas", foto: null, isi,
      judul: datang >= peserta
        ? pilih(bh, { id: "Semua peserta terdaftar datang.", en: "Every registered guest came." })
        : datang / peserta >= 0.95
          ? pilih(bh, { id: "Hampir semua peserta terdaftar datang.", en: "Almost every registered guest came." })
          : pilih(bh, { id: `${isi} dari 10 peserta terdaftar datang.`, en: `${isi} in 10 registered guests came.` }),
      teks: pilih(bh, {
        id: `${dari(datang, peserta, bh)} peserta terdaftar pernah di-scan di salah satu titik check-in.`,
        en: `${dari(datang, peserta, bh)} registered guests were scanned at a check-in point at least once.`,
      }),
    });
  } else absen.push({ kunci: "hadir", alasan: "No one was scanned at a check-in point yet." });

  if (peserta > 0) {
    const perHari = semua.map((t, i) => ({ i, n: unik(b.sesi.filter((s) => s.tanggal === t)), t }));
    const ramai = perHari.reduce((a, c) => (c.n > a.n ? c : a), perHari[0]);
    halaman.push({
      kunci: "rekap", permukaan: "gelap", foto: null,
      hari: perHari.map((d) => ({ label: `${pilih(bh, { id: `Hari ${d.i + 1}`, en: `Day ${d.i + 1}` })}, ${namaHari(d.t, bh)}`, persen: d.n < peserta ? Math.min(99, persen(d.n, peserta)) : 100, ket: dari(d.n, peserta, bh) })),
      judul: pilih(bh, { id: `Hari ${ramai.i + 1} paling ramai, ${angka(ramai.n, bh)} peserta.`, en: `Day ${ramai.i + 1} was the busiest, ${angka(ramai.n, bh)} guests.` }),
      teks: pilih(bh, { id: `Persen dari ${angka(peserta, bh)} peserta terdaftar.`, en: `Share of ${angka(peserta, bh)} registered guests.` }),
    });
  }

  const sesi = [...b.sesi].sort((x, y) => `${x.tanggal ?? ""} ${x.jam ?? ""}`.localeCompare(`${y.tanggal ?? ""} ${y.jam ?? ""}`));
  if (sesi.length) {
    halaman.push({
      kunci: "agenda", permukaan: "muda", foto: null,
      baris: sesi.slice(0, 6).map((s) => ({
        jam: s.tanggal ? namaHari(s.tanggal, bh).slice(0, 3) : "",
        nama: s.nama,
        persen: s.diharapkan > 0 ? persen(s.sudah, s.diharapkan) : null,
        teks: s.diharapkan > 0 ? `${persen(s.sudah, s.diharapkan)}%` : angka(s.sudah, bh),
        ...(s.diharapkan > 0 ? { ket: dari(s.sudah, s.diharapkan, bh) } : {}),
      })),
      judul: sesi.length > 6
        ? pilih(bh, { id: `${sesi.length} sesi, 6 yang pertama.`, en: `${sesi.length} sessions, the first 6.` })
        : pilih(bh, { id: `${sesi.length} sesi selama acara.`, en: `${sesi.length} session${sesi.length > 1 ? "s" : ""} over the event.` }),
    });
  }

  // Jam tersibuk di satu titik selama acara: kedatangan pertama per orang di titik itu.
  const puncak = sesi
    .map((s) => ({ s, k: sibukHari(kedatanganHari([s]), b.acara.offset) }))
    .filter((x) => x.k.n >= MIN_ORANG)
    .reduce<{ s: SesiBahan; k: ReturnType<typeof sibukHari> } | null>((a, c) => (!a || c.k.nPuncak > a.k.nPuncak ? c : a), null);
  if (puncak) {
    const jamP = labelJam(puncak.k.jamPuncak, bh);
    const jamS = labelJam((puncak.k.jamPuncak + 1) % 24, bh);
    const hariP = puncak.s.tanggal ? namaHari(puncak.s.tanggal, bh) : "";
    halaman.push({
      kunci: "menit", permukaan: "putih", foto: null,
      besar: angka(puncak.k.nPuncak, bh),
      judul: pilih(bh, { id: `orang datang ke ${puncak.s.nama} pukul ${jamP}, jam tersibuk selama acara.`, en: `people arrived at ${puncak.s.nama} at ${jamP}, the busiest hour of the event.` }),
      teks: pilih(bh, {
        id: `${dari(puncak.k.nPuncak, puncak.k.n, bh)} kedatangan di ${puncak.s.nama} ${hariP} terjadi antara ${jamP} dan ${jamS}.`,
        en: `${dari(puncak.k.nPuncak, puncak.k.n, bh)} arrivals at ${puncak.s.nama} on ${hariP} came between ${jamP} and ${jamS}.`,
      }),
    });
  } else absen.push({ kunci: "menit", alasan: `Needs a check-in point with ${MIN_ORANG} or more arrivals.` });

  const nps = nilaiNps(b);
  if (nps && nps.size >= SAMPEL_KECIL) {
    const v = [...nps.values()];
    const n = v.length;
    const pro = v.filter((x) => x >= 9).length;
    const net = v.filter((x) => x === 7 || x === 8).length;
    const kur = n - pro - net;
    const sepuluh = Math.floor((pro / n) * 10);
    halaman.push({
      kunci: "puas", permukaan: "gelap", foto: null,
      besar: tanda(skorNps(v) ?? 0),
      judul: pilih(bh, { id: `${sepuluh} dari 10 pasti merekomendasikan acara ini.`, en: `${sepuluh} in 10 would definitely recommend this event.` }),
      segmen: [
        { label: pilih(bh, { id: "Pasti merekomendasikan, nilai 9 atau 10", en: "Would recommend, score 9 or 10" }), persen: persen(pro, n), ket: `${angka(pro, bh)} ${orang}` },
        { label: pilih(bh, { id: "Netral, nilai 7 atau 8", en: "Neutral, score 7 or 8" }), persen: persen(net, n), ket: `${angka(net, bh)} ${orang}` },
        { label: pilih(bh, { id: "Kurang puas, nilai 0 sampai 6", en: "Less happy, score 0 to 6" }), persen: persen(kur, n), ket: `${angka(kur, bh)} ${orang}` },
      ],
      teks: pilih(bh, { id: `NPS dari ${angka(n, bh)} jawaban kuesioner.`, en: `NPS from ${angka(n, bh)} questionnaire answers.` }),
    });
  } else absen.push({ kunci: "puas", alasan: nps ? `Needs ${SAMPEL_KECIL} or more answers to the recommend (NPS) question.` : "Feedback has no recommend (NPS) question." });

  const layar: Array<{ besar: string; teks: string }> = [];
  const menang = b.undian?.pemenang ?? [];
  if (menang.length) {
    const serah = menang.filter((w) => w.dikonfirmasi).length;
    layar.push({ besar: `${angka(serah, bh)} / ${angka(menang.length, bh)}`, teks: pilih(bh, { id: "pemenang undian dikonfirmasi", en: "lucky draw winners confirmed" }) });
  }
  if (b.voting?.pemilih) layar.push({ besar: angka(b.voting.pemilih, bh), teks: pilih(bh, { id: `orang ikut live voting, ${b.voting.pertanyaan} pertanyaan`, en: `people took part in live voting, ${b.voting.pertanyaan} questions` }) });
  const l = b.logistik;
  if (l?.kamar) layar.push({ besar: angka(l.kamar, bh), teks: pilih(bh, { id: `kamar di ${l.hotel} hotel`, en: `rooms in ${l.hotel} hotel${l.hotel === 1 ? "" : "s"}` }) });
  if (l?.kendaraan) layar.push({ besar: angka(l.kendaraan, bh), teks: pilih(bh, { id: `kendaraan untuk ${l.trip} perjalanan`, en: `vehicles for ${l.trip} trips` }) });
  if (l?.tas) {
    layar.push(l.tasKembali !== null
      ? { besar: angka(l.tasKembali, bh), teks: pilih(bh, { id: `dari ${angka(l.tas, bh)} tas bagasi kembali ke pemiliknya`, en: `of ${angka(l.tas, bh)} luggage bags returned to their owners` }) }
      : { besar: angka(l.tas, bh), teks: pilih(bh, { id: "tas bagasi dicatat", en: "luggage bags logged" }) });
  }
  if (layar.length) {
    halaman.push({ kunci: "layar", permukaan: "kertas", foto: null, baris: layar, judul: pilih(bh, { id: "Di balik layar, panitia mengurus semuanya.", en: "Behind the scenes, the committee handled it all." }) });
  } else absen.push({ kunci: "layar", alasan: "No lucky draw, voting or logistics data." });

  halaman.push({
    kunci: "penutup", permukaan: bisaAksen ? "aksen" : "muda", foto: f2 || null,
    judul: pilih(bh, { id: "Terima kasih sudah bersama kami.", en: "Thank you for being with us." }),
    teks: setelan.catatan || null,
    ttd: pilih(bh, { id: `Panitia ${b.acara.nama}`, en: `${b.acara.nama} committee` }),
  });

  const tampil = halaman.filter((p) => p.kunci === "sampul" || !setelan.sembunyi.includes(p.kunci));
  return {
    hari: { tanggal: RINGKASAN, hariKe: 0, totalHari: total, nama: b.acara.nama, bahasa: bh, tema: b.acara.tema, huruf, halaman: tampil, dibuat: b.sekarang, rentang: tgl },
    absen,
    ada: halaman.map((p) => p.kunci),
  };
}
