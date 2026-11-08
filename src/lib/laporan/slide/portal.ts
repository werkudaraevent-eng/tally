import type { BahanLaporan } from "../bahan.ts";
import { angka, MIN_KELOMPOK, persen, pilih, SAMPEL_KECIL, type HasilSlide } from "../teks.ts";

/** Analisa silang: pernah membuka halaman peserta x hadir. */
export function slidePortal(b: BahanLaporan): HasilSlide {
  const bh = b.acara.bahasa;
  const nama = "Participant area and attendance";
  if (!b.portal) return { ada: false, nama, alasan: "This event has no participant area" };
  if (b.hadir.size === 0) return { ada: false, nama, alasan: "No check-ins yet" };
  const portal = b.portal;
  const buka = { n: 0, absen: 0 };
  const tidak = { n: 0, absen: 0 };
  for (const p of b.peserta) {
    const g = portal.has(p.id) ? buka : tidak;
    g.n += 1;
    if (!b.hadir.has(p.id)) g.absen += 1;
  }
  if (buka.n < MIN_KELOMPOK || tidak.n < MIN_KELOMPOK) {
    return { ada: false, nama, alasan: `Fewer than ${MIN_KELOMPOK} participants on one side (opened or never opened)` };
  }
  const pBuka = persen(buka.absen, buka.n);
  const pTidak = persen(tidak.absen, tidak.n);
  const beda = pTidak >= pBuka * 2 && pTidak - pBuka >= 10;
  const judul = beda
    ? pilih(bh, { id: `Yang tak pernah membuka halaman peserta, ${pTidak}% tidak datang`, en: `Of those who never opened the participant page, ${pTidak}% didn't come` })
    : pilih(bh, { id: "Kehadiran mirip, baik yang membuka halaman peserta maupun tidak", en: "Attendance is similar whether or not people opened the participant page" });
  const kecil = tidak.n < SAMPEL_KECIL;

  return {
    ada: true,
    bobot: beda ? (pTidak - pBuka) / 100 : 0,
    temuan: beda
      ? pilih(bh, { id: `Yang tak pernah membuka halaman peserta jauh lebih sering absen, ${pTidak}% dibanding ${pBuka}%.`, en: `People who never opened the participant page were absent far more often, ${pTidak}% against ${pBuka}%.` })
      : null,
    slide: {
      kunci: "portal",
      jenis: "isi",
      saran: judul,
      tata: "dua",
      blok: [
        {
          jenis: "angka",
          isi: [
            { label: pilih(bh, { id: `Pernah membuka, ${angka(buka.n, bh)} orang`, en: `Opened it, ${angka(buka.n, bh)} people` }), nilai: `${pBuka}%`, ket: pilih(bh, { id: `absen, ${angka(buka.absen, bh)} orang`, en: `absent, ${angka(buka.absen, bh)} people` }) },
            { label: pilih(bh, { id: `Tidak pernah membuka, ${angka(tidak.n, bh)} orang`, en: `Never opened it, ${angka(tidak.n, bh)} people` }), nilai: `${pTidak}%`, ket: pilih(bh, { id: `absen, ${angka(tidak.absen, bh)} orang`, en: `absent, ${angka(tidak.absen, bh)} people` }), masalah: beda },
          ],
        },
        {
          jenis: "teks",
          paragraf: beda
            ? [pilih(bh, { id: "Peserta yang belum membuka halaman peserta menjelang acara bisa dihubungi langsung.", en: "People who haven't opened the participant page before the event can be called directly." })]
            : [pilih(bh, { id: "Membuka halaman peserta tidak membedakan siapa yang datang di acara ini.", en: "Opening the participant page made no clear difference to who came." })],
          kecil: kecil
            ? [pilih(bh, { id: `Kelompok kedua hanya ${angka(tidak.n, bh)} orang, jadi angka ini cukup jadi tanda, belum jadi kesimpulan.`, en: `The second group is only ${angka(tidak.n, bh)} people, so treat this as a signal, not a conclusion.` })]
            : undefined,
        },
      ],
      kaki: pilih(bh, { id: "Membuka berarti pernah login ke halaman peserta minimal sekali.", en: "Opened means signed in to the participant page at least once." }),
    },
  };
}
