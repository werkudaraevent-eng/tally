import { menitDari } from "./hari-agenda.ts";

/** Yang dibutuhkan dari satu perjalanan bus peserta (member_logistics). */
export type TripJadwal = {
  /** null = peserta tidak naik bus di perjalanan ini. */
  bus: string | null;
  depart_at: string | null;
  /** Baris Agenda tautan perjalanan ini (migrasi 202610170002). Tidak ada atau null = tidak ditautkan. */
  rundown_item_id?: number | null;
};

/**
 * Butir Jadwal yang diberi tautan ke Perjalanan (U-08).
 *
 * Perjalanan yang ditautkan ke baris Agenda (Logistics > Trips > Agenda row)
 * menunjuk barisnya lewat id, jadi Batch 1 dan Batch 2 yang berjalan pada jam
 * yang sama tidak tertukar. Perjalanan tanpa tautan tetap dicocokkan lewat
 * tanggal dan jam yang sama seperti sebelumnya, jadi acara yang ada tidak
 * berubah. Perjalanan tanpa bus untuk peserta ini tidak ditautkan.
 *
 * `dinding` mengubah ISO menjadi tanggal dan menit di zona acara. Berkas ini
 * tanpa impor runtime selain hari-agenda supaya bisa diuji langsung oleh Node
 * (trip-jadwal.check.ts).
 */
export function pencocokBarisTrip(
  trips: readonly TripJadwal[],
  dinding: (iso: string) => { tanggal: string; menit: number },
): (tanggalBagian: string | null, item: { id: number; time: string }) => boolean {
  const idBaris = new Set<number>();
  const jam = new Set<string>();
  for (const trip of trips) {
    if (!trip.bus) continue;
    if (typeof trip.rundown_item_id === "number") {
      idBaris.add(trip.rundown_item_id);
      continue;
    }
    if (!trip.depart_at) continue;
    const waktu = dinding(trip.depart_at);
    jam.add(`${waktu.tanggal} ${waktu.menit}`);
  }
  return (tanggalBagian, item) => idBaris.has(item.id) || (tanggalBagian !== null && jam.has(`${tanggalBagian} ${menitDari(item.time)}`));
}
