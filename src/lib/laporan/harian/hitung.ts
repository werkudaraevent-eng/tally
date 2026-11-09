/**
 * Menyusun Daily highlights (satu hari) dan Whole event dari bahan Event
 * report yang sama dengan deck (bahan-server.ts). Fungsi murni.
 *
 * Satu halaman, satu temuan: judul berisi temuannya, persen disertai "x dari
 * y", dan satu pembanding (rata-rata, hari lain, kelompok lain). Halaman yang
 * tidak punya temuan tidak muncul, dengan alasannya untuk panitia. Aturannya
 * di temuan.ts.
 */
import type { BahanLaporan, SesiBahan } from "../bahan.ts";
import { aksenTerbaca } from "../warna.ts";
import { skorNps } from "../../kilas-balik/setelan.ts";
import { nilaiNps } from "../slide/kepuasan.ts";
import { angka, dari, namaHari, pilih, rentang, SAMPEL_KECIL, tanggal as teksTanggal, type Bahasa } from "../teks.ts";
import type { SetelanHari } from "./config.ts";
import { RINGKASAN, type BarisAgenda, type BarisKelompokHal, type HalamanAbsen, type HalamanHarian, type HariHighlight, type KunciHalaman, type PoinPenutup } from "./jenis.ts";
import { AMBANG_KELOMPOK, AMBANG_MERATA, AMBANG_SEPI, BATAS_SESI, hadirKelompok, lajuSesi, rataSesi, selisih, sesiSepi, urutSesi, type BarisKelompok, type Laju } from "./temuan.ts";

/** Tanggal acara yang punya sesi Agenda, urut. */
export const hariAcara = (b: BahanLaporan) => [...new Set(b.sesi.map((s) => s.tanggal).filter((t): t is string => !!t))].sort();

/** Titik yang dikeluarkan dari highlight hari sebelum dan sesudah `tgl` (untuk "kemarin" dan "Besok, ..."). */
export function tanpaSekitar(harian: Partial<Record<string, { tanpa: string[] }>>, hari: readonly string[], tgl: string) {
  const i = hari.indexOf(tgl);
  return { kemarin: harian[hari[i - 1] ?? ""]?.tanpa ?? [], besok: harian[hari[i + 1] ?? ""]?.tanpa ?? [] };
}
export type TanpaSekitar = ReturnType<typeof tanpaSekitar>;

const jamAgenda = (s: SesiBahan, bh: Bahasa) => (s.jam ? (bh === "id" ? s.jam.slice(0, 5).replace(":", ".") : s.jam.slice(0, 5)) : "");
const urutJam = (x: SesiBahan, y: SesiBahan) => `${x.tanggal ?? ""} ${x.jam ?? ""}`.localeCompare(`${y.tanggal ?? ""} ${y.jam ?? ""}`);
const bulat = Math.round;
const hariPendek = (s: SesiBahan, bh: Bahasa) => (s.tanggal ? namaHari(s.tanggal, bh).slice(0, 3) : "");
const tanda = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
const KATA = { id: ["", "Satu", "Dua", "Tiga"], en: ["", "One", "Two", "Three"] };

/** "A", "A dan B", "A, B dan C". */
function daftar(isi: string[], bh: Bahasa) {
  if (isi.length < 2) return isi[0] ?? "";
  return `${isi.slice(0, -1).join(", ")} ${bh === "id" ? "dan" : "and"} ${isi[isi.length - 1]}`;
}

/** Jumlah check-in sesi dan yang diharapkan (penyebut rata-rata), untuk "x dari y". */
function cekIn(sesi: SesiBahan[]): { sudah: number; harap: number } {
  const ada = sesi.filter((s) => s.diharapkan > 0);
  return { sudah: ada.reduce((a, s) => a + s.sudah, 0), harap: ada.reduce((a, s) => a + s.diharapkan, 0) };
}
const teksCekIn = (sesi: SesiBahan[], bh: Bahasa) => {
  const c = cekIn(sesi);
  return pilih(bh, { id: `Check-in sesi: ${dari(c.sudah, c.harap, bh)}.`, en: `Session check-ins: ${dari(c.sudah, c.harap, bh)}.` });
};

