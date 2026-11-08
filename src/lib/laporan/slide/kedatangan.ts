import type { BahanLaporan, SesiBahan } from "../bahan.ts";
import { angka, jam, namaHari, persen, pilih, type HasilSlide } from "../teks.ts";

const LANGKAH = 15 * 60000;
const MIN_ORANG = 30;

/** Waktu mulai sesi (ISO UTC) dari tanggal dan jam Agenda di zona acara. */
export function mulaiSesi(s: Pick<SesiBahan, "tanggal" | "jam">, offset: string): number | null {
  if (!s.tanggal || !s.jam) return null;
  const t = Date.parse(`${s.tanggal}T${s.jam.slice(0, 5)}:00${offset}`);
  return Number.isFinite(t) ? t : null;
}

/** Kedatangan per 15 menit di sesi yang paling padat, dengan garis jam mulai. */
export function slideKedatangan(b: BahanLaporan): HasilSlide {
  const bh = b.acara.bahasa;
  const nama = "Arrivals";
  const calon = b.sesi
    .map((s) => ({ s, mulai: mulaiSesi(s, b.acara.offset) }))
    .filter((c): c is { s: SesiBahan; mulai: number } => c.mulai !== null && c.s.datang.length >= MIN_ORANG);
  if (calon.length === 0) return { ada: false, nama, alasan: `No Agenda-linked check-in point with ${MIN_ORANG}+ arrivals` };

  // Sesi dengan kedatangan paling rapat dalam satu jam sebelum mulai.
  const padat = (c: { s: SesiBahan; mulai: number }) => c.s.datang.filter((t) => { const x = Date.parse(t); return x >= c.mulai - 3600000 && x < c.mulai; }).length;
  const pilihan = calon.reduce((a, c) => (padat(c) > padat(a) ? c : a));
  const { s, mulai } = pilihan;

  // Ember 15 menit dari 90 menit sebelum mulai sampai 30 menit sesudahnya.
  const awal = mulai - 6 * LANGKAH;
  const ember = Array.from({ length: 8 }, (_, i) => ({ dari: awal + i * LANGKAH, n: 0 }));
  let telat = 0;
  for (const t of s.datang) {
    const x = Date.parse(t);
    if (x >= mulai) telat += 1;
    const i = Math.floor((x - awal) / LANGKAH);
    if (i >= 0 && i < ember.length) ember[i].n += 1;
  }
  const sebelum = ember.slice(0, 6);
  const puncak = sebelum.reduce((a, c) => (c.n > a.n ? c : a));
  if (puncak.n === 0) return { ada: false, nama, alasan: "Nobody checked in before the session started" };
  const terakhir30 = ember[4].n + ember[5].n;
  const pTerakhir = persen(terakhir30, s.datang.length);
  const hari = s.tanggal ? namaHari(s.tanggal, bh) : "";
  const jamMulai = jam(new Date(mulai).toISOString(), b.acara.offset, bh);

  const judul =
    puncak === ember[5]
      ? pilih(bh, { id: `${angka(puncak.n, bh)} orang datang di 15 menit terakhir sebelum ${s.nama} dimulai`, en: `${angka(puncak.n, bh)} people arrived in the last 15 minutes before ${s.nama}` })
      : pilih(bh, { id: `Kedatangan paling ramai pukul ${jam(new Date(puncak.dari).toISOString(), b.acara.offset, bh)}, ${angka(puncak.n, bh)} orang dalam 15 menit`, en: `Arrivals peaked at ${jam(new Date(puncak.dari).toISOString(), b.acara.offset, bh)}, ${angka(puncak.n, bh)} people in 15 minutes` });

  return {
    ada: true,
    bobot: pTerakhir >= 40 ? pTerakhir / 150 : 0,
    temuan: pTerakhir >= 40
      ? pilih(bh, { id: `${pTerakhir}% peserta datang di 30 menit terakhir sebelum ${s.nama}.`, en: `${pTerakhir}% of people arrived in the last 30 minutes before ${s.nama}.` })
      : null,
    slide: {
      kunci: "kedatangan",
      jenis: "isi",
      saran: judul,
      tata: "dua",
      blok: [
        {
          jenis: "batang",
          arah: "tegak",
          maks: Math.max(...ember.map((e) => e.n), 1),
          penanda: { setelah: 5, label: pilih(bh, { id: `${jamMulai} jadwal mulai`, en: `${jamMulai} scheduled start` }) },
          seri: ember.map((e) => ({
            label: jam(new Date(e.dari).toISOString(), b.acara.offset, bh),
            nilai: e.n,
            teks: e === puncak ? angka(e.n, bh) : "",
            sorot: e === puncak ? ("utama" as const) : null,
          })),
        },
        {
          jenis: "teks",
          paragraf: [
            pilih(bh, { id: `${pTerakhir}% peserta, ${angka(terakhir30, bh)} orang, datang di setengah jam terakhir.`, en: `${pTerakhir}% of people, ${angka(terakhir30, bh)}, arrived in the last half hour.` }),
          ],
          kecil: [pilih(bh, { id: `${angka(telat, bh)} orang datang setelah pukul ${jamMulai}.`, en: `${angka(telat, bh)} people arrived after ${jamMulai}.` })],
        },
      ],
      kaki: pilih(bh, {
        id: `Orang yang di-scan per 15 menit di ${s.nama}, ${hari}. ${angka(s.datang.length, bh)} orang.`,
        en: `People scanned per 15 minutes at ${s.nama}, ${hari}. ${angka(s.datang.length, bh)} people.`,
      }),
    },
  };
}
