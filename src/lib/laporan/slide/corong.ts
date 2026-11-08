import type { BahanLaporan } from "../bahan.ts";
import { angka, pilih, type HasilSlide } from "../teks.ts";

/** Dari undangan sampai mengisi survei: tiap tahap yang dipakai acara, satu batang. */
export function slideCorong(b: BahanLaporan): HasilSlide {
  const bh = b.acara.bahasa;
  if (b.hadir.size === 0) return { ada: false, nama: "Invited to attended", alasan: "No check-ins yet" };
  const tahap: Array<{ label: string; nilai: number; utama?: boolean; akhir?: boolean }> = [];
  if (b.diundang !== null) tahap.push({ label: pilih(bh, { id: "Diundang", en: "Invited" }), nilai: b.diundang });
  if (b.mendaftar !== null) tahap.push({ label: pilih(bh, { id: "Mendaftar", en: "Registered" }), nilai: b.mendaftar });
  tahap.push({ label: pilih(bh, { id: "Terdaftar", en: "On the list" }), nilai: b.peserta.length });
  if (b.portal) {
    const portal = b.portal;
    tahap.push({ label: pilih(bh, { id: "Buka halaman", en: "Opened page" }), nilai: b.peserta.filter((p) => portal.has(p.id)).length });
  }
  tahap.push({ label: pilih(bh, { id: "Hadir", en: "Attended" }), nilai: b.hadir.size, utama: true });
  if (b.feedback) tahap.push({ label: pilih(bh, { id: "Isi survei", en: "Answered survey" }), nilai: b.feedback.jawaban.length, akhir: true });

  // Penurunan terbesar sebelum Hadir: itulah temuannya.
  let turun = { dari: "", ke: "", jumlah: 0 };
  const sampaiHadir = tahap.findIndex((t) => t.utama);
  for (let i = 1; i <= sampaiHadir; i++) {
    const jumlah = tahap[i - 1].nilai - tahap[i].nilai;
    if (jumlah > turun.jumlah) turun = { dari: tahap[i - 1].label, ke: tahap[i].label, jumlah };
  }
  const tidakHadir = b.peserta.length - b.hadir.size;
  const judul =
    b.diundang !== null && b.mendaftar !== null && turun.dari === tahap[0].label && turun.jumlah > tidakHadir
      ? pilih(bh, { id: `${angka(turun.jumlah, bh)} orang yang diundang tidak pernah mendaftar`, en: `${angka(turun.jumlah, bh)} invited people never registered` })
      : pilih(bh, { id: `${angka(b.hadir.size, bh)} dari ${angka(b.peserta.length, bh)} peserta terdaftar datang ke acara`, en: `${angka(b.hadir.size, bh)} of ${angka(b.peserta.length, bh)} people on the list came` });

  const maks = Math.max(...tahap.map((t) => t.nilai), 1);
  return {
    ada: true,
    bobot: tahap[0].nilai > 0 ? turun.jumlah / tahap[0].nilai : 0,
    temuan: null,
    slide: {
      kunci: "corong",
      jenis: "isi",
      saran: judul,
      tata: "penuh",
      blok: [
        {
          jenis: "batang",
          arah: "tegak",
          maks,
          seri: tahap.map((t) => ({ label: t.label, nilai: t.nilai, teks: angka(t.nilai, bh), sorot: t.utama ? "utama" : t.akhir ? "kedua" : null })),
        },
      ],
      kaki: pilih(bh, { id: "Hadir berarti pernah di-scan di salah satu titik check-in.", en: "Attended means scanned at least once at any check-in point." }),
    },
  };
}
