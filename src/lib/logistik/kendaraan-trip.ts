/**
 * Kendaraan yang benar-benar dinaiki seseorang di setiap Trip, untuk semua
 * layar admin yang menampilkan kendaraan (ringkasan Logistics, Assignments,
 * Vehicles, Daftar peserta dan ekspornya).
 *
 * Aturannya sama dengan `transport_effective` di database: pengecualian trip
 * lebih dulu, kendaraan utama bila trip mengikutinya. Acara tanpa Trip hanya
 * punya kendaraan utama, jadi tampilannya sama dengan sebelum ada aturan ini.
 *
 * Murni, tanpa impor `@/`, supaya bisa dites dengan `node` (`kendaraan-trip.check.ts`).
 */

import { tanggalZona } from "./stay.ts";

export type TripKendaraan = { id: number; name: string; depart_at: string | null; follows_default: boolean; sort_order?: number };
export type BarisAngkut = { trip_id: number | null; participant_id: string; vehicle_id: number | null };

/**
 * "naik": ada kendaraan. "tidak": sengaja tidak naik ("No vehicle", atau trip
 * "Own list" yang tidak menempatkannya). "kurang": trip mengikuti kendaraan
 * utama, tetapi orang ini belum punya kendaraan utama maupun pengecualian.
 */
export type StatusTrip = "naik" | "tidak" | "kurang";
/** `ganti`: dari pengecualian trip itu, bukan dari kendaraan utama. */
export type KendaraanTrip = { trip: TripKendaraan; vehicle_id: number | null; status: StatusTrip; ganti: boolean };
export type KendaraanOrang = { utama: number | null; trips: KendaraanTrip[] };

/** Trip urut jam berangkat (tanpa jam di belakang), lalu urutan di Logistics. */
export function urutTripKendaraan<T extends TripKendaraan>(trips: T[]): T[] {
  return [...trips].sort((a, b) =>
    (a.depart_at ?? "￿").localeCompare(b.depart_at ?? "￿") || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
}

/** Pembaca kendaraan per orang dari baris `transport_assignments` dan Trip acara. */
export function petaKendaraan(transport: BarisAngkut[], trips: TripKendaraan[]): (pid: string) => KendaraanOrang {
  const utama = new Map<string, number>();
  const ganti = new Map<string, number | null>();
  for (const b of transport) {
    if (b.trip_id === null) { if (b.vehicle_id !== null) utama.set(b.participant_id, b.vehicle_id); }
    else ganti.set(`${b.trip_id}\u0000${b.participant_id}`, b.vehicle_id);
  }
  const urut = urutTripKendaraan(trips);
  return (pid) => {
    const bawaan = utama.get(pid) ?? null;
    return {
      utama: bawaan,
      trips: urut.map((trip) => {
        const k = `${trip.id}\u0000${pid}`;
        if (ganti.has(k)) {
          const v = ganti.get(k) ?? null;
          return { trip, vehicle_id: v, status: v === null ? "tidak" : "naik", ganti: true };
        }
        if (!trip.follows_default) return { trip, vehicle_id: null, status: "tidak", ganti: false };
        return bawaan === null ? { trip, vehicle_id: null, status: "kurang", ganti: false } : { trip, vehicle_id: bawaan, status: "naik", ganti: false };
      }),
    };
  };
}

/**
 * Masih kurang kendaraan: tanpa Trip, belum punya kendaraan utama; dengan
 * Trip, ada trip yang mengikuti kendaraan utama tanpa kendaraan untuk orang ini.
 * "No vehicle" yang sengaja diisi tidak dihitung kurang.
 */
export function kurangKendaraan(k: KendaraanOrang): boolean {
  return k.trips.length === 0 ? k.utama === null : k.trips.some((t) => t.status === "kurang");
}

/** Sudah punya kendaraan dan tidak kurang di trip mana pun. */
export function lengkapKendaraan(k: KendaraanOrang): boolean {
  return !kurangKendaraan(k) && (k.utama !== null || k.trips.some((t) => t.status === "naik"));
}

export const TEKS_TIDAK_NAIK = "Not riding";
export const TEKS_KURANG = "No vehicle yet";

/**
 * Ringkasan untuk ditampilkan: `satu` bila kendaraannya sama di semua trip
 * (atau acara tanpa Trip), selain itu satu baris per trip. `satu` null dan
 * `baris` kosong = tidak ada kendaraan sama sekali.
 */
export function ringkasKendaraan(k: KendaraanOrang, kode: (id: number) => string): { satu: string | null; baris: Array<{ trip: TripKendaraan; teks: string | null; status: StatusTrip }> } {
  if (k.trips.length === 0) return { satu: k.utama === null ? null : kode(k.utama), baris: [] };
  // Trip "Own list" yang tidak menempatkan orang ini bukan urusannya: tidak ditampilkan.
  const relevan = k.trips.filter((t) => t.status !== "tidak" || t.ganti);
  const naik = relevan.filter((t) => t.status === "naik");
  if (naik.length === 0) return { satu: null, baris: [] };
  if (naik.length === relevan.length && naik.every((t) => t.vehicle_id === naik[0].vehicle_id)) return { satu: kode(naik[0].vehicle_id!), baris: [] };
  return {
    satu: null,
    baris: relevan.map((t) => ({ trip: t.trip, status: t.status, teks: t.status === "naik" ? kode(t.vehicle_id!) : t.status === "tidak" ? TEKS_TIDAK_NAIK : null })),
  };
}

/** Satu teks untuk Daftar peserta dan ekspor: "BUS 5", atau "Ke venue: BUS 5 · Jeep Merapi: BUS 7". */
export function teksKendaraan(k: KendaraanOrang, kode: (id: number) => string): string | null {
  const r = ringkasKendaraan(k, kode);
  if (r.satu !== null || r.baris.length === 0) return r.satu;
  return r.baris.map((b) => `${b.trip.name}: ${b.teks ?? TEKS_KURANG}`).join(" · ");
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "6 Nov · Ke venue" (tanggal di zona acara), atau nama saja tanpa jam berangkat. */
export function labelTripPendek(trip: TripKendaraan, offset: string): string {
  if (!trip.depart_at) return trip.name;
  const t = tanggalZona(trip.depart_at, offset);
  return `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]} · ${trip.name}`;
}
