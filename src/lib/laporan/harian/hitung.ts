/**
 * Menyusun highlight satu hari dari bahan Event report yang sama dengan deck
 * (bahan-server.ts), disaring ke sesi Agenda di tanggal itu. Fungsi murni.
 *
 * Halaman tanpa data hilang sendiri (mis. "jam" bila tidak ada titik dengan
 * 30 kedatangan), dengan alasannya untuk panitia.
 */
import type { BahanLaporan, SesiBahan } from "../bahan.ts";
import { aksenTerbaca } from "../warna.ts";
import { hitungTitik, MIN_ORANG } from "../slide/titik.ts";
import { angka, jam, namaHari, persen, pilih, tanggal as teksTanggal, type Bahasa } from "../teks.ts";
import type { SetelanHari } from "./config.ts";
import type { HalamanAbsen, HalamanHarian, HariHighlight, KunciHalaman } from "./jenis.ts";

/** Tanggal acara yang punya sesi Agenda, urut. */
export const hariAcara = (b: BahanLaporan) => [...new Set(b.sesi.map((s) => s.tanggal).filter((t): t is string => !!t))].sort();

const jamAgenda = (s: SesiBahan, bh: Bahasa) => (s.jam ? (bh === "id" ? s.jam.slice(0, 5).replace(":", ".") : s.jam.slice(0, 5)) : "");
const labelJam = (h: number, bh: Bahasa) => `${String(h).padStart(2, "0")}${bh === "id" ? "." : ":"}00`;

