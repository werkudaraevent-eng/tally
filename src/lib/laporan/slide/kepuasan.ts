import { skorNps } from "../../kilas-balik/setelan.ts";
import type { BahanLaporan } from "../bahan.ts";
import type { Blok } from "../jenis.ts";
import { angka, MIN_KELOMPOK, persen, pilih, SAMPEL_KECIL, type HasilSlide } from "../teks.ts";

const tanda = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Nilai NPS 0..10 per peserta dari pertanyaan NPS pertama Feedback. */
export function nilaiNps(b: BahanLaporan): Map<string, number> | null {
  const q = b.feedback?.pertanyaan.find((p) => p.type === "nps");
  if (!b.feedback || !q) return null;
  const hasil = new Map<string, number>();
  for (const j of b.feedback.jawaban) {
    const v = j.answers[q.key];
    if (typeof v === "number" && v >= 0 && v <= 10) hasil.set(j.participant_id, v);
  }
  return hasil;
}

/** Analisa silang: NPS x jumlah sesi diikuti, dan NPS x kelompok. */
export function slideKepuasan(b: BahanLaporan): HasilSlide {
  const bh = b.acara.bahasa;
  const nama = "Satisfaction";
  const nps = nilaiNps(b);
  if (!nps) return { ada: false, nama, alasan: "Feedback has no recommend (NPS) question" };
  if (nps.size < MIN_KELOMPOK) return { ada: false, nama, alasan: `Fewer than ${MIN_KELOMPOK} NPS answers` };
  const semua = skorNps([...nps.values()]) ?? 0;

  // Per jumlah sesi: semua, kurang satu, sisanya. Ember di bawah MIN_KELOMPOK dibuang.
  const totalSesi = b.sesi.length;
  const ember: Array<{ label: string; nilai: number[] }> = [];
  if (totalSesi >= 2) {
    const isi = [[], [], []] as number[][];
    for (const [id, v] of nps) {
      const n = b.sesiDiikuti.get(id) ?? 0;
      isi[n >= totalSesi ? 0 : n === totalSesi - 1 ? 1 : 2].push(v);
    }
    const label = [
      pilih(bh, { id: "Semua sesi", en: "Every session" }),
      pilih(bh, { id: `${totalSesi - 1} sesi`, en: `${totalSesi - 1} sessions` }),
      pilih(bh, { id: `${totalSesi - 2} sesi atau kurang`, en: `${totalSesi - 2} or fewer` }),
    ];
    isi.forEach((nilai, i) => nilai.length >= MIN_KELOMPOK && ember.push({ label: label[i], nilai }));
  }
  const skorEmber = ember.map((e) => skorNps(e.nilai) ?? 0);
  const naik = ember.length >= 2 && skorEmber.every((s, i) => i === 0 || s <= skorEmber[i - 1]) && skorEmber[0] - skorEmber[skorEmber.length - 1] >= 10;

  const blok: Blok[] = [];
  if (ember.length >= 2) {
    blok.push({
      jenis: "batang",
      arah: "datar",
      judul: pilih(bh, { id: "NPS menurut jumlah sesi yang diikuti", en: "NPS by sessions attended" }),
      maks: 100,
      seri: ember.map((e, i) => ({
        label: e.label,
        sub: `${angka(e.nilai.length, bh)} ${pilih(bh, { id: "orang", en: "people" })}${e.nilai.length < SAMPEL_KECIL ? pilih(bh, { id: ", sampel kecil", en: ", small sample" }) : ""}`,
        nilai: skorEmber[i],
        teks: tanda(skorEmber[i]),
        sorot: i === 0 ? ("utama" as const) : i === 1 ? ("kedua" as const) : null,
      })),
    });
  } else {
    const promotor = [...nps.values()].filter((v) => v >= 9).length;
    const detraktor = [...nps.values()].filter((v) => v <= 6).length;
    blok.push({
      jenis: "angka",
      isi: [
        { label: "NPS", nilai: tanda(semua), ket: pilih(bh, { id: `dari ${angka(nps.size, bh)} jawaban`, en: `from ${angka(nps.size, bh)} answers` }) },
        { label: pilih(bh, { id: "Promotor (9 sampai 10)", en: "Promoters (9 to 10)" }), nilai: `${persen(promotor, nps.size)}%`, ket: "" },
        { label: pilih(bh, { id: "Detraktor (0 sampai 6)", en: "Detractors (0 to 6)" }), nilai: `${persen(detraktor, nps.size)}%`, ket: "" },
      ],
    });
  }

  // Per kelompok, hanya kelompok dengan cukup jawaban.
  if (b.kelompokLabel) {
    const per = new Map<string, number[]>();
    for (const p of b.peserta) {
      const v = nps.get(p.id);
      if (v === undefined || !p.kelompok) continue;
      per.set(p.kelompok, [...(per.get(p.kelompok) ?? []), v]);
    }
    const baris = [...per].filter(([, v]) => v.length >= MIN_KELOMPOK).map(([g, v]) => ({ g, n: v.length, s: skorNps(v) ?? 0 })).sort((a, c) => c.s - a.s);
    if (baris.length >= 2) {
      blok.push({
        jenis: "tabel",
        kolom: [{ label: b.kelompokLabel }, { label: "NPS", kanan: true }, { label: pilih(bh, { id: "Jawaban", en: "Answers" }), kanan: true }],
        baris: baris.map((r, i) => ({ sel: [r.g, tanda(r.s), angka(r.n, bh)], sorot: i === baris.length - 1 && baris[0].s - r.s >= 15 ? ("masalah" as const) : null })),
      });
    }
  }

  const judul = naik
    ? pilih(bh, { id: "Makin banyak sesi yang diikuti, makin tinggi kepuasannya", en: "The more sessions people attended, the happier they were" })
    : pilih(bh, { id: `Skor rekomendasi acara ${tanda(semua)} dari ${angka(nps.size, bh)} jawaban`, en: `The event scored ${tanda(semua)} on recommendation from ${angka(nps.size, bh)} answers` });

  return {
    ada: true,
    bobot: naik ? (skorEmber[0] - skorEmber[skorEmber.length - 1]) / 200 : 0,
    temuan: naik ? pilih(bh, { id: `Peserta yang ikut semua sesi paling puas, NPS ${tanda(skorEmber[0])}.`, en: `People who attended every session were the happiest, NPS ${tanda(skorEmber[0])}.` }) : null,
    slide: {
      kunci: "kepuasan",
      jenis: "isi",
      saran: judul,
      tata: blok.length > 1 ? "dua" : "penuh",
      blok,
      kaki: pilih(bh, {
        id: `NPS adalah persen yang memberi nilai 9 atau 10, dikurangi persen yang memberi 0 sampai 6. Dari ${angka(nps.size, bh)} jawaban.`,
        en: `NPS is the share scoring 9 or 10 minus the share scoring 0 to 6. From ${angka(nps.size, bh)} answers.`,
      }),
    },
  };
}