type Bangun = { halaman: HalamanHarian[]; absen: HalamanAbsen[]; poin: Array<PoinPenutup & { kunci: KunciHalaman }> };

/** Semua sesi, urut dari tertinggi. Garis tipis = rata-rata. */
function halamanSesi(x: Bangun, laju: Laju[], sesi: SesiBahan[], rata: number | null, bh: Bahasa, label: (s: SesiBahan) => string, foto: string | null, hariIni: boolean) {
  const R = rata === null ? null : bulat(rata);
  if (!laju.length) {
    // Tanpa jumlah diharapkan: urut dari yang paling banyak di-scan.
    const baris: BarisAgenda[] = [...sesi].sort((a, c) => c.sudah - a.sudah).slice(0, BATAS_SESI)
      .map((s) => ({ jam: label(s), nama: s.nama, persen: null, teks: angka(s.sudah, bh) }));
    x.halaman.push({ kunci: "agenda", permukaan: "muda", foto, baris, judul: pilih(bh, { id: `${sesi.length} sesi${hariIni ? " hari ini" : ""}.`, en: `${sesi.length} session${sesi.length > 1 ? "s" : ""}${hariIni ? " today" : ""}.` }) });
    return;
  }
  const { baris, terpotong } = urutSesi(laju);
  const rendah = (p: number) => R !== null && bulat(p) <= R - AMBANG_SEPI;
  const k = laju.filter((l) => rendah(l.p)).length;
  const n = laju.length;
  const min = bulat(Math.min(...laju.map((l) => l.p)));
  const max = bulat(Math.max(...laju.map((l) => l.p)));
  const judul = n === 1
    ? pilih(bh, { id: `${laju[0].s.nama}: ${max}%.`, en: `${laju[0].s.nama}: ${max}%.` })
    : k > 0
      ? pilih(bh, { id: `${k} dari ${n} sesi di bawah ${R! - AMBANG_SEPI + 1}%.`, en: `${k} of ${n} sessions below ${R! - AMBANG_SEPI + 1}%.` })
      : min === max
        ? pilih(bh, { id: `Semua ${n} sesi ${max}%.`, en: `All ${n} sessions at ${max}%.` })
        : max - min <= AMBANG_MERATA
          ? pilih(bh, { id: `Kehadiran ${n} sesi merata, ${min} sampai ${max}%.`, en: `Attendance was even across ${n} sessions, ${min} to ${max}%.` })
          : pilih(bh, { id: `${n} sesi, dari ${max}% sampai ${min}%.`, en: `${n} sessions, from ${max}% down to ${min}%.` });
  const ket = [
    R !== null && n > 1 ? pilih(bh, { id: `Garis tipis: rata-rata ${R}%.`, en: `Thin line: average ${R}%.` }) : null,
    terpotong ? pilih(bh, { id: `${BATAS_SESI / 2} teratas dan ${BATAS_SESI / 2} terbawah dari ${n} sesi.`, en: `Top ${BATAS_SESI / 2} and bottom ${BATAS_SESI / 2} of ${n} sessions.` }) : null,
  ].filter(Boolean).join(" ");
  x.halaman.push({
    kunci: "agenda", permukaan: "muda", foto: baris.length <= 4 ? foto : null, judul, rata: n > 1 ? R : null, teks: ket || undefined,
    baris: baris.map(({ s, p }) => ({ jam: label(s), nama: s.nama, persen: bulat(p), teks: `${bulat(p)}%`, ket: dari(s.sudah, s.diharapkan, bh), rendah: n > 1 && rendah(p) })),
  });
}

