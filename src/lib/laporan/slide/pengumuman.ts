import type { BahanLaporan, PengumumanBahan } from "../bahan.ts";
import { angka, jam, namaHari, persen, pilih, tanggalLokal, type HasilSlide } from "../teks.ts";

const malam = (iso: string, offset: string) => {
  const h = Number(jam(iso, offset, "en").slice(0, 2));
  return h >= 21 || h < 6;
};

/** Pengumuman: berapa yang membaca, dan apakah jam kirim berpengaruh. */
export function slidePengumuman(b: BahanLaporan): HasilSlide {
  const bh = b.acara.bahasa;
  const nama = "Announcements";
  const daftar = (b.pengumuman ?? []).filter((p) => p.total > 0);
  if (daftar.length < 3) return { ada: false, nama, alasan: "Fewer than 3 announcements sent" };

  const pr = (p: PengumumanBahan) => persen(p.dilihat, p.total);
  const rata = Math.round(daftar.reduce((a, p) => a + pr(p), 0) / daftar.length);
  const kMalam = daftar.filter((p) => malam(p.terbit, b.acara.offset));
  const kSiang = daftar.filter((p) => !malam(p.terbit, b.acara.offset));
  const rataDari = (xs: PengumumanBahan[]) => Math.round(xs.reduce((a, p) => a + pr(p), 0) / xs.length);
  const malamRendah = kMalam.length >= 1 && kSiang.length >= 2 && rataDari(kSiang) - rataDari(kMalam) >= 10;

  // Lima baris: dua yang paling banyak dibaca dan tiga yang paling sedikit, urut waktu kirim.
  const urut = [...daftar].sort((a, c) => pr(c) - pr(a));
  const tampil = (daftar.length <= 5 ? daftar : [...urut.slice(0, 2), ...urut.slice(-3)]).sort((a, c) => a.terbit.localeCompare(c.terbit));
  const pakaiEmail = tampil.some((p) => p.emailTerkirim > 0);
  const terendah = urut[urut.length - 1];

  const judul = malamRendah
    ? pilih(bh, { id: "Pengumuman yang dikirim malam hari lebih sedikit dibaca", en: "Announcements sent at night were read by fewer people" })
    : pilih(bh, { id: `Rata-rata ${rata}% peserta membaca tiap pengumuman`, en: `On average ${rata}% of participants read each announcement` });

  return {
    ada: true,
    bobot: malamRendah ? (rataDari(kSiang) - rataDari(kMalam)) / 150 : 0,
    temuan: malamRendah
      ? pilih(bh, { id: `Pengumuman malam hari dibaca ${rataDari(kMalam)}% peserta, siang hari ${rataDari(kSiang)}%.`, en: `Night announcements reached ${rataDari(kMalam)}% of participants, daytime ones ${rataDari(kSiang)}%.` })
      : null,
    slide: {
      kunci: "pengumuman",
      jenis: "isi",
      saran: judul,
      tata: "penuh",
      blok: [
        {
          jenis: "tabel",
          kolom: [
            { label: pilih(bh, { id: "Pengumuman", en: "Announcement" }) },
            { label: pilih(bh, { id: "Dikirim", en: "Sent" }) },
            { label: pilih(bh, { id: "Dibaca", en: "Read" }), kanan: true },
            ...(pakaiEmail ? [{ label: pilih(bh, { id: "Klik di email", en: "Email clicks" }), kanan: true }] : []),
          ],
          batangSetelah: 2,
          baris: tampil.map((p) => ({
            sel: [
              p.judul,
              `${namaHari(tanggalLokal(p.terbit, b.acara.offset), bh)} ${jam(p.terbit, b.acara.offset, bh)}`,
              `${pr(p)}%`,
              ...(pakaiEmail ? [p.emailTerkirim > 0 ? `${persen(p.emailKlik, p.emailTerkirim)}%` : ""] : []),
            ],
            batang: pr(p),
            sorot: p === terendah && rata - pr(p) >= 15 ? ("masalah" as const) : null,
          })),
        },
      ],
      kaki: pilih(bh, {
        id: `${daftar.length <= 5 ? "Semua" : `${tampil.length} dari ${angka(daftar.length, bh)}`} pengumuman. Dibaca = membuka pengumuman di halaman peserta atau menekan tombol di email. Email yang hanya dibuka tidak dihitung karena iPhone membuka semua email otomatis.`,
        en: `${daftar.length <= 5 ? "All" : `${tampil.length} of ${angka(daftar.length, bh)}`} announcements. Read = opened on the participant page or tapped the email button. Email opens alone don't count because iPhones open every email automatically.`,
      }),
    },
  };
}
