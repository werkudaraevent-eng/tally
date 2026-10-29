/**
 * Rekap Logistics per tanggal (tab Rooms dan Vehicles, tampilan "By date").
 *
 * Kamar: hotel menagih per kamar per malam (room-night) dan menyusun rooming
 * list per periode menginap, jadi rekapnya dua: per malam (kamar terpakai,
 * tamu, tamu tanpa kamar) dan per periode (check-in sampai check-out).
 * Tanggal stay mengikuti `tanggalStay`: milik stay sendiri, lalu hotelnya,
 * sama dengan portal peserta. Kamar dihitung dari kamar yang sudah ada di
 * Logistics, bernomor atau baru berlabel (rooming list, migrasi 202610290001),
 * jadi selama nomor menyusul angkanya tetap jujur: tamu tanpa kamar disebut
 * sendiri, bukan disamarkan sebagai 0 kamar.
 *
 * Kendaraan: penumpang tiap kendaraan di tiap Trip dari `transport_overview`
 * (angka yang sama dengan pemeriksa kapasitas di database), dan yang belum
 * punya kendaraan di Trip yang mengikuti kendaraan utama dari `petaKendaraan`.
 *
 * Murni, tanpa impor `@/`, supaya bisa dites dengan `node` (`rekap.check.ts`).
 */

import { kurangKendaraan, petaKendaraan, urutTripKendaraan, type BarisAngkut, type TripKendaraan } from "./kendaraan-trip.ts";
import { tanggalStay, tanggalZona, type Stay, type TanggalHotel } from "./stay.ts";