/** Sesi paling sepi, dan kelompok yang paling jarang datang di sesi itu. */
function halamanSepi(x: Bangun, b: BahanLaporan, laju: Laju[], rata: number | null, bh: Bahasa, seluruh: boolean) {
  const sepi = sesiSepi(laju, rata);
  if (!sepi) {
    x.absen.push({ kunci: "sepi", alasan: laju.length < 2 ? "Needs 2 or more sessions with an expected count." : `No session is ${AMBANG_SEPI} or more points below the average.` });
    return;
  }
  const R = bulat(rata!);
  const P = bulat(sepi.p);
  const kel = hadirKelompok(b, [sepi.s]);
  const rinci = kel.length >= 2 && selisih(kel) >= AMBANG_KELOMPOK;
  const lo = kel[kel.length - 1];
  const waktu = [seluruh && sepi.s.tanggal ? namaHari(sepi.s.tanggal, bh) : null, jamAgenda(sepi.s, bh)].filter(Boolean).join(" ");
  x.halaman.push({
    kunci: "sepi", permukaan: "putih", foto: null,
    kecil: [pilih(bh, { id: "Sesi paling sepi", en: "Quietest session" }), waktu].filter(Boolean).join(" · "),
    judul: sepi.s.nama,
    besar: `${P}%`,
    teks: pilih(bh, {
      id: `${dari(sepi.s.sudah, sepi.s.diharapkan, bh)} peserta. ${R - P} poin di bawah rata-rata sesi${seluruh ? "" : " hari ini"} (${R}%).`,
      en: `${dari(sepi.s.sudah, sepi.s.diharapkan, bh)} guests. ${R - P} points below the${seluruh ? "" : " day's"} session average (${R}%).`,
    }),
    kelompokJudul: rinci ? pilih(bh, { id: `Per ${b.kelompokLabel!.toLowerCase()} di sesi ini`, en: `By ${b.kelompokLabel!.toLowerCase()} in this session` }) : null,
    kelompok: rinci ? barisKelompok(kel, bh, true) : [],
  });
  x.poin.push({
    kunci: "sepi",
    judul: `${sepi.s.nama} ${P}%`,
    ket: rinci
      ? pilih(bh, { id: `${dari(sepi.s.sudah, sepi.s.diharapkan, bh)}; ${lo.label} hanya ${dari(lo.hadir, lo.total, bh)}`, en: `${dari(sepi.s.sudah, sepi.s.diharapkan, bh)}; ${lo.label} only ${dari(lo.hadir, lo.total, bh)}` })
      : pilih(bh, { id: `${dari(sepi.s.sudah, sepi.s.diharapkan, bh)}, ${R - P} poin di bawah rata-rata`, en: `${dari(sepi.s.sudah, sepi.s.diharapkan, bh)}, ${R - P} points below average` }),
  });
}

/** Paling banyak 8 baris; yang terendah selalu ikut. */
function barisKelompok(kel: BarisKelompok[], bh: Bahasa, sorot: boolean): BarisKelompokHal[] {
  const pilihan = kel.length > 8 ? [...kel.slice(0, 7), kel[kel.length - 1]] : kel;
  return pilihan.map((k, i) => ({ label: k.label, persen: bulat(k.p), ket: dari(k.hadir, k.total, bh), rendah: sorot && i === pilihan.length - 1 }));
}

function selesai(x: Bangun, setelan: SetelanHari) {
  const tampil = x.halaman.filter((p) => p.kunci === "sampul" || !setelan.sembunyi.includes(p.kunci));
  return { tampil, poin: x.poin.filter((p) => p.kunci === "sampul" || !setelan.sembunyi.includes(p.kunci)).slice(0, 3).map(({ judul, ket }) => ({ judul, ket })) };
}