/** Peserta unik yang dipindai di sesi-sesi ini (sesi lama tanpa id: jumlah terbesar). */
function unik(sesi: SesiBahan[]): number {
  if (sesi.every((s) => s.orang)) return new Set(sesi.flatMap((s) => s.orang!)).size;
  return Math.max(0, ...sesi.map((s) => s.sudah));
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
    const isi = Math.min(10, Math.max(datang > 0 ? 1 : 0, Math.round((datang / peserta) * 10)));
    halaman.push({
      kunci: "hadir", permukaan: aksen, foto: null, isi,
      judul: pilih(bh, { id: `${isi} dari 10 peserta datang ${total > 1 ? "hari ini" : "ke acara"}.`, en: `${isi} in 10 guests came ${total > 1 ? "today" : "to the event"}.` }),
      teks: pilih(bh, {
        id: `${angka(datang, bh)} dari ${angka(peserta, bh)} peserta sudah di-scan di titik check-in. ${angka(peserta - datang, bh)} orang tidak tercatat datang.`,
        en: `${angka(datang, bh)} of ${angka(peserta, bh)} guests were scanned at a check-in point. ${angka(peserta - datang, bh)} were not recorded.`,
      }),
    });
  } else absen.push({ kunci: "hadir", alasan: "No one was scanned at this day's check-in points yet." });

  // Jam dan menit tersibuk: titik dengan kedatangan terbanyak hari itu.
  const utama = [...sesi].sort((x, y) => y.datang.length - x.datang.length)[0];
  const h = utama && utama.datang.length >= MIN_ORANG ? hitungTitik(utama, b.acara.offset) : null;
  if (h) {
    const ada = h.perJam.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    let dari = Math.max(ada[0], h.jamPuncak - 4);
    const sampai = Math.min(ada[ada.length - 1], dari + 7);
    dari = Math.max(ada[0], Math.min(dari, sampai - 7));
    const jamP = labelJam(h.jamPuncak, bh);
    halaman.push({
      kunci: "jam", permukaan: "putih", foto: f1 || null,
      judul: pilih(bh, { id: `Pukul ${jamP} paling ramai.`, en: `${jamP} was the busiest hour.` }),
      batang: Array.from({ length: sampai - dari + 1 }, (_, i) => ({ label: String(dari + i).padStart(2, "0"), nilai: h.perJam[dari + i], puncak: dari + i === h.jamPuncak })),
      teks: pilih(bh, {
        id: `${angka(h.perJam[h.jamPuncak], bh)} orang datang ke ${utama.nama} antara ${jamP} dan ${labelJam(h.jamPuncak + 1, bh)}, ${h.pJamPuncak}% dari kedatangan hari itu.`,
        en: `${angka(h.perJam[h.jamPuncak], bh)} people arrived at ${utama.nama} between ${jamP} and ${labelJam(h.jamPuncak + 1, bh)}, ${h.pJamPuncak}% of the day's arrivals.`,
      }),
    });
    if (h.menitPuncak && h.menitPuncak.n >= 3) {
      const detik = Math.round(60 / h.menitPuncak.n);
      const pukul = jam(new Date(h.menitPuncak.t).toISOString(), b.acara.offset, bh);
      halaman.push({
        kunci: "menit", permukaan: "gelap", foto: null,
        besar: pilih(bh, { id: `${detik} detik`, en: `${detik} sec` }),
        judul: pilih(bh, { id: `Di menit tersibuk, satu orang masuk tiap ${detik} detik.`, en: `In the busiest minute, one person got in every ${detik} seconds.` }),
        teks: pilih(bh, { id: `${h.menitPuncak.n} orang dalam satu menit, pukul ${pukul}, di ${utama.nama}.`, en: `${h.menitPuncak.n} people in one minute, at ${pukul}, at ${utama.nama}.` }),
      });
    } else absen.push({ kunci: "menit", alasan: "No minute had 3 or more arrivals." });
  } else {
    absen.push({ kunci: "jam", alasan: `Needs a check-in point with ${MIN_ORANG} or more arrivals this day.` });
    absen.push({ kunci: "menit", alasan: `Needs a check-in point with ${MIN_ORANG} or more arrivals this day.` });
  }

  const baris = sesi.slice(0, 6).map((s) => ({
    jam: jamAgenda(s, bh), nama: s.nama,
    persen: s.diharapkan > 0 ? persen(s.sudah, s.diharapkan) : null,
    teks: s.diharapkan > 0 ? `${persen(s.sudah, s.diharapkan)}%` : angka(s.sudah, bh),
  }));
  if (baris.length) {
    const ps = baris.map((r) => r.persen).filter((p): p is number => p !== null);
    const min = ps.length === baris.length && ps.length > 1 ? Math.min(...ps) : null;
    const n = sesi.length;
    halaman.push({
      kunci: "agenda", permukaan: "muda", foto: null, baris,
      judul: min !== null && min >= 60
        ? pilih(bh, { id: `${n} agenda hari ini, semuanya terisi ${Math.floor(min / 5) * 5}% ke atas.`, en: `${n} agenda items today, each at least ${Math.floor(min / 5) * 5}% full.` })
        : pilih(bh, { id: `${n} agenda hari ini.`, en: `${n} agenda item${n > 1 ? "s" : ""} today.` }),
    });
  } else absen.push({ kunci: "agenda", alasan: "No agenda items linked to a check-in point on this day." });

  if (total > 1 && ke === total) {
    const hari = semua.map((t, i) => ({ label: pilih(bh, { id: `Hari ${i + 1}`, en: `Day ${i + 1}` }), persen: persen(unik(b.sesi.filter((s) => s.tanggal === t)), peserta) }));
    halaman.push({
      kunci: "rekap", permukaan: aksen === "aksen" ? "gelap" : "kertas", foto: null, hari,
      judul: pilih(bh, { id: `${angka(b.hadir.size, bh)} peserta datang selama ${total} hari.`, en: `${angka(b.hadir.size, bh)} guests came over ${total} days.` }),
      teks: pilih(bh, { id: `Dari ${angka(peserta, bh)} peserta terdaftar.`, en: `Out of ${angka(peserta, bh)} registered guests.` }),
    });
  }

  const tutup = sesiBesok
    ? pilih(bh, { id: `Besok, ${sesiBesok.nama} mulai ${jamAgenda(sesiBesok, bh)}.`, en: `Tomorrow, ${sesiBesok.nama} starts at ${jamAgenda(sesiBesok, bh)}.` })
    : pilih(bh, { id: "Terima kasih sudah bersama kami.", en: "Thank you for being with us." });
  halaman.push({ kunci: "penutup", permukaan: "kertas", foto: f2 || null, judul: tutup, teks: setelan.catatan || null, ttd: pilih(bh, { id: `Panitia ${b.acara.nama}`, en: `${b.acara.nama} committee` }) });

  const tampil = halaman.filter((p) => p.kunci === "sampul" || !setelan.sembunyi.includes(p.kunci));
  return { hari: { tanggal: tgl, hariKe: ke, totalHari: total, nama: b.acara.nama, bahasa: bh, tema: b.acara.tema, huruf, halaman: tampil, dibuat: b.sekarang }, absen, ada: halaman.map((p) => p.kunci) };
}
