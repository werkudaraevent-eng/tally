/**
 * Hotel penumpang di satu Trip, untuk panel Vehicles: "apakah semua yang naik
 * kendaraan A menginap di hotel A?".
 *
 * Hotel seseorang di sebuah Trip = hotel tempat ia tidur pada malam tanggal
 * berangkat (zona acara): stay yang check-in-nya pada atau sebelum tanggal itu
 * dan check-out-nya sesudahnya. Jadi Trip "Menuju Hotel" pada hari pindah
 * memakai hotel baru, dan Trip pagi memakai hotel tempat ia bangun. Trip pada
 * hari check-out terakhir (ke stasiun) tidak punya malam itu: dipakai hotel
 * yang ditinggalkan hari itu atau sebelumnya. Berangkat sebelum semua stay:
 * stay paling awal. Trip tanpa jam: stay pertama.
 *
 * Tanggal stay sudah efektif (milik stay, lalu hotelnya; null = tanpa batas).
 *
 * Murni, tanpa impor `@/`, supaya bisa dites dengan `node` (`hotel-kendaraan.check.ts`).
 */

import { tanggalZona } from "./stay.ts";

export type StayEfektif = { hotel_id: number; masuk: string | null; keluar: string | null };

export function hotelDiTrip(stays: StayEfektif[], berangkat: string | null, offset: string): number | null {
  if (stays.length === 0) return null;
  const urut = [...stays].sort((a, b) => (a.masuk ?? "").localeCompare(b.masuk ?? ""));
  if (!berangkat) return urut[0].hotel_id;
  const hari = tanggalZona(berangkat, offset);
  const tglMasuk = (s: StayEfektif) => (s.masuk ? tanggalZona(s.masuk, offset) : null);
  const tglKeluar = (s: StayEfektif) => (s.keluar ? tanggalZona(s.keluar, offset) : null);
  const malamItu = urut.filter((s) => (tglMasuk(s) ?? "") <= hari && (tglKeluar(s) === null || hari < (tglKeluar(s) as string)));
  if (malamItu.length > 0) return malamItu[malamItu.length - 1].hotel_id;
  const sudahKeluar = urut.filter((s) => tglKeluar(s) !== null && (tglKeluar(s) as string) <= hari);
  if (sudahKeluar.length > 0) {
    // Yang check-out paling akhir: hotel yang baru saja ditinggalkan.
    sudahKeluar.sort((a, b) => (tglKeluar(a) as string).localeCompare(tglKeluar(b) as string));
    return sudahKeluar[sudahKeluar.length - 1].hotel_id;
  }
  return urut[0].hotel_id;
}

export type KelompokHotel = { hotel_id: number | null; ids: string[] };

/**
 * Penumpang satu kendaraan di satu Trip, dikelompokkan per hotel. "Tanpa
 * hotel" (null) lebih dulu, lalu kelompok terkecil: yang menyimpang dari
 * hotel mayoritas biasanya yang perlu dicek atau dipindah.
 */
export function kelompokHotel(ids: string[], hotelOf: (id: string) => number | null): KelompokHotel[] {
  const per = new Map<number | null, string[]>();
  for (const id of ids) {
    const h = hotelOf(id);
    per.set(h, [...(per.get(h) ?? []), id]);
  }
  return [...per].map(([hotel_id, isi]) => ({ hotel_id, ids: isi })).sort((a, b) => {
    if (a.hotel_id === null) return -1;
    if (b.hotel_id === null) return 1;
    return a.ids.length - b.ids.length || a.hotel_id - b.hotel_id;
  });
}

/** Berapa hotel berbeda (tanpa "Tanpa hotel") di kelompok itu. */
export const jumlahHotel = (kelompok: KelompokHotel[]) => kelompok.filter((k) => k.hotel_id !== null).length;
