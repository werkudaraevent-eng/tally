import type { BahanLaporan } from "../bahan.ts";
import type { Blok } from "../jenis.ts";
import { angka, MIN_KELOMPOK, persen, pilih, type HasilSlide } from "../teks.ts";

/** Undian dan voting: sebaran pemenang dibanding sebaran yang hadir per kelompok. */
export function slideUndian(b: BahanLaporan): HasilSlide {
  const bh = b.acara.bahasa;
  const nama = "Lucky draw and voting";
  const pemenang = b.undian?.pemenang ?? [];
  if (pemenang.length === 0 && !b.voting?.pemilih) return { ada: false, nama, alasan: "No lucky draw winners or votes" };

  const blok: Blok[] = [];
  let merata: boolean | null = null;
  let label = "";
  if (b.kelompokLabel && pemenang.length >= MIN_KELOMPOK) {
    const kelompokOf = new Map(b.peserta.map((p) => [p.id, p.kelompok]));
    const hadirPer = new Map<string, number>();
    for (const id of b.hadir) {
      const g = kelompokOf.get(id);
      if (g) hadirPer.set(g, (hadirPer.get(g) ?? 0) + 1);
    }
    const menangPer = new Map<string, number>();
    for (const w of pemenang) {
      const g = w.participant_id ? kelompokOf.get(w.participant_id) : null;
      if (g) menangPer.set(g, (menangPer.get(g) ?? 0) + 1);
    }
    const totalHadir = [...hadirPer.values()].reduce((a, c) => a + c, 0);
    const totalMenang = [...menangPer.values()].reduce((a, c) => a + c, 0);
    const baris = [...hadirPer]
      .filter(([, n]) => n >= MIN_KELOMPOK)
      .map(([g, n]) => ({ g, hadir: persen(n, totalHadir), menang: persen(menangPer.get(g) ?? 0, totalMenang) }))
      .sort((a, c) => c.hadir - a.hadir)
      .slice(0, 6);
    if (baris.length >= 2 && totalMenang > 0) {
      const selisih = Math.max(...baris.map((r) => Math.abs(r.menang - r.hadir)));
      merata = selisih <= 5;
      label = b.kelompokLabel.toLowerCase();
      blok.push({
        jenis: "batang",
        arah: "datar",
        maks: Math.max(...baris.flatMap((r) => [r.hadir, r.menang]), 1),
        legenda: [pilih(bh, { id: "Porsi peserta hadir", en: "Share of attendees" }), pilih(bh, { id: "Porsi pemenang", en: "Share of winners" })],
        seri: baris.map((r) => ({ label: r.g, nilai: r.hadir, teks: `${r.hadir}%`, sorot: null })),
        pasangan: baris.map((r) => ({ nilai: r.menang, teks: `${r.menang}%` })),
      });
    }
  }

  const angkaIsi = [];
  if (pemenang.length) {
    const serah = pemenang.filter((w) => w.dikonfirmasi).length;
    angkaIsi.push({ label: pilih(bh, { id: "Pemenang dikonfirmasi", en: "Winners confirmed" }), nilai: `${angka(serah, bh)} / ${angka(pemenang.length, bh)}`, ket: pilih(bh, { id: `dari ${angka(pemenang.length, bh)} pemenang`, en: `of ${angka(pemenang.length, bh)} winners` }) });
  }
  if (b.voting?.pemilih) {
    const p = persen(b.voting.pemilih, Math.max(b.hadir.size, 1));
    angkaIsi.push({ label: pilih(bh, { id: "Ikut live voting", en: "Took part in live voting" }), nilai: `${Math.min(p, 100)}%`, ket: pilih(bh, { id: `${angka(b.voting.pemilih, bh)} orang, ${b.voting.pertanyaan} pertanyaan`, en: `${angka(b.voting.pemilih, bh)} people, ${b.voting.pertanyaan} questions` }) });
  }
  blok.push({ jenis: "angka", isi: angkaIsi });

  const judul =
    merata === true
      ? pilih(bh, { id: `Pemenang undian tersebar merata antar ${label}`, en: `Lucky draw winners are spread evenly across every ${label}` })
      : merata === false
        ? pilih(bh, { id: `Sebaran pemenang undian tidak sama dengan sebaran kehadiran per ${label}`, en: `Winners are not spread like attendance across ${label}` })
        : pemenang.length
          ? pilih(bh, { id: `${angka(pemenang.length, bh)} hadiah undian dibagikan`, en: `${angka(pemenang.length, bh)} lucky draw prizes awarded` })
          : pilih(bh, { id: `${angka(b.voting?.pemilih ?? 0, bh)} peserta ikut live voting`, en: `${angka(b.voting?.pemilih ?? 0, bh)} people took part in live voting` });

  return {
    ada: true,
    bobot: merata === false ? 0.2 : 0,
    temuan: null,
    slide: {
      kunci: "undian",
      jenis: "isi",
      saran: judul,
      tata: blok.length > 1 ? "dua" : "penuh",
      blok,
      kaki: merata === null
        ? pilih(bh, { id: "Pemenang cadangan dan yang ditolak tidak dihitung.", en: "Backup and rejected winners are not counted." })
        : pilih(bh, { id: "Ini cek sebaran, bukan uji keacakan. Pemenang cadangan dan yang ditolak tidak dihitung.", en: "This checks the spread, it is not a randomness test. Backup and rejected winners are not counted." }),
    },
  };
}
