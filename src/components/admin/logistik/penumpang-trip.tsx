"use client";

import { CaretRight } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Button, Dialog, StatusChip } from "@/components/m3";
import { hotelDiTrip, jumlahHotel, kelompokHotel, type KelompokHotel } from "@/lib/logistik/hotel-kendaraan";
import { petaKendaraan, urutTripKendaraan } from "@/lib/logistik/kendaraan-trip";
import { jamZona, labelTanggal, stayPerPeserta, tanggalStay, tanggalZona } from "@/lib/logistik/stay";
import type { Agenda, Bus, LogistikData, LogistikPeserta } from "@/lib/logistik/types";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { BarisOrang, type TabProps } from "./bersama";

/**
 * Penumpang per Trip di panel Vehicles (Mas 5 Nov 2026).
 *
 * Panel kendaraan dulu hanya menghitung penumpang per Trip. Sekarang tiap Trip
 * bisa dibuka: penumpangnya dikelompokkan per hotel malam itu (aturan di
 * `hotel-kendaraan.ts`), dan tiap orang bisa dipindah ke kendaraan lain untuk
 * Trip itu saja. Semua dihitung dari data Rooms dan Trips yang sudah diisi
 * panitia, tanpa setelan baru.
 */

/** "Fri 6 Nov · 13:15" dari jam berangkat Trip; nama Trip sering sama ("Menuju Hotel" tiga kali). */
export function labelBerangkat(berangkat: string | null, offset: string): string {
  if (!berangkat) return "No departure time";
  return `${labelTanggal(tanggalZona(berangkat, offset))} · ${jamZona(berangkat, offset)}`;
}

export type MuatanTrip = {
  /** Trip urut jam berangkat. */
  trips: Agenda[];
  /** Penumpang per Trip per kendaraan, aturan `transport_effective`. */
  penumpang: (tripId: number, busId: number) => string[];
  hotelDi: (trip: Agenda, pid: string) => number | null;
  /** Kelompok hotel penumpang satu kendaraan di satu Trip. */
  kelompok: (trip: Agenda, busId: number) => KelompokHotel[];
  /** Kendaraan yang membawa tamu lebih dari satu hotel: berapa Trip, dan paling banyak berapa hotel. */
  campur: Map<number, { trips: number; hotel: number }>;
};

export function useMuatanTrip(data: LogistikData, offset: string): MuatanTrip {
  return useMemo(() => {
    const trips = urutTripKendaraan(data.trips);
    const baca = petaKendaraan(data.transport, data.trips);
    const isi = new Map<string, string[]>();
    for (const orang of data.participants) {
      for (const t of baca(orang.id).trips) {
        if (t.vehicle_id === null) continue;
        const kunci = `${t.trip.id}:${t.vehicle_id}`;
        isi.set(kunci, [...(isi.get(kunci) ?? []), orang.id]);
      }
    }
    const hotelById = new Map(data.hotels.map((hotel) => [hotel.id, hotel]));
    const stays = new Map([...stayPerPeserta(data.lodging, hotelById)].map(([id, daftar]) => [
      id,
      daftar.map((stay) => {
        const t = tanggalStay(stay, hotelById.get(stay.hotel_id));
        return { hotel_id: stay.hotel_id, masuk: t.masuk, keluar: t.keluar };
      }),
    ]));
    const penumpang = (tripId: number, busId: number) => isi.get(`${tripId}:${busId}`) ?? [];
    const hotelDi = (trip: Agenda, pid: string) => hotelDiTrip(stays.get(pid) ?? [], trip.depart_at, offset);
    const kelompok = (trip: Agenda, busId: number) => kelompokHotel(penumpang(trip.id, busId), (pid) => hotelDi(trip, pid));
    const campur = new Map<number, { trips: number; hotel: number }>();
    if (data.hotels.length > 0) {
      for (const bus of data.vehicles) {
        let n = 0;
        let maks = 0;
        for (const trip of trips) {
          const h = jumlahHotel(kelompok(trip, bus.id));
          if (h > 1) { n += 1; maks = Math.max(maks, h); }
        }
        if (n > 0) campur.set(bus.id, { trips: n, hotel: maks });
      }
    }
    return { trips, penumpang, hotelDi, kelompok, campur };
  }, [data.trips, data.transport, data.participants, data.hotels, data.lodging, data.vehicles, offset]);
}

/** Kelompok terbesar dipotong sampai "Show all" bila daftar panjang. */
const BATAS_PANJANG = 12;
const POTONG = 5;

