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

/**
 * Perjalanan bus peserta untuk satu baris Agenda, untuk baris bus di kartu
 * Berikutnya Beranda ("Bus 3 · 08.15", titik kumpulnya). Aturannya sama
 * dengan pencocokBarisTrip: yang ditautkan ke baris itu lebih dulu, lalu
 * perjalanan tanpa tautan di tanggal dan jam yang sama. Null bila tidak ada.
 */
export function tripUntukBaris<T extends TripJadwal>(
  trips: readonly T[],
  dinding: (iso: string) => { tanggal: string; menit: number },
  tanggalBagian: string | null,
  item: { id: number; time: string },
): T | null {
  const naik = trips.filter((trip) => trip.bus);
  const tertaut = naik.find((trip) => trip.rundown_item_id === item.id);
  if (tertaut) return tertaut;
  const menit = menitDari(item.time);
  if (tanggalBagian === null || menit === null) return null;
  return (
    naik.find((trip) => {
      if (typeof trip.rundown_item_id === "number" || !trip.depart_at) return false;
      const waktu = dinding(trip.depart_at);
      return waktu.tanggal === tanggalBagian && waktu.menit === menit;
    }) ?? null
  );
}

/**
 * Tiket kereta berikutnya untuk Beranda: yang berangkat sesudah `kini`
 * (tanggal dan menit di zona acara), dalam urutan tiketnya. Tanpa jam
 * berangkat dianggap berlaku sampai akhir harinya; tanpa tanggal dilewati.
 * Null bila semuanya sudah berangkat.
 */
export function legBerikutnya<T extends { depart_date: string | null; depart_time: string | null }>(legs: readonly T[], kini: { tanggal: string; menit: number }): T | null {
  return (
    legs.find((leg) => {
      if (!leg.depart_date) return false;
      if (leg.depart_date !== kini.tanggal) return leg.depart_date > kini.tanggal;
      const menit = menitDari(leg.depart_time);
      return menit === null || menit > kini.menit;
    }) ?? null
  );
}