/** "2026-11-06" ditambah n hari. */
export function geserTanggal(tanggal: string, n: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Selisih hari dua tanggal "2026-11-05" ke "2026-11-08" = 3. */
export function selisihHari(dari: string, sampai: string): number {
  return Math.round((Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86400000);
}

export type AngkaMalam = { kamar: number; tamu: number; tanpaKamar: number };

export type PeriodeInap = {
  /** Tanggal di zona acara; null = stay tanpa tanggal (hotel belum punya tanggal). */
  masuk: string | null;
  keluar: string | null;
  /** Null bila tanggalnya belum lengkap; 0 bila check-out tidak sesudah check-in. */
  malam: number | null;
  kamar: number;
  tamu: number;
  tanpaKamar: number;
};

export type RekapHotel<H> = {
  hotel: H;
  /** Sejajar dengan `RekapInap.malam`. */
  perMalam: AngkaMalam[];
  roomNights: number;
  periode: PeriodeInap[];
  /** Orang berbeda di hotel ini (yang pindah kamar dihitung sekali). */
  tamu: number;
};

export type RekapInap<H> = {
  /** Malam yang punya tamu di salah satu hotel, berurutan dan tanpa lubang. */
  malam: string[];
  hotel: Array<RekapHotel<H>>;
  total: AngkaMalam[];
  roomNights: number;
};

/** Batas kolom malam: acara lebih panjang dari ini hampir pasti tanggalnya salah ketik. */
export const MALAM_MAKS = 62;

export function rekapInap<H extends TanggalHotel>(hotels: H[], lodging: Stay[], aktif: Set<string>, offset: string): RekapInap<H> {
  const hotelById = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const stays = lodging.filter((stay) => aktif.has(stay.participant_id) && hotelById.has(stay.hotel_id)).map((stay) => {
    const t = tanggalStay(stay, hotelById.get(stay.hotel_id));
    return {
      stay,
      masuk: t.masuk === null || t.keluar === null ? null : tanggalZona(t.masuk, offset),
      keluar: t.masuk === null || t.keluar === null ? null : tanggalZona(t.keluar, offset),
    };
  });

  let awal: string | null = null;
  let akhir: string | null = null;
  for (const { masuk, keluar } of stays) {
    if (masuk === null || keluar === null || keluar <= masuk) continue;
    if (awal === null || masuk < awal) awal = masuk;
    if (akhir === null || keluar > akhir) akhir = keluar;
  }
  const malam: string[] = [];
  if (awal !== null && akhir !== null) {
    const n = Math.min(selisihHari(awal, akhir), MALAM_MAKS);
    for (let i = 0; i < n; i += 1) malam.push(geserTanggal(awal, i));
  }
  const indeks = new Map(malam.map((tanggal, i) => [tanggal, i]));

  const kosong = () => malam.map(() => ({ kamar: new Set<number>(), tamu: new Set<string>(), tanpaKamar: new Set<string>() }));
  const totalSet = kosong();
  const hasil = hotels.map((hotel) => {
    const milik = stays.filter((x) => x.stay.hotel_id === hotel.id);
    const set = kosong();
    const kelompok = new Map<string, { masuk: string | null; keluar: string | null; kamar: Set<number>; tamu: Set<string>; tanpaKamar: Set<string> }>();
    for (const { stay, masuk, keluar } of milik) {
      const kunci = `${masuk ?? ""}|${keluar ?? ""}`;
      const g = kelompok.get(kunci) ?? { masuk, keluar, kamar: new Set<number>(), tamu: new Set<string>(), tanpaKamar: new Set<string>() };
      g.tamu.add(stay.participant_id);
      if (stay.room_id === null) g.tanpaKamar.add(stay.participant_id);
      else g.kamar.add(stay.room_id);
      kelompok.set(kunci, g);
      if (masuk === null || keluar === null) continue;
      for (let d = masuk; d < keluar; d = geserTanggal(d, 1)) {
        const i = indeks.get(d);
        if (i === undefined) break;
        for (const s of [set[i], totalSet[i]]) {
          s.tamu.add(stay.participant_id);
          if (stay.room_id === null) s.tanpaKamar.add(stay.participant_id);
          else s.kamar.add(stay.room_id);
        }
      }
    }
    const perMalam = set.map((s) => ({ kamar: s.kamar.size, tamu: s.tamu.size, tanpaKamar: s.tanpaKamar.size }));
    const periode = [...kelompok.values()]
      .map((g) => ({
        masuk: g.masuk,
        keluar: g.keluar,
        malam: g.masuk === null || g.keluar === null ? null : Math.max(0, selisihHari(g.masuk, g.keluar)),
        kamar: g.kamar.size,
        tamu: g.tamu.size,
        tanpaKamar: g.tanpaKamar.size,
      }))
      // Urut tanggal masuk lalu keluar; tanpa tanggal di akhir.
      .sort((a, b) => (a.masuk ?? "~").localeCompare(b.masuk ?? "~") || (a.keluar ?? "~").localeCompare(b.keluar ?? "~"));
    return {
      hotel,
      perMalam,
      roomNights: perMalam.reduce((n, m) => n + m.kamar, 0),
      periode,
      tamu: new Set(milik.map((x) => x.stay.participant_id)).size,
    };
  });
  const total = totalSet.map((s) => ({ kamar: s.kamar.size, tamu: s.tamu.size, tanpaKamar: s.tanpaKamar.size }));
  return { malam, hotel: hasil, total, roomNights: total.reduce((n, m) => n + m.kamar, 0) };
}

export type BarisMuatan = { trip_id: number; vehicle_id: number; load: number; over_capacity: boolean };
export type KendaraanRekap = { id: number; code: string; capacity: number | null };

export type KolomTrip<T> = {
  trip: T;
  total: number;
  /** Kendaraan yang dipakai (isi lebih dari 0). */
  kendaraan: number;
  /** Peserta yang belum punya kendaraan di Trip ini (Trip yang mengikuti kendaraan utama). */
  tanpa: number;
};

export type HariTrip<T> = { tanggal: string | null; trips: Array<KolomTrip<T>> };

export type RekapKendaraan<T, V> = {
  hari: Array<HariTrip<T>>;
  /** Urut nama alami: BUS 2 sebelum BUS 10. */
  kendaraan: V[];
  isi: (vehicleId: number, tripId: number) => { load: number; lebih: boolean };
};

export function rekapKendaraan<T extends TripKendaraan, V extends KendaraanRekap>(
  trips: T[],
  vehicles: V[],
  overview: BarisMuatan[],
  transport: BarisAngkut[],
  peserta: string[],
  offset: string,
): RekapKendaraan<T, V> {
  const muatan = new Map(overview.map((b) => [`${b.trip_id}|${b.vehicle_id}`, b]));
  const baca = petaKendaraan(transport, trips);
  const kurang = new Map<number, number>();
  for (const pid of peserta) {
    const k = baca(pid);
    if (!kurangKendaraan(k)) continue;
    for (const t of k.trips) if (t.status === "kurang") kurang.set(t.trip.id, (kurang.get(t.trip.id) ?? 0) + 1);
  }
  const hari: Array<HariTrip<T>> = [];
  for (const trip of urutTripKendaraan(trips)) {
    const tanggal = trip.depart_at ? tanggalZona(trip.depart_at, offset) : null;
    const baris = overview.filter((b) => b.trip_id === trip.id);
    const kolom = {
      trip,
      total: baris.reduce((n, b) => n + b.load, 0),
      kendaraan: baris.filter((b) => b.load > 0).length,
      tanpa: kurang.get(trip.id) ?? 0,
    };
    const terakhir = hari[hari.length - 1];
    if (terakhir && terakhir.tanggal === tanggal) terakhir.trips.push(kolom);
    else hari.push({ tanggal, trips: [kolom] });
  }
  const kendaraan = [...vehicles].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true, sensitivity: "base" }) || a.id - b.id);
  return {
    hari,
    kendaraan,
    isi: (vehicleId, tripId) => {
      const b = muatan.get(`${tripId}|${vehicleId}`);
      return { load: b?.load ?? 0, lebih: b?.over_capacity ?? false };
    },
  };
}
