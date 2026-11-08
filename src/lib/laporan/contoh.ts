/**
 * Acara contoh untuk tes dan render uji: 200 peserta palsu, 3 sesi Agenda,
 * Feedback NPS, pengumuman, undian dan logistik. Tanpa data asli siapa pun.
 */
import type { BahanLaporan, SesiBahan } from "./bahan.ts";

let benih = 7;
const acak = () => ((benih = (benih * 48271) % 2147483647) / 2147483647);
const id = (i: number) => `p${String(i).padStart(4, "0")}`;
const kelompok = ["Divisi A", "Divisi B", "Divisi C", "Divisi D"];

export function bahanContoh(ubah: Partial<BahanLaporan> = {}): BahanLaporan {
  benih = 7;
  const peserta = Array.from({ length: 200 }, (_, i) => ({ id: id(i), kelompok: i < 196 ? kelompok[i % 4] : "Tamu", jawaban: { batch: i % 2 ? "Batch 1" : "Batch 2" } }));
  const hadir = new Set(peserta.filter((_, i) => i % 10 !== 0).map((p) => p.id));
  const sesiDiikuti = new Map<string, number>();
  const sesi: SesiBahan[] = ["2026-11-06", "2026-11-07", "2026-11-08"].map((tanggal, k) => {
    const datang: string[] = [];
    for (const p of hadir) {
      if (acak() < 0.15 * k) continue;
      sesiDiikuti.set(p, (sesiDiikuti.get(p) ?? 0) + 1);
      // Datang 0 sampai 80 menit sebelum jam 08.00 WIB.
      datang.push(new Date(Date.parse(`${tanggal}T08:00:00+07:00`) - Math.floor(acak() * 80) * 60000).toISOString());
    }
    return { nama: `Sesi ${k + 1}`, tanggal, jam: "08:00", diharapkan: 200, sudah: datang.length, datang };
  });
  const jawaban = [...hadir].slice(0, 120).map((p, i) => ({ participant_id: p, answers: { rekomen: (sesiDiikuti.get(p) ?? 0) >= 3 ? 9 + (i % 2) : 5 + (i % 4), suka: i % 3 ? "Makanan" : "Pembicara" } }));
  return {
    acara: { nama: "Acara Contoh", tempat: "Gedung Contoh", mulai: "2026-11-06", selesai: "2026-11-08", bahasa: "id", offset: "+07:00", zona: "WIB", warna: "#1F5FAD", logo: null },
    sekarang: "2026-11-09T03:00:00.000Z",
    diundang: 260,
    mendaftar: 214,
    disetujui: 200,
    peserta,
    kelompokLabel: "Divisi",
    pilihanDaftar: [{ kunci: "batch", label: "Batch", opsi: ["Batch 1", "Batch 2"] }],
    portal: new Set(peserta.filter((_, i) => i % 3 !== 0).map((p) => p.id)),
    hadir,
    sesiDiikuti,
    sesi,
    semuaSesi: sesi,
    feedback: {
      pertanyaan: [
        { key: "rekomen", type: "nps", title: "Rekomendasi", required: false },
        { key: "suka", type: "choice", title: "Bagian favorit", options: ["Makanan", "Pembicara", "Tempat"], required: false },
      ],
      jawaban,
    },
    pengumuman: [
      { judul: "Jadwal bus", terbit: "2026-11-06T13:00:00.000Z", total: 200, dilihat: 80, emailTerkirim: 200, emailKlik: 40 },
      { judul: "Dress code", terbit: "2026-11-07T02:00:00.000Z", total: 200, dilihat: 150, emailTerkirim: 0, emailKlik: 0 },
      { judul: "Titik kumpul", terbit: "2026-11-07T05:00:00.000Z", total: 200, dilihat: 160, emailTerkirim: 0, emailKlik: 0 },
    ],
    undian: { slot: 20, pemenang: Array.from({ length: 20 }, (_, i) => ({ participant_id: id(i * 7 + 1), dikonfirmasi: i < 18 })) },
    voting: null,
    logistik: { hotel: 2, kamar: 100, kendaraan: 6, trip: 12, tas: 150, tasKembali: 148 },
    ...ubah,
  };
}

