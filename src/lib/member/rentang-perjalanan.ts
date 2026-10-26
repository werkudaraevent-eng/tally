/**
 * Tanggal di kartu perjalanan Beranda Horizon: tanggal acara, dilebarkan oleh
 * perjalanan peserta sendiri (stay hotel, tiket kereta, perjalanan bus yang
 * dinaikinya). Batch yang tiba sehari lebih awal melihat "5–8 November",
 * bukan tanggal acara "6–8 November", seperti kartu trip di aplikasi maskapai
 * dan Trip.com yang menulis tanggal perjalanan orangnya.
 *
 * Hanya melebarkan, tidak pernah menyempitkan: data yang baru sebagian (mis.
 * tiket berangkat saja) tidak membuat kartunya menulis satu hari. Semua
 * tanggal "YYYY-MM-DD" di zona acara, jadi cukup dibandingkan sebagai teks.
 *
 * Tanpa impor supaya bisa diuji langsung oleh Node (rentang-perjalanan.check.ts).
 */
export type RentangPerjalanan = { mulai: string; selesai: string; berbeda: boolean };

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export function rentangPerjalanan(
  acara: { mulai: string | null; selesai: string | null },
  tanggalPeserta: ReadonlyArray<string | null | undefined>,
): RentangPerjalanan | null {
  if (!acara.mulai || !TANGGAL.test(acara.mulai)) return null;
  const selesaiAcara = acara.selesai && TANGGAL.test(acara.selesai) && acara.selesai >= acara.mulai ? acara.selesai : acara.mulai;
  let mulai = acara.mulai;
  let selesai = selesaiAcara;
  for (const tanggal of tanggalPeserta) {
    if (!tanggal || !TANGGAL.test(tanggal)) continue;
    if (tanggal < mulai) mulai = tanggal;
    if (tanggal > selesai) selesai = tanggal;
  }
  return { mulai, selesai, berbeda: mulai !== acara.mulai || selesai !== selesaiAcara };
}