/** `ada` = halaman yang punya data hari itu, termasuk yang disembunyikan panitia. */
export function susunHari(b: BahanLaporan, tgl: string, setelan: SetelanHari, huruf: HariHighlight["huruf"], sekitar: TanpaSekitar = { kemarin: [], besok: [] }): { hari: HariHighlight; absen: HalamanAbsen[]; ada: KunciHalaman[] } {
  const bh = b.acara.bahasa;
  const semua = hariAcara(b);
  const ke = semua.indexOf(tgl) + 1;
  const total = semua.length;
  const sesi = b.sesi.filter((s) => s.tanggal === tgl && !setelan.tanpa.includes(s.kunci)).sort(urutJam);
  const kemarin = semua[ke - 2];
  const sesiKemarin = kemarin ? b.sesi.filter((s) => s.tanggal === kemarin && !sekitar.kemarin.includes(s.kunci)) : [];
  const besok = semua[ke];
  const sesiBesok = besok ? b.sesi.filter((s) => s.tanggal === besok && !sekitar.besok.includes(s.kunci)).sort(urutJam)[0] : undefined;
  const peserta = b.peserta.length;
  const datang = new Set(sesi.flatMap((s) => s.orang ?? [])).size || Math.max(0, ...sesi.map((s) => s.sudah));
  const [f0, f1, f2] = setelan.foto;
  const laju = lajuSesi(sesi);
  const rata = rataSesi(sesi);
  const R = rata === null ? null : bulat(rata);
  const x: Bangun = { halaman: [], absen: [], poin: [] };
  const hariKe = total <= 1
    ? pilih(bh, { id: "hari ini", en: "today" })
    : pilih(bh, { id: `hari ke-${ke}`, en: `day ${ke}` });

  // Sampul: rata-rata kehadiran sesi hari ini, dibanding kemarin.
  const rKemarin = rataSesi(sesiKemarin);
  const banding = R === null || rKemarin === null ? null
    : bulat(rKemarin) === R ? pilih(bh, { id: "Sama dengan kemarin.", en: "Same as yesterday." })
      : R < bulat(rKemarin) ? pilih(bh, { id: `Turun dari ${bulat(rKemarin)}% kemarin.`, en: `Down from ${bulat(rKemarin)}% yesterday.` })
        : pilih(bh, { id: `Naik dari ${bulat(rKemarin)}% kemarin.`, en: `Up from ${bulat(rKemarin)}% yesterday.` });
  const datangTeks = peserta > 0 && datang > 0
    ? pilih(bh, { id: `${dari(datang, peserta, bh)} peserta datang ke setidaknya satu sesi.`, en: `${dari(datang, peserta, bh)} guests came to at least one session.` })
    : null;
  x.halaman.push({
    kunci: "sampul", permukaan: "foto", foto: f0 || b.acara.tema.foto,
    kecil: `${total > 1 ? pilih(bh, { id: `Hari ${ke}, `, en: `Day ${ke}, ` }) : ""}${namaHari(tgl, bh)} ${teksTanggal(tgl, bh)}`,
    judul: R === null
      ? pilih(bh, { id: `${angka(datang, bh)} peserta datang di ${hariKe}.`, en: `${angka(datang, bh)} guests came on ${hariKe}.` })
      : laju.length === 1
        ? pilih(bh, { id: `${R}% hadir di ${laju[0].s.nama}.`, en: `${R}% attended ${laju[0].s.nama}.` })
        : pilih(bh, { id: `${R}% hadir di ${laju.length} sesi hari ini.`, en: `${R}% attended today's ${laju.length} sessions.` }),
    // Satu sesi: check-in sesi itu sudah sama dengan yang datang, jadi cukup satu.
    teks: [R !== null ? teksCekIn(sesi, bh) : null, banding, sesi.length > 1 || R === null ? datangTeks : null].filter(Boolean).join(" ") || undefined,
  });

  if (sesi.length >= 2) halamanSesi(x, laju, sesi, rata, bh, (s) => jamAgenda(s, bh), f1 || null, true);
  else x.absen.push({ kunci: "agenda", alasan: sesi.length ? "Only one session this day: the cover shows it." : "No agenda items linked to a check-in point on this day." });
  halamanSepi(x, b, laju, rata, bh, false);

  const tutup = sesiBesok
    ? pilih(bh, { id: `Besok, ${sesiBesok.nama} mulai ${jamAgenda(sesiBesok, bh)}.`, en: `Tomorrow, ${sesiBesok.nama} starts at ${jamAgenda(sesiBesok, bh)}.` })
    : pilih(bh, { id: "Terima kasih sudah bersama kami.", en: "Thank you for being with us." });
  x.halaman.push({ kunci: "penutup", permukaan: "kertas", foto: f2 || null, judul: tutup, teks: setelan.catatan || null, ttd: pilih(bh, { id: `Panitia ${b.acara.nama}`, en: `${b.acara.nama} committee` }) });

  const { tampil } = selesai(x, setelan);
  return { hari: { tanggal: tgl, hariKe: ke, totalHari: total, nama: b.acara.nama, bahasa: bh, tema: b.acara.tema, huruf, halaman: tampil, dibuat: b.sekarang }, absen: x.absen, ada: x.halaman.map((p) => p.kunci) };
}

