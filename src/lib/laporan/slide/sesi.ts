import type { BahanLaporan } from "../bahan.ts";
import { angka, namaHari, persen, pilih, type HasilSlide } from "../teks.ts";

const MAKS_GARIS = 8;

/** Kehadiran per sesi Agenda yang punya titik check-in, urut waktu. */
export function slideSesi(b: BahanLaporan): HasilSlide {
  const bh = b.acara.bahasa;
  const sesi = b.sesi.filter((s) => s.diharapkan > 0);
  if (sesi.length < 2) return { ada: false, nama: "Attendance by session", alasan: "Fewer than 2 check-in points linked to Agenda items" };

  const nilai = sesi.map((s) => persen(s.sudah, s.diharapkan));
  const terendah = nilai.indexOf(Math.min(...nilai));
  const min = nilai[terendah];
  const rata = Math.round(nilai.reduce((a, c) => a + c, 0) / nilai.length);
  const stabil = Math.max(...nilai) - min <= 5;
  const judul = stabil
    ? pilih(bh, { id: `Kehadiran tetap di atas ${min}% di semua sesi`, en: `Attendance stayed above ${min}% in every session` })
    : pilih(bh, { id: `Kehadiran paling rendah di ${sesi[terendah].nama}, ${min}%`, en: `Attendance was lowest at ${sesi[terendah].nama}, ${min}%` });

  const sub = (tgl: string | null) => (tgl ? namaHari(tgl, bh) : undefined);
  const kaki = sesi.some((s) => s.ambilBagasi)
    ? pilih(bh, {
        id: "Diharapkan = peserta aktif yang termasuk sasaran baris Agenda itu. Meja ambil bagasi: hanya yang menitip bagasi.",
        en: "Expected = active participants the Agenda item is shown to. Luggage pick-up: only those who left luggage.",
      })
    : pilih(bh, {
        id: "Diharapkan = peserta aktif yang termasuk sasaran baris Agenda itu.",
        en: "Expected = active participants the Agenda item is shown to.",
      });

  // Banyak sesi: tabel lebih mudah dibaca daripada garis yang padat.
  if (sesi.length > MAKS_GARIS) {
    return {
      ada: true,
      bobot: (rata - min) / 100,
      temuan: null,
      slide: {
        kunci: "sesi",
        jenis: "isi",
        saran: judul,
        tata: "penuh",
        blok: [
          {
            jenis: "tabel",
            kolom: [{ label: pilih(bh, { id: "Sesi", en: "Session" }) }, { label: pilih(bh, { id: "Hari", en: "Day" }) }, { label: pilih(bh, { id: "Diharapkan", en: "Expected" }), kanan: true }, { label: pilih(bh, { id: "Hadir", en: "Attended" }), kanan: true }, { label: "%", kanan: true }],
            batangSetelah: 3,
            baris: sesi.slice(0, 10).map((s, i) => ({
              sel: [s.nama, sub(s.tanggal) ?? "", angka(s.diharapkan, bh), angka(s.sudah, bh), `${nilai[i]}%`],
              batang: nilai[i],
              sorot: !stabil && i === terendah ? ("masalah" as const) : null,
            })),
          },
        ],
        kaki,
      },
    };
  }

  const bawah = Math.max(0, Math.floor((min - 3) / 2) * 2);
  return {
    ada: true,
    bobot: (rata - min) / 100,
    temuan: null,
    slide: {
      kunci: "sesi",
      jenis: "isi",
      saran: judul,
      tata: "penuh",
      blok: [
        {
          jenis: "garis",
          min: bawah,
          maks: 100,
          satuan: "%",
          titik: sesi.map((s, i) => ({ label: s.nama, sub: sub(s.tanggal), nilai: nilai[i], teks: `${nilai[i]}%`, masalah: !stabil && i === terendah })),
        },
      ],
      kaki: bawah > 0 ? `${kaki} ${pilih(bh, { id: `Sumbu mulai dari ${bawah}%.`, en: `Axis starts at ${bawah}%.` })}` : kaki,
    },
  };
}
