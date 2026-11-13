import { LABEL_MODA, type TiketKereta } from "../types.ts";
import { LABEL_TANPA_KENDARAAN, judulTrip, urutTrip } from "./bus.ts";
import { TEMPLAT, type TripImpor } from "./dasar.ts";
import { LABEL_ARAH } from "./kereta.ts";

/* ------------------------------------------- Download participant list */

/** Data untuk "Download participant list" (bus dan kereta). */
export type PesertaUnduh = {
  peserta: Array<{ id: string; name: string; qr_code: string; extra: Record<string, unknown> | null }>;
  /** Kolom pilihan peserta, ditulis sebagai "<label> (info)" untuk filter di Excel. */
  info: Array<{ key: string; label: string }>;
  vehicles: Array<{ id: number; code: string }>;
  busBawaan: Array<{ participant_id: string; vehicle_id: number }>;
  /** Kendaraan saja: trip acara dan pengecualian tersimpan, satu kolom per trip. */
  trips: TripImpor[];
  busTrip: Array<{ trip_id: number; participant_id: string; vehicle_id: number | null }>;
  offset: string;
  kereta: TiketKereta[];
};

/**
 * Judul kolom bantuan. Akhiran " (info)" menjamin judulnya tidak pernah sama
 * dengan alias impor (kolom "Class" atau "Kode" milik acara tidak terbaca
 * sebagai kolom tiket), jadi impor mengabaikannya.
 */
const judulInfo = (label: string) => `${label} (info)`;

function jawabanInfo(extra: Record<string, unknown> | null, key: string): string {
  const isi = extra?.[key];
  return typeof isi === "string" ? isi.trim() : typeof isi === "number" || typeof isi === "boolean" ? String(isi) : "";
}

const urutNama = (data: PesertaUnduh) => {
  const banding = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  return [...data.peserta].sort((a, b) => banding.compare(a.name, b.name) || banding.compare(a.qr_code, b.qr_code));
};

/**
 * Semua peserta aktif dalam bentuk templat bus: satu baris per orang, urut
 * nama, kendaraan bawaan yang tersimpan sudah terisi, lalu satu kolom per trip
 * (urut jam berangkat) berisi pengecualian yang tersimpan. Sel trip kosong =
 * ikut kendaraan utama.
 */
export function barisPesertaBus(data: PesertaUnduh): string[][] {
  const kodeBus = new Map(data.vehicles.map((bus) => [bus.id, bus.code]));
  const busOrang = new Map(data.busBawaan.map((b) => [b.participant_id, kodeBus.get(b.vehicle_id) ?? ""]));
  const trips = urutTrip(data.trips);
  const pengecualian = new Map(data.busTrip.map((b) => [`${b.trip_id}\u0000${b.participant_id}`, b.vehicle_id === null ? LABEL_TANPA_KENDARAAN : kodeBus.get(b.vehicle_id) ?? ""]));
  return [
    [...TEMPLAT.bus.judul, ...trips.map((trip) => judulTrip(trip, data.offset)), ...data.info.map((k) => judulInfo(k.label))],
    ...urutNama(data).map((orang) => [
      orang.qr_code, orang.name, busOrang.get(orang.id) ?? "",
      ...trips.map((trip) => pengecualian.get(`${trip.id}\u0000${orang.id}`) ?? ""),
      ...data.info.map((k) => jawabanInfo(orang.extra, k.key)),
    ]),
  ];
}

/**
 * Semua peserta aktif dalam bentuk templat tiket: per orang Outbound lalu
 * Return, satu baris per segmen tersimpan (orang tanpa tiket satu baris
 * kosong per arah), urut nama, tiket yang tersimpan sudah terisi (tanggal
 * DD/MM/YYYY, jam HH:MM, sama dengan yang dibaca impor).
 */
export function barisPesertaKereta(data: PesertaUnduh): string[][] {
  const tiket = new Map<string, TiketKereta[]>();
  for (const t of [...data.kereta].sort((a, b) => a.segment - b.segment)) {
    const k = `${t.participant_id}\u0000${t.direction}`;
    tiket.set(k, [...(tiket.get(k) ?? []), t]);
  }
  const tanggal = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
  const jam = (teks: string | null) => (teks ? teks.slice(0, 5) : "");
  const hasil: string[][] = [[...TEMPLAT.kereta.judul, ...data.info.map((k) => judulInfo(k.label))]];
  for (const orang of urutNama(data)) {
    const info = data.info.map((k) => jawabanInfo(orang.extra, k.key));
    for (const arah of ["outbound", "return"] as const) {
      const daftar: Array<TiketKereta | undefined> = tiket.get(`${orang.id}\u0000${arah}`) ?? [undefined];
      for (const t of daftar) hasil.push([
        orang.qr_code, orang.name, LABEL_ARAH[arah], String(t?.segment ?? 1), t ? LABEL_MODA[t.mode] : "",
        t?.train_name ?? "", t?.travel_class ?? "", t?.origin ?? "", t?.destination ?? "",
        tanggal(t?.depart_date ?? null), jam(t?.depart_time ?? null), jam(t?.arrive_time ?? null),
        t?.carriage ?? "", t?.seat ?? "", t?.booking_code ?? "",
        ...info,
      ]);
    }
  }
  return hasil;
}
