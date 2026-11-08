import type { BahanLaporan } from "../bahan.ts";
import { angka, MIN_KELOMPOK, persen, pilih, type Bahasa, type HasilSlide } from "../teks.ts";

export type BarisKelompok = { nama: string; terdaftar: number; hadir: number; lainnya: boolean };

/**
 * Peserta aktif per nilai kolom kelompok. Kelompok di bawah MIN_KELOMPOK dan
 * peserta tanpa jawaban digabung ke "Lainnya", supaya satu orang tidak
 * tampil sebagai 0% atau 100%.
 */
export function perKelompok(b: BahanLaporan, hitung: (id: string) => boolean, bahasa: Bahasa): BarisKelompok[] {
  const peta = new Map<string, { terdaftar: number; hadir: number }>();
  for (const p of b.peserta) {
    const kunci = p.kelompok ?? "";
    const isi = peta.get(kunci) ?? { terdaftar: 0, hadir: 0 };
    isi.terdaftar += 1;
    if (hitung(p.id)) isi.hadir += 1;
    peta.set(kunci, isi);
  }
  const lain = { nama: pilih(bahasa, { id: "Lainnya", en: "Other" }), terdaftar: 0, hadir: 0, lainnya: true };
  const baris: BarisKelompok[] = [];
  for (const [nama, isi] of peta) {
    if (!nama || isi.terdaftar < MIN_KELOMPOK) {
      lain.terdaftar += isi.terdaftar;
      lain.hadir += isi.hadir;
    } else baris.push({ nama, ...isi, lainnya: false });
  }
  baris.sort((a, b2) => persen(b2.hadir, b2.terdaftar) - persen(a.hadir, a.terdaftar) || b2.terdaftar - a.terdaftar);
  if (lain.terdaftar > 0) baris.push(lain);
  return baris;
}

export function slideKelompok(b: BahanLaporan): HasilSlide {
  const bh = b.acara.bahasa;
  const nama = "Attendance by group";
  if (!b.kelompokLabel) return { ada: false, nama, alasan: "Choose a column to group by" };
  if (b.hadir.size === 0) return { ada: false, nama, alasan: "No check-ins yet" };
  const baris = perKelompok(b, (id) => b.hadir.has(id), bh);
  const nyata = baris.filter((r) => !r.lainnya);
  if (nyata.length < 2) return { ada: false, nama, alasan: `Fewer than 2 groups of ${MIN_KELOMPOK}+ people in this column` };

  const total = { terdaftar: b.peserta.length, hadir: b.hadir.size };
  const absen = total.terdaftar - total.hadir;
  const atas = nyata[0];
  const bawah = nyata[nyata.length - 1];
  const selisih = persen(atas.hadir, atas.terdaftar) - persen(bawah.hadir, bawah.terdaftar);
  const absenBawah = bawah.terdaftar - bawah.hadir;
  const label = b.kelompokLabel.toLowerCase();
  const tertinggal = selisih >= 3 && absen > 0;
  const judul = tertinggal
    ? pilih(bh, {
        id: `${bawah.nama} tertinggal, ${angka(absenBawah, bh)} dari ${angka(absen, bh)} yang absen berasal dari sana`,
        en: `${bawah.nama} lags behind, ${angka(absenBawah, bh)} of the ${angka(absen, bh)} absentees come from there`,
      })
    : pilih(bh, { id: `Kehadiran merata di semua ${label}`, en: `Attendance is even across every ${label}` });

  const porsiPeserta = persen(bawah.terdaftar, total.terdaftar);
  const porsiAbsen = persen(absenBawah, absen);
  const sisi = tertinggal
    ? pilih(bh, {
        id: `${bawah.nama} ${porsiPeserta}% dari peserta, tapi ${porsiAbsen}% dari yang absen datang dari sana.`,
        en: `${bawah.nama} is ${porsiPeserta}% of participants but ${porsiAbsen}% of the absentees.`,
      })
    : pilih(bh, { id: `Selisih tertinggi dan terendah hanya ${selisih} poin.`, en: `Highest and lowest differ by only ${selisih} points.` });

  return {
    ada: true,
    bobot: selisih / 100 + (tertinggal ? porsiAbsen / 100 - porsiPeserta / 100 : 0),
    temuan: tertinggal ? pilih(bh, { id: `${bawah.nama} paling rendah kehadirannya, ${persen(bawah.hadir, bawah.terdaftar)}%.`, en: `${bawah.nama} has the lowest attendance, ${persen(bawah.hadir, bawah.terdaftar)}%.` }) : null,
    slide: {
      kunci: "kelompok",
      jenis: "isi",
      saran: judul,
      tata: "dua",
      blok: [
        {
          jenis: "tabel",
          kolom: [
            { label: b.kelompokLabel },
            { label: pilih(bh, { id: "Terdaftar", en: "On list" }), kanan: true },
            { label: pilih(bh, { id: "Hadir", en: "Attended" }), kanan: true },
            { label: pilih(bh, { id: "Absen", en: "Absent" }), kanan: true },
            { label: "%", kanan: true },
          ],
          batangSetelah: 3,
          baris: [
            ...baris.map((r) => ({
              sel: [r.nama, angka(r.terdaftar, bh), angka(r.hadir, bh), angka(r.terdaftar - r.hadir, bh), `${persen(r.hadir, r.terdaftar)}%`],
              batang: persen(r.hadir, r.terdaftar),
              sorot: tertinggal && r === bawah ? ("masalah" as const) : null,
            })),
            { sel: ["Total", angka(total.terdaftar, bh), angka(total.hadir, bh), angka(absen, bh), `${persen(total.hadir, total.terdaftar)}%`], total: true },
          ],
        },
        { jenis: "teks", paragraf: [sisi] },
      ],
      kaki: pilih(bh, {
        id: `Dikelompokkan menurut ${b.kelompokLabel}. Kelompok di bawah ${MIN_KELOMPOK} orang digabung ke Lainnya.`,
        en: `Grouped by ${b.kelompokLabel}. Groups under ${MIN_KELOMPOK} people are merged into Other.`,
      }),
    },
  };
}
