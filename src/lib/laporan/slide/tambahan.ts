import type { BahanLaporan } from "../bahan.ts";
import type { BarisUsulan, SlideTambahan } from "../config.ts";
import { angka, persen, pilih, type HasilSlide, type SlideHitung } from "../teks.ts";

const MAKS_OPSI = 8;

/** Slide usulan: tabel yang ditulis panitia. Kosong = petunjuk, dan tidak ikut diekspor. */
export function slideUsulan(b: BahanLaporan, usulan: BarisUsulan[]): HasilSlide {
  const bh = b.acara.bahasa;
  const judul = pilih(bh, { id: "Yang perlu diubah di acara berikutnya", en: "What to change next time" });
  return {
    ada: true,
    bobot: 0,
    temuan: null,
    slide: {
      kunci: "usulan",
      jenis: "isi",
      saran: judul,
      tata: "penuh",
      blok: usulan.length
        ? [
            {
              jenis: "tabel",
              kolom: [{ label: pilih(bh, { id: "Yang terjadi", en: "What happened" }) }, { label: pilih(bh, { id: "Datanya", en: "The data" }) }, { label: pilih(bh, { id: "Usulan panitia", en: "Committee proposal" }) }],
              baris: usulan.map((u) => ({ sel: [u.terjadi, u.data, u.usulan] })),
            },
          ]
        : [],
      kaki: pilih(bh, { id: "Ditulis panitia.", en: "Written by the committee." }),
    },
  };
}

/** Slide yang ditambahkan panitia: grafik dari satu pertanyaan pilihan, atau slide teks. */
export function slideTambahan(b: BahanLaporan, t: SlideTambahan): SlideHitung | null {
  const bh = b.acara.bahasa;
  if (t.jenis === "teks") {
    return { kunci: t.id, jenis: "isi", saran: t.judul || pilih(bh, { id: "Catatan panitia", en: "Committee notes" }), tata: "penuh", blok: t.poin.length ? [{ jenis: "teks", paragraf: [], poin: t.poin }] : [], kaki: pilih(bh, { id: "Ditulis panitia.", en: "Written by the committee." }) };
  }

  let judulPertanyaan = "";
  let hitungan = new Map<string, number>();
  let penjawab = 0;
  let ganda = false;
  if (t.sumber === "daftar") {
    const q = b.pilihanDaftar.find((p) => p.kunci === t.kunci);
    if (!q) return null;
    judulPertanyaan = q.label;
    hitungan = new Map(q.opsi.map((o) => [o, 0]));
    for (const p of b.peserta) {
      const v = p.jawaban[t.kunci];
      if (!v) continue;
      penjawab += 1;
      hitungan.set(v, (hitungan.get(v) ?? 0) + 1);
    }
  } else {
    const q = b.feedback?.pertanyaan.find((p) => p.key === t.kunci && p.type === "choice");
    if (!q || !b.feedback) return null;
    judulPertanyaan = q.title;
    ganda = (q.max ?? 1) > 1;
    hitungan = new Map((q.options ?? []).map((o) => [o, 0]));
    for (const j of b.feedback.jawaban) {
      const v = j.answers[t.kunci];
      const daftar = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : [];
      if (!daftar.length) continue;
      penjawab += 1;
      for (const x of daftar) hitungan.set(x, (hitungan.get(x) ?? 0) + 1);
    }
  }

  const seri = [...hitungan].sort((a, c) => c[1] - a[1]).slice(0, MAKS_OPSI);
  const atas = seri[0];
  const saran =
    penjawab > 0 && atas
      ? pilih(bh, { id: `${atas[0]} paling banyak dipilih, ${persen(atas[1], penjawab)}%`, en: `${atas[0]} was picked most, ${persen(atas[1], penjawab)}%` })
      : judulPertanyaan;
  return {
    kunci: t.id,
    jenis: "isi",
    saran,
    tata: "penuh",
    blok: [
      {
        jenis: "batang",
        arah: "datar",
        maks: 100,
        seri: seri.map(([o, n], i) => ({ label: o, nilai: persen(n, Math.max(penjawab, 1)), teks: `${persen(n, Math.max(penjawab, 1))}%`, sorot: i === 0 ? ("utama" as const) : null })),
      },
      ...(ganda ? [{ jenis: "teks" as const, paragraf: [], kecil: [pilih(bh, { id: "Peserta boleh memilih lebih dari satu jawaban.", en: "People could pick more than one answer." })] }] : []),
    ],
    kaki: pilih(bh, { id: `Pertanyaan "${judulPertanyaan}", ${angka(penjawab, bh)} jawaban.`, en: `Question "${judulPertanyaan}", ${angka(penjawab, bh)} answers.` }),
  };
}
