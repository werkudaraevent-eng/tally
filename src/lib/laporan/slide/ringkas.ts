import { skorNps } from "../../kilas-balik/setelan.ts";
import type { BahanLaporan } from "../bahan.ts";
import type { BlokAngka, SlideSampul } from "../jenis.ts";
import { angka, dari, jam, persen, pilih, rentang, tanggal, tanggalLokal, type HasilSlide } from "../teks.ts";
import { nilaiNps } from "./kepuasan.ts";

export function slideSampul(b: BahanLaporan): SlideSampul {
  const bh = b.acara.bahasa;
  const tempatTanggal = [b.acara.tempat, rentang(b.acara.mulai, b.acara.selesai, bh)].filter(Boolean).join(", ");
  const waktu = `${tanggal(tanggalLokal(b.sekarang, b.acara.offset), bh)} ${pilih(bh, { id: "pukul", en: "at" })} ${jam(b.sekarang, b.acara.offset, bh)}${b.acara.zona ? ` ${b.acara.zona}` : ""}`;
  return {
    kunci: "sampul",
    jenis: "sampul",
    judul: b.acara.nama,
    baris: [tempatTanggal, pilih(bh, { id: "Laporan panitia untuk manajemen", en: "Committee report for management" })].filter(Boolean),
    kaki: pilih(bh, { id: `Data per ${waktu}`, en: `Figures as of ${waktu}` }),
    logo: b.acara.logo,
  };
}

/**
 * Ringkasan: angka utama dan tiga temuan terbesar dari slide lain (dipilih
 * menurut bobot di susun.ts, lalu bisa disunting panitia lewat judul).
 */
export function slideRingkas(b: BahanLaporan, temuan: Array<{ teks: string; slide: number }>): HasilSlide {
  const bh = b.acara.bahasa;
  if (b.peserta.length === 0) return { ada: false, nama: "Summary", alasan: "No participants yet" };
  const pHadir = persen(b.hadir.size, b.peserta.length);
  const isi: BlokAngka["isi"] = [{ label: pilih(bh, { id: "Hadir", en: "Attended" }), nilai: `${pHadir}%`, ket: dari(b.hadir.size, b.peserta.length, bh) }];
  const nps = nilaiNps(b);
  const skor = nps && nps.size >= 10 ? skorNps([...nps.values()]) : null;
  if (nps && skor !== null) isi.push({ label: "NPS", nilai: skor > 0 ? `+${skor}` : String(skor), ket: pilih(bh, { id: `dari ${angka(nps.size, bh)} jawaban`, en: `from ${angka(nps.size, bh)} answers` }) });
  if (b.portal) {
    const portal = b.portal;
    const buka = b.peserta.filter((p) => portal.has(p.id)).length;
    isi.push({ label: pilih(bh, { id: "Membuka halaman peserta", en: "Opened participant page" }), nilai: `${persen(buka, b.peserta.length)}%`, ket: dari(buka, b.peserta.length, bh) });
  }
  if (b.undian?.pemenang.length) {
    const serah = b.undian.pemenang.filter((w) => w.dikonfirmasi).length;
    isi.push({ label: pilih(bh, { id: "Pemenang dikonfirmasi", en: "Winners confirmed" }), nilai: `${angka(serah, bh)} / ${angka(b.undian.pemenang.length, bh)}`, ket: pilih(bh, { id: `${angka(b.undian.pemenang.length - serah, bh)} belum`, en: `${angka(b.undian.pemenang.length - serah, bh)} not yet` }) });
  }

  const promotor = nps && skor !== null ? Math.round((([...nps.values()].filter((v) => v >= 9).length / nps.size) * 10)) : null;
  const judul =
    promotor !== null && promotor > 0
      ? pilih(bh, { id: `${pHadir}% peserta hadir, dan ${promotor} dari 10 mau merekomendasikan acara ini`, en: `${pHadir}% of participants came, and ${promotor} in 10 would recommend the event` })
      : pilih(bh, { id: `${pHadir}% peserta hadir, ${dari(b.hadir.size, b.peserta.length, bh)} orang`, en: `${pHadir}% of participants came, ${dari(b.hadir.size, b.peserta.length, bh)}` });

  return {
    ada: true,
    bobot: 0,
    temuan: null,
    slide: {
      kunci: "ringkas",
      jenis: "isi",
      saran: judul,
      tata: "penuh",
      blok: [
        { jenis: "angka", isi: isi.slice(0, 4) },
        ...(temuan.length ? [{ jenis: "teks" as const, paragraf: [], poin: temuan.map((t) => `${t.teks} (${pilih(bh, { id: "slide", en: "slide" })} ${t.slide})`) }] : []),
      ],
      kaki: pilih(bh, { id: "Temuan dipilih dari selisih terbesar di slide lain.", en: "Findings are picked from the largest gaps on the other slides." }),
    },
  };
}