/**
 * Whole event: temuan dari seluruh acara, untuk acara lebih dari satu hari.
 * Urutan: sampul, semua sesi, sesi paling sepi, per hari, per kelompok,
 * kepuasan, yang belum selesai, penutup dengan tiga temuan.
 */
export function susunRingkasan(b: BahanLaporan, setelan: SetelanHari, huruf: HariHighlight["huruf"]): { hari: HariHighlight; absen: HalamanAbsen[]; ada: KunciHalaman[] } {
  const bh = b.acara.bahasa;
  const semua = hariAcara(b);
  const total = semua.length;
  const peserta = b.peserta.length;
  const [f0, , f2] = setelan.foto;
  const bisaAksen = aksenTerbaca(b.acara.tema);
  const tgl = rentang(semua[0] ?? null, semua[total - 1] ?? null, bh) ?? "";
  const orang = pilih(bh, { id: "orang", en: "people" });
  const sesi = b.sesi.filter((s) => !setelan.tanpa.includes(s.kunci)).sort(urutJam);
  const laju = lajuSesi(sesi);
  const rata = rataSesi(sesi);
  const R = rata === null ? null : bulat(rata);
  const x: Bangun = { halaman: [], absen: [], poin: [] };

  // Per hari: rata-rata kehadiran sesi tiap hari (hari tanpa titik tersisa tidak ikut).
  const perHari = semua
    .map((t, i) => ({ i, t, sesi: sesi.filter((s) => s.tanggal === t) }))
    .map((d) => ({ ...d, r: rataSesi(d.sesi) }))
    .filter((d): d is typeof d & { r: number } => d.r !== null);
  const hiH = perHari.reduce<(typeof perHari)[number] | null>((a, c) => (!a || c.r > a.r ? c : a), null);
  const loH = perHari.reduce<(typeof perHari)[number] | null>((a, c) => (!a || c.r < a.r ? c : a), null);
  const hariBeda = perHari.length >= 2 && hiH && loH && bulat(hiH.r) - bulat(loH.r) >= AMBANG_SEPI;
  const namaH = (d: { i: number }) => pilih(bh, { id: `Hari ${d.i + 1}`, en: `Day ${d.i + 1}` });

  x.halaman.push({
    kunci: "sampul", permukaan: "foto", foto: f0 || b.acara.tema.foto,
    kecil: `${pilih(bh, { id: "Ringkasan acara", en: "Event recap" })} · ${tgl}`,
    judul: R === null
      ? pilih(bh, { id: `${angka(b.hadir.size, bh)} peserta datang dalam ${total} hari.`, en: `${angka(b.hadir.size, bh)} guests came over ${total} days.` })
      : pilih(bh, { id: `Rata-rata ${R}% peserta hadir di tiap sesi.`, en: `On average, ${R}% of guests attended each session.` }),
    teks: [
      R !== null ? teksCekIn(sesi, bh) : null,
      pilih(bh, { id: `${sesi.length} sesi dalam ${total} hari, ${angka(peserta, bh)} peserta terdaftar.`, en: `${sesi.length} sessions over ${total} days, ${angka(peserta, bh)} registered guests.` }),
      hariBeda ? pilih(bh, {
        id: `${namaH(hiH!)} paling penuh (${bulat(hiH!.r)}%, ${dari(cekIn(hiH!.sesi).sudah, cekIn(hiH!.sesi).harap, bh)}), ${namaH(loH!).toLowerCase()} paling sepi (${bulat(loH!.r)}%, ${dari(cekIn(loH!.sesi).sudah, cekIn(loH!.sesi).harap, bh)}).`,
        en: `${namaH(hiH!)} was the fullest (${bulat(hiH!.r)}%, ${dari(cekIn(hiH!.sesi).sudah, cekIn(hiH!.sesi).harap, bh)}), ${namaH(loH!).toLowerCase()} the quietest (${bulat(loH!.r)}%, ${dari(cekIn(loH!.sesi).sudah, cekIn(loH!.sesi).harap, bh)}).`,
      }) : null,
    ].filter(Boolean).join(" "),
  });
  if (R !== null) {
    x.poin.push({
      kunci: "sampul",
      judul: pilih(bh, { id: `${R}% hadir di tiap sesi`, en: `${R}% attended each session` }),
      ket: pilih(bh, {
        id: `${dari(cekIn(sesi).sudah, cekIn(sesi).harap, bh)} check-in di ${sesi.length} sesi`,
        en: `${dari(cekIn(sesi).sudah, cekIn(sesi).harap, bh)} check-ins across ${sesi.length} sessions`,
      }),
    });
  }

  if (sesi.length) halamanSesi(x, laju, sesi, rata, bh, (s) => hariPendek(s, bh), null, false);
  else x.absen.push({ kunci: "agenda", alasan: "Every check-in point is turned off." });
  halamanSepi(x, b, laju, rata, bh, true);

  if (perHari.length >= 2) {
    const sesiLo = lajuSesi(loH!.sesi).sort((a, c) => a.p - c.p).slice(0, 3).map((l) => `${l.s.nama} (${bulat(l.p)}%)`);
    x.halaman.push({
      kunci: "rekap", permukaan: "gelap", foto: null,
      hari: perHari.map((d) => {
        const h = d.sesi.filter((s) => s.diharapkan > 0);
        return { label: `${namaH(d)}, ${namaHari(d.t, bh).slice(0, 3)}`, persen: bulat(d.r), ket: dari(h.reduce((a, s) => a + s.sudah, 0), h.reduce((a, s) => a + s.diharapkan, 0), bh) };
      }),
      sorot: hariBeda ? perHari.indexOf(loH!) : undefined,
      judul: hariBeda
        ? pilih(bh, { id: `${namaH(loH!)} paling sepi: ${bulat(loH!.r)}%.`, en: `${namaH(loH!)} was the quietest: ${bulat(loH!.r)}%.` })
        : bulat(hiH!.r) - bulat(loH!.r) <= AMBANG_MERATA
          ? pilih(bh, { id: `Kehadiran tiap hari merata, ${bulat(loH!.r)} sampai ${bulat(hiH!.r)}%.`, en: `Attendance held steady each day, ${bulat(loH!.r)} to ${bulat(hiH!.r)}%.` })
          : pilih(bh, { id: `Tiap hari antara ${bulat(loH!.r)} dan ${bulat(hiH!.r)}%.`, en: `Each day between ${bulat(loH!.r)} and ${bulat(hiH!.r)}%.` }),
      teks: hariBeda
        ? pilih(bh, { id: `Sesi hari itu: ${daftar(sesiLo, bh)}.`, en: `That day: ${daftar(sesiLo, bh)}.` })
        : pilih(bh, { id: "Rata-rata kehadiran sesi tiap hari.", en: "Average session attendance each day." }),
    });
  } else x.absen.push({ kunci: "rekap", alasan: perHari.length ? "Needs 2 or more days with sessions." : "Every check-in point is turned off." });

  const kel = hadirKelompok(b, sesi);
  if (kel.length >= 2) {
    const hi = kel[0];
    const lo = kel[kel.length - 1];
    const merata = bulat(hi.p) - bulat(lo.p) < AMBANG_MERATA;
    const label = b.kelompokLabel!.toLowerCase();
    // Garis tipis: rata-rata semua peserta di sesi yang sama dengan baris kelompok.
    const rk = rataSesi(sesi.filter((s) => s.orang && s.diharapkan >= b.peserta.length));
    const RK = rk === null ? null : bulat(rk);
    x.halaman.push({
      kunci: "kelompok", permukaan: "kertas", foto: null,
      judul: merata
        ? pilih(bh, { id: `Kehadiran ${kel.length} ${label} hampir sama.`, en: `All ${kel.length} groups by ${label} attended at a similar rate.` })
        : pilih(bh, { id: `${lo.label} paling jarang hadir: ${bulat(lo.p)}%.`, en: `${lo.label} attended least: ${bulat(lo.p)}%.` }),
      teks: pilih(bh, {
        id: `Tertinggi ${hi.label} ${bulat(hi.p)}%, terendah ${lo.label} ${bulat(lo.p)}%. Rata-rata kehadiran per sesi.${RK !== null ? ` Garis tipis: rata-rata semua peserta ${RK}%.` : ""}`,
        en: `Highest ${hi.label} ${bulat(hi.p)}%, lowest ${lo.label} ${bulat(lo.p)}%. Average attendance per session.${RK !== null ? ` Thin line: average of all guests ${RK}%.` : ""}`,
      }),
      baris: barisKelompok(kel, bh, !merata),
      rata: RK,
    });
    if (!merata) x.poin.push({ kunci: "kelompok", judul: pilih(bh, { id: `${lo.label} ${bulat(lo.p)}%`, en: `${lo.label} ${bulat(lo.p)}%` }), ket: pilih(bh, { id: `${dari(lo.hadir, lo.total, bh)}, ${bulat(hi.p) - bulat(lo.p)} poin di bawah ${hi.label}`, en: `${dari(lo.hadir, lo.total, bh)}, ${bulat(hi.p) - bulat(lo.p)} points below ${hi.label}` }) });
  } else x.absen.push({ kunci: "kelompok", alasan: b.kelompokLabel ? `Needs 2 or more groups of 10+ people and sessions open to every guest.` : "Choose a group (Group by) in the Deck tab." });

  const nps = nilaiNps(b);
  if (nps && nps.size >= SAMPEL_KECIL) {
    const v = [...nps.values()];
    const n = v.length;
    const pro = v.filter((s) => s >= 9).length;
    const net = v.filter((s) => s === 7 || s === 8).length;
    const kur = n - pro - net;
    const skor = skorNps(v) ?? 0;
    const pc = (a: number) => bulat((a / n) * 100);
    x.halaman.push({
      kunci: "puas", permukaan: "gelap", foto: null,
      besar: tanda(skor),
      judul: kur > pro
        ? pilih(bh, { id: "Yang kurang puas lebih banyak dari yang merekomendasikan.", en: "More guests were unhappy than would recommend it." })
        : pro > kur
          ? pilih(bh, { id: "Yang merekomendasikan lebih banyak dari yang kurang puas.", en: "More guests would recommend it than were unhappy." })
          : pilih(bh, { id: "Yang merekomendasikan dan yang kurang puas sama banyak.", en: "As many guests would recommend it as were unhappy." }),
      segmen: [
        { label: pilih(bh, { id: "Pasti merekomendasikan, nilai 9 atau 10", en: "Would recommend, score 9 or 10" }), persen: pc(pro), ket: `${angka(pro, bh)} ${orang}` },
        { label: pilih(bh, { id: "Netral, nilai 7 atau 8", en: "Neutral, score 7 or 8" }), persen: pc(net), ket: `${angka(net, bh)} ${orang}` },
        { label: pilih(bh, { id: "Kurang puas, nilai 0 sampai 6", en: "Unhappy, score 0 to 6" }), persen: pc(kur), ket: `${angka(kur, bh)} ${orang}` },
      ],
      teks: pilih(bh, { id: `NPS dari ${angka(n, bh)} jawaban kuesioner.`, en: `NPS from ${angka(n, bh)} questionnaire answers.` }),
    });
    x.poin.push({ kunci: "puas", judul: `NPS ${tanda(skor)}`, ket: pilih(bh, { id: `${angka(kur, bh)} kurang puas, ${angka(pro, bh)} merekomendasikan`, en: `${angka(kur, bh)} unhappy, ${angka(pro, bh)} would recommend` }) });
  } else x.absen.push({ kunci: "puas", alasan: nps ? `Needs ${SAMPEL_KECIL} or more answers to the recommend (NPS) question.` : "Feedback has no recommend (NPS) question." });

  // Yang belum selesai: hanya yang masih ada selisihnya. Sisanya satu baris catatan.
  const sisa: Array<{ besar: string; teks: string }> = [];
  const juga: string[] = [];
  const menang = b.undian?.pemenang ?? [];
  if (menang.length) {
    const belum = menang.filter((w) => !w.dikonfirmasi).length;
    if (belum) sisa.push({ besar: angka(belum, bh), teks: pilih(bh, { id: `dari ${angka(menang.length, bh)} pemenang undian belum dikonfirmasi`, en: `of ${angka(menang.length, bh)} lucky draw winners not confirmed yet` }) });
    else juga.push(pilih(bh, { id: `${angka(menang.length, bh)} pemenang undian dikonfirmasi`, en: `${angka(menang.length, bh)} lucky draw winners confirmed` }));
  }
  const l = b.logistik;
  if (l?.tas && l.tasKembali !== null) {
    const belum = l.tas - l.tasKembali;
    if (belum > 0) sisa.push({ besar: angka(belum, bh), teks: pilih(bh, { id: `dari ${angka(l.tas, bh)} tas belum kembali ke pemiliknya`, en: `of ${angka(l.tas, bh)} bags not back with their owners yet` }) });
    else juga.push(pilih(bh, { id: `${angka(l.tas, bh)} tas kembali ke pemiliknya`, en: `${angka(l.tas, bh)} bags back with their owners` }));
  }
  if (l?.kamar) juga.push(pilih(bh, { id: `${angka(l.kamar, bh)} kamar di ${l.hotel} hotel`, en: `${angka(l.kamar, bh)} rooms in ${l.hotel} hotel${l.hotel === 1 ? "" : "s"}` }));
  if (l?.kendaraan) juga.push(pilih(bh, { id: `${angka(l.kendaraan, bh)} kendaraan untuk ${l.trip} perjalanan`, en: `${angka(l.kendaraan, bh)} vehicles for ${l.trip} trips` }));
  if (b.voting?.pemilih) juga.push(pilih(bh, { id: `${angka(b.voting.pemilih, bh)} orang ikut voting`, en: `${angka(b.voting.pemilih, bh)} people voted` }));
  if (sisa.length) {
    x.halaman.push({
      kunci: "layar", permukaan: "putih", foto: null, baris: sisa,
      judul: pilih(bh, { id: `${KATA.id[sisa.length]} hal belum selesai.`, en: `${KATA.en[sisa.length]} thing${sisa.length > 1 ? "s" : ""} still open.` }),
      catatan: juga.length ? pilih(bh, { id: `Juga tercatat: ${daftar(juga, bh)}.`, en: `Also logged: ${daftar(juga, bh)}.` }) : undefined,
    });
    x.poin.push({ kunci: "layar", judul: pilih(bh, { id: `${KATA.id[sisa.length]} hal belum selesai`, en: `${KATA.en[sisa.length]} thing${sisa.length > 1 ? "s" : ""} still open` }), ket: `${sisa[0].besar} ${sisa[0].teks}` });
  } else x.absen.push({ kunci: "layar", alasan: juga.length ? "Nothing left open: every bag is back and every winner confirmed." : "No lucky draw or luggage data." });

  const { poin } = selesai(x, setelan);
  x.halaman.push({
    kunci: "penutup", permukaan: bisaAksen ? "aksen" : "muda", foto: f2 || null,
    judul: poin.length
      ? pilih(bh, { id: `${KATA.id[poin.length]} hal dari acara ini.`, en: `${KATA.en[poin.length]} thing${poin.length > 1 ? "s" : ""} from this event.` })
      : pilih(bh, { id: "Terima kasih sudah bersama kami.", en: "Thank you for being with us." }),
    poin: poin.length ? poin : undefined,
    teks: setelan.catatan || null,
    ttd: pilih(bh, { id: `Panitia ${b.acara.nama}`, en: `${b.acara.nama} committee` }),
  });

  const { tampil } = selesai(x, setelan);
  return {
    hari: { tanggal: RINGKASAN, hariKe: 0, totalHari: total, nama: b.acara.nama, bahasa: bh, tema: b.acara.tema, huruf, halaman: tampil, dibuat: b.sekarang, rentang: tgl },
    absen: x.absen,
    ada: x.halaman.map((p) => p.kunci),
  };
}