/** Isi "On each trip" di panel kendaraan: satu baris per Trip, bisa dibuka. */
export function TripKendaraan({ bus, data, muatan, offset, orangById, isiTeks, busy, onPindah }: {
  bus: Bus;
  data: LogistikData;
  muatan: MuatanTrip;
  offset: string;
  orangById: Map<string, LogistikPeserta>;
  isiTeks: (isi: number, kapasitas: number | null) => string;
  busy: boolean;
  /** Dialog Move dirender di luar panel (TabBus), supaya tidak tertutup kepala kolom yang menempel. */
  onPindah: (trip: Agenda, orang: LogistikPeserta) => void;
}) {
  const [buka, setBuka] = useState<number | null>(null);
  const [semua, setSemua] = useState(false);
  const namaHotel = useMemo(() => new Map(data.hotels.map((hotel) => [hotel.id, hotel.name])), [data.hotels]);
  const adaHotel = data.hotels.length > 0;

  return (
    <>
      <ul className="-mx-2 flex flex-col">
        {muatan.trips.map((trip) => {
          const baris = data.overview.find((o) => o.trip_id === trip.id && o.vehicle_id === bus.id);
          const isi = baris?.load ?? 0;
          const kelompok = muatan.kelompok(trip, bus.id);
          const nHotel = adaHotel ? jumlahHotel(kelompok) : 0;
          const terbuka = buka === trip.id && kelompok.length > 0;
          const idIsi = `trip-${bus.id}-${trip.id}`;
          const terbesar = kelompok.reduce((maks, k) => Math.max(maks, k.ids.length), 0);
          const total = kelompok.reduce((n, k) => n + k.ids.length, 0);
          return (
            <li key={trip.id} className="flex flex-col">
              <button
                type="button"
                aria-expanded={kelompok.length > 0 ? terbuka : undefined}
                aria-controls={kelompok.length > 0 ? idIsi : undefined}
                disabled={kelompok.length === 0}
                onClick={() => { setBuka(terbuka ? null : trip.id); setSemua(false); }}
                className={cx(
                  "flex min-h-12 w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-body-medium",
                  kelompok.length > 0 ? "hover:bg-primary-soft" : "cursor-default",
                )}
              >
                <CaretRight size={16} aria-hidden className={cx("shrink-0 text-on-surface-variant transition-transform motion-reduce:transition-none", terbuka && "rotate-90", kelompok.length === 0 && "invisible")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body-small text-on-surface-variant">{labelBerangkat(trip.depart_at, offset)}</span>
                  <span className="block truncate text-on-surface">{trip.name}</span>
                </span>
                {nHotel > 1 ? <StatusChip dot tone="warning">{`${nHotel} hotels`}</StatusChip> : null}
                {baris?.over_capacity ? <StatusChip dot tone="error">Over</StatusChip> : null}
                <span className={cx("shrink-0 tabular-nums", baris?.over_capacity ? "text-error" : "text-on-surface-variant")}>{isiTeks(isi, bus.capacity)}</span>
              </button>
              {terbuka ? (
                <div id={idIsi} className="mx-2 mb-2 mt-1 overflow-hidden rounded-md border border-outline-variant">
                  {adaHotel ? (
                    <p className="border-b border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-small text-on-surface-variant">
                      Hotel that night:{" "}
                      {[...kelompok].reverse().map((k, i) => (
                        <span key={k.hotel_id ?? "tanpa"}>
                          {i > 0 ? " · " : ""}
                          <span className={cx("font-medium", nHotel > 1 && k.ids.length < terbesar || k.hotel_id === null ? "text-warning" : "text-on-surface")}>
                            {`${k.hotel_id === null ? "No hotel" : namaHotel.get(k.hotel_id) ?? "Hotel"} ${k.ids.length}`}
                          </span>
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {kelompok.map((k) => {
                    const potong = !semua && total > BATAS_PANJANG && k.ids.length === terbesar && k.ids.length > POTONG;
                    const orang = k.ids.map((id) => orangById.get(id)).filter((o): o is LogistikPeserta => Boolean(o))
                      .sort((a, b) => a.name.localeCompare(b.name, "id"));
                    const judul = !adaHotel ? null : k.hotel_id === null ? "No hotel" : namaHotel.get(k.hotel_id) ?? "Hotel";
                    return (
                      <section key={k.hotel_id ?? "tanpa"} aria-label={judul ?? "Passengers"} className="px-3 pt-2">
                        {judul ? (
                          <h4 className={cx("text-body-small font-medium", nHotel > 1 && k.ids.length < terbesar || k.hotel_id === null ? "text-warning" : "text-on-surface-variant")}>
                            {`${judul} · ${k.ids.length}`}
                          </h4>
                        ) : null}
                        <ul className="flex flex-col">
                          {(potong ? orang.slice(0, POTONG) : orang).map((o) => (
                            <BarisOrang
                              key={o.id}
                              orang={o}
                              aksi={<Button variant="text" size="sm" disabled={busy} aria-label={`Move ${o.name} to another vehicle on this trip`} onClick={() => onPindah(trip, o)}>Move</Button>}
                            />
                          ))}
                        </ul>
                        {potong ? (
                          <Button variant="text" size="sm" className="-ml-3 mb-1" onClick={() => setSemua(true)}>{`Show all ${k.ids.length}`}</Button>
                        ) : null}
                      </section>
                    );
                  })}
                  <div className="h-2" />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Pindah satu penumpang untuk satu Trip. Kendaraan yang membawa tamu hotel
 * yang sama di Trip itu tampil paling atas, supaya panitia tidak menebak bus
 * mana yang ke hotel itu.
 */
export function DialogPindah({ pindah, dari, data, muatan, offset, busy, onClose, kirim }: {
  pindah: { trip: Agenda; orang: LogistikPeserta } | null;
  dari: Bus;
  data: LogistikData;
  muatan: MuatanTrip;
  offset: string;
  busy: boolean;
  onClose: () => void;
  kirim: TabProps["kirim"];
}) {
  const [tujuan, setTujuan] = useState<string>("");
  const namaHotel = useMemo(() => new Map(data.hotels.map((hotel) => [hotel.id, hotel.name])), [data.hotels]);
  const simpan = async (trip: Agenda, orang: LogistikPeserta, ke: number | null) =>
    Boolean(await kirim("/api/admin/logistik/penumpang", "POST", { trip_id: trip.id, vehicle_id: ke, participant_ids: [orang.id] }));
  if (!pindah) return <Dialog open={false} onClose={onClose} title="Move" />;
  const { trip, orang } = pindah;
  const hotel = data.hotels.length > 0 ? muatan.hotelDi(trip, orang.id) : null;
  const hotelNama = hotel !== null ? namaHotel.get(hotel) ?? "the same hotel" : null;

  const pilihan = data.vehicles.filter((bus) => bus.id !== dari.id).map((bus) => {
    const kelompok = muatan.kelompok(trip, bus.id);
    const load = data.overview.find((o) => o.trip_id === trip.id && o.vehicle_id === bus.id)?.load ?? 0;
    const penuh = bus.capacity !== null && load >= bus.capacity;
    const ringkas = kelompok.length === 0 ? "Empty on this trip"
      : data.hotels.length === 0 ? plural(load, "passenger")
        : jumlahHotel(kelompok) === 1 && kelompok.every((k) => k.hotel_id !== null)
          ? `${plural(load, "passenger")} · all ${namaHotel.get(kelompok[0].hotel_id as number) ?? "one hotel"}`
          : `${plural(load, "passenger")} · ${[...kelompok].reverse().map((k) => `${k.hotel_id === null ? "No hotel" : namaHotel.get(k.hotel_id) ?? "Hotel"} ${k.ids.length}`).join(", ")}`;
    const sehotel = hotel !== null && kelompok.some((k) => k.hotel_id === hotel);
    return { bus, load, penuh, ringkas: bus.capacity !== null ? `${ringkas} · ${penuh ? "full" : `${bus.capacity - load} seats left`}` : ringkas, sehotel };
  });
  const atas = pilihan.filter((p) => p.sehotel);
  const lain = pilihan.filter((p) => !p.sehotel);
  const nilaiTujuan = tujuan === "none" ? null : Number(tujuan) || null;
  const namaTujuan = tujuan === "none" ? "No vehicle" : data.vehicles.find((bus) => bus.id === nilaiTujuan)?.code;

  const opsi = (nilai: string, judul: string, keterangan: string, mati = false) => (
    <label
      key={nilai}
      className={cx(
        "flex min-h-12 items-start gap-3 rounded-md border px-3 py-2.5 text-body-medium",
        mati ? "cursor-not-allowed border-outline-variant opacity-60" : "cursor-pointer",
        tujuan === nilai ? "border-primary bg-primary-soft" : "border-outline-variant",
      )}
    >
      <input type="radio" name="pindah-kendaraan" value={nilai} checked={tujuan === nilai} disabled={mati || busy} onChange={() => setTujuan(nilai)} className="mt-1 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
      <span className="min-w-0">
        <span className="block text-on-surface">{judul}</span>
        <span className="block text-body-small text-on-surface-variant">{keterangan}</span>
      </span>
    </label>
  );

  return (
    <Dialog
      open
      scrollBody
      onClose={onClose}
      dismissible={!busy}
      title={`Move ${orang.name}`}
      description={`Only on ${labelBerangkat(trip.depart_at, offset)} · ${trip.name}. Other trips stay as they are.`}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button simpan loading={busy} disabled={!tujuan} onClick={async () => { if (await simpan(trip, orang, nilaiTujuan)) onClose(); }}>
            {namaTujuan && tujuan !== "none" ? `Move to ${namaTujuan}` : tujuan === "none" ? "Remove from this trip" : "Move"}
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2 pt-2">
        <legend className="sr-only">Vehicle on this trip</legend>
        {atas.length > 0 ? <p className="text-body-small font-medium text-on-surface-variant">{`Vehicles with ${hotelNama} guests on this trip`}</p> : null}
        {atas.map((p) => opsi(String(p.bus.id), p.bus.code, p.ringkas, p.penuh))}
        {lain.length > 0 ? <p className="mt-2 text-body-small font-medium text-on-surface-variant">{atas.length > 0 ? "Other vehicles" : "Vehicles"}</p> : null}
        {lain.map((p) => opsi(String(p.bus.id), p.bus.code, p.ringkas, p.penuh))}
        <div className="mt-2">{opsi("none", "No vehicle on this trip", "They will not ride on this trip.")}</div>
      </fieldset>
    </Dialog>
  );
}
