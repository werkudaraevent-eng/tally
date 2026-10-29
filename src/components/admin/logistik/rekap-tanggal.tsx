"use client";

import { Bed, CalendarDots } from "@phosphor-icons/react";
import { useMemo, type ReactNode } from "react";
import {
  Banner, EmptyState, Pane, PaneBody, PaneHeader, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, EMPTY_VALUE,
} from "@/components/m3";
import { rekapInap, rekapKendaraan, type AngkaMalam } from "@/lib/logistik/rekap";
import { jamZona, labelTanggal } from "@/lib/logistik/stay";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { timeZoneOffset } from "@/lib/timezone";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import type { LogistikData } from "@/lib/logistik/types";

/**
 * Tampilan "By date" di tab Rooms dan Vehicles: rekap yang dikirim ke hotel
 * dan vendor kendaraan, dihitung dari data yang panitia isi sendiri
 * (`src/lib/logistik/rekap.ts`). Hanya dibaca; mengubah tetap di tampilan
 * Rooms, Trips, dan Assignments.
 *
 * Bentuk tabelnya mengikuti kebiasaan laporan data: satu fakta per sel, angka
 * rata kanan dengan digit sejajar, kolom pertama menempel saat tabel digeser,
 * en dash untuk yang tidak berlaku dan 0 untuk yang memang kosong.
 */

const ANGKA = (n: number) => n.toLocaleString("en-GB");
/** Sel kolom pertama: latar sendiri, karena sel sticky melayang di atas sel yang lewat. */
const LATAR = "bg-surface-container-lowest";
const LATAR_KELOMPOK = "bg-surface-container-high";

function Judul({ children, keterangan }: { children: ReactNode; keterangan: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 pb-3 pt-5">
      <h2 className="text-title-small font-semibold text-on-surface">{children}</h2>
      <p className="text-body-small text-on-surface-variant">{keterangan}</p>
    </div>
  );
}

/* ================================================================ Rooms */

export function RekapKamar({ data, atas }: { data: LogistikData; atas: ReactNode }) {
  const { zone } = useEventTimeZone();
  const offset = timeZoneOffset(zone);
  const rekap = useMemo(
    () => rekapInap(data.hotels, data.lodging, new Set(data.participants.map((orang) => orang.id)), offset),
    [data.hotels, data.lodging, data.participants, offset],
  );
  const hotel = rekap.hotel.filter((h) => h.periode.length > 0);
  const banyakHotel = hotel.length > 1;
  const adaTanpaKamar = hotel.some((h) => h.periode.some((p) => p.tanpaKamar > 0));
  const tanpaTanggal = hotel.reduce((n, h) => n + h.periode.filter((p) => p.malam === null).reduce((m, p) => m + p.tamu, 0), 0);

  const barisMalam = (label: string, angka: AngkaMalam[], kunci: keyof AngkaMalam, peringatan = false) => (
    <TableRow>
      <TableCell sticky className={cx(LATAR, "pl-8")}>{label}</TableCell>
      {angka.map((m, i) => (
        <TableCell key={rekap.malam[i]} align="end" numeric className={cx(peringatan && m[kunci] > 0 && "font-medium text-warning")}>
          {ANGKA(m[kunci])}
        </TableCell>
      ))}
    </TableRow>
  );

  return (
    <Pane aria-label="Rooms by date">
      <PaneHeader className="flex-wrap gap-2 px-3 py-2.5">{atas}</PaneHeader>
      <PaneBody>
        {hotel.length === 0 ? (
          <EmptyState
            plain
            icon={<Bed size={40} />}
            title="No hotel guests yet"
            description="Assign participants to a hotel under Assignments. Their stays are counted here by check-in date and by night."
          />
        ) : (
          <>
            {tanpaTanggal > 0 ? (
              <div className="px-4 pt-4">
                <Banner tone="warning">
                  {plural(tanpaTanggal, "guest has", "guests have")} no check-in or check-out date, so they are not in the nights below. Add the hotel&apos;s check-in and check-out under the hotel in Rooms.
                </Banner>
              </div>
            ) : null}

            <Judul keterangan="One row for each check-in and check-out pair. Rooms counts rooms already set up in Logistics, numbered or labelled.">
              By stay
            </Judul>
            <Table minWidth="720px" density="compact">
              <TableHead>
                <tr>
                  <TableHeaderCell sticky className={LATAR}>Hotel</TableHeaderCell>
                  <TableHeaderCell>Check-in</TableHeaderCell>
                  <TableHeaderCell>Check-out</TableHeaderCell>
                  <TableHeaderCell align="end">Nights</TableHeaderCell>
                  <TableHeaderCell align="end">Rooms</TableHeaderCell>
                  <TableHeaderCell align="end">Guests</TableHeaderCell>
                  <TableHeaderCell align="end">Without a room</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {hotel.flatMap((h) => h.periode.map((p, i) => (
                  <TableRow key={`${h.hotel.id}|${p.masuk}|${p.keluar}`}>
                    {/* Nama hotel yang sama dengan baris sebelumnya ditulis redup (DESIGN.md, Satu fakta per kolom). */}
                    <TableCell sticky className={cx(LATAR, "max-w-64 truncate", i > 0 ? "text-on-surface-variant" : "font-medium text-on-surface")} title={h.hotel.name}>
                      {h.hotel.name}
                    </TableCell>
                    <TableCell className={cx(p.masuk === null && "text-on-surface-variant")}>{p.masuk ? labelTanggal(p.masuk) : "Not set"}</TableCell>
                    <TableCell className={cx(p.keluar === null && "text-on-surface-variant")}>{p.keluar ? labelTanggal(p.keluar) : "Not set"}</TableCell>
                    <TableCell align="end" numeric>{p.malam === null ? <span className="text-on-surface-variant">{EMPTY_VALUE}</span> : p.malam}</TableCell>
                    <TableCell align="end" numeric>{ANGKA(p.kamar)}</TableCell>
                    <TableCell align="end" numeric>{ANGKA(p.tamu)}</TableCell>
                    <TableCell align="end" numeric className={cx(p.tanpaKamar > 0 && "font-medium text-warning")}>{ANGKA(p.tanpaKamar)}</TableCell>
                  </TableRow>
                )))}
              </TableBody>
            </Table>

            {rekap.malam.length > 0 ? (
              <>
                <Judul keterangan={<>Each column is one night, from check-in day to the next morning. Room-nights are what the hotel bills.{adaTanpaKamar ? " Guests without a room are not in Rooms yet." : ""}</>}>
                  By night
                </Judul>
                <Table minWidth={`${200 + rekap.malam.length * 96}px`} density="compact">
                  <TableHead>
                    <tr>
                      <TableHeaderCell sticky className={LATAR}>Night of</TableHeaderCell>
                      {rekap.malam.map((tanggal) => <TableHeaderCell key={tanggal} align="end">{labelTanggal(tanggal)}</TableHeaderCell>)}
                    </tr>
                  </TableHead>
                  <TableBody>
                    {[...hotel.map((h) => ({ kunci: String(h.hotel.id), nama: h.hotel.name, angka: h.perMalam, roomNights: h.roomNights })),
                      ...(banyakHotel ? [{ kunci: "semua", nama: "All hotels", angka: rekap.total, roomNights: rekap.roomNights }] : [])].map((h) => (
                      <RekapMalamHotel key={h.kunci} nama={h.nama} roomNights={h.roomNights} kolom={rekap.malam.length}>
                        {barisMalam("Rooms", h.angka, "kamar")}
                        {barisMalam("Guests", h.angka, "tamu")}
                        {h.angka.some((m) => m.tanpaKamar > 0) ? barisMalam("Without a room", h.angka, "tanpaKamar", true) : null}
                      </RekapMalamHotel>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : null}
            <div className="h-6" />
          </>
        )}
      </PaneBody>
    </Pane>
  );
}

function RekapMalamHotel({ nama, roomNights, kolom, children }: { nama: string; roomNights: number; kolom: number; children: ReactNode }) {
  return (
    <>
      <TableRow className={LATAR_KELOMPOK}>
        <TableCell sticky strong className={LATAR_KELOMPOK} title={nama}>
          <span className="block max-w-64 truncate">{nama}</span>
        </TableCell>
        <TableCell colSpan={kolom} className="text-on-surface-variant">
          <span className="sticky left-0">{plural(roomNights, "room-night")}</span>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}

/* ============================================================= Vehicles */

export function RekapKendaraan({ data, atas }: { data: LogistikData; atas: ReactNode }) {
  const { zone } = useEventTimeZone();
  const offset = timeZoneOffset(zone);
  const rekap = useMemo(
    () => rekapKendaraan(data.trips, data.vehicles, data.overview, data.transport, data.participants.map((orang) => orang.id), offset),
    [data.trips, data.vehicles, data.overview, data.transport, data.participants, offset],
  );
  const kolom = rekap.hari.flatMap((h) => h.trips);
  const adaTanpa = kolom.some((k) => k.tanpa > 0);
  // Hanya kendaraan yang dipakai di salah satu Trip yang perlu kapasitas untuk dinilai penuh.
  const tanpaKapasitas = rekap.kendaraan.filter((v) => v.capacity === null && kolom.some((k) => rekap.isi(v.id, k.trip.id).load > 0)).length;
  const awalHari = new Set(rekap.hari.map((h) => h.trips[0].trip.id));
  const garis = (tripId: number) => (awalHari.has(tripId) ? "border-l border-outline-variant" : "");

  const barisTotal = (label: string, nilai: (k: (typeof kolom)[number]) => ReactNode) => (
    <TableRow className={LATAR_KELOMPOK}>
      <TableCell sticky strong className={LATAR_KELOMPOK}>{label}</TableCell>
      {kolom.map((k) => <TableCell key={k.trip.id} align="end" numeric strong className={garis(k.trip.id)}>{nilai(k)}</TableCell>)}
    </TableRow>
  );

  return (
    <Pane aria-label="Vehicles by date">
      <PaneHeader className="flex-wrap gap-2 px-3 py-2.5">{atas}</PaneHeader>
      <PaneBody>
        {kolom.length === 0 || data.vehicles.length === 0 ? (
          <EmptyState
            plain
            icon={<CalendarDots size={40} />}
            title={kolom.length === 0 ? "No trips yet" : "No vehicles yet"}
            description={kolom.length === 0
              ? "This view counts passengers on each vehicle for each trip. Create trips under Trips, with their departure time."
              : "Add vehicles under Vehicles, then assign participants on each trip."}
          />
        ) : (
          <>
            {tanpaKapasitas > 0 ? (
              <div className="px-4 pt-4">
                <Banner tone="info">
                  {`Capacity is empty for ${plural(tanpaKapasitas, "vehicle")} in use, so a full vehicle cannot be flagged. Add it under each vehicle's Edit.`}
                </Banner>
              </div>
            ) : null}
            <Judul keterangan="Passengers on each vehicle for each trip, grouped by day. With a capacity, cells show passengers/capacity and turn red when over.">
              By trip
            </Judul>
            <Table minWidth={`${180 + kolom.length * 136}px`} density="compact">
              <TableHead>
                <tr>
                  <TableHeaderCell sticky className={LATAR} />
                  {rekap.hari.map((h) => (
                    <TableHeaderCell key={h.tanggal ?? "tanpa"} colSpan={h.trips.length} className="border-l border-outline-variant text-on-surface">
                      <span className="sticky left-0">{h.tanggal ? labelTanggal(h.tanggal) : "No departure date"}</span>
                    </TableHeaderCell>
                  ))}
                </tr>
                <tr className="align-bottom">
                  <TableHeaderCell sticky className={LATAR}>Vehicle</TableHeaderCell>
                  {kolom.map((k) => (
                    <TableHeaderCell key={k.trip.id} align="end" className={garis(k.trip.id)}>
                      <span className="block tabular-nums text-on-surface">{k.trip.depart_at ? jamZona(k.trip.depart_at, offset) : EMPTY_VALUE}</span>
                      <span className="ml-auto block max-w-40 whitespace-normal font-normal" title={k.trip.name}>{k.trip.name}</span>
                    </TableHeaderCell>
                  ))}
                </tr>
              </TableHead>
              <TableBody>
                {rekap.kendaraan.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell sticky strong className={cx(LATAR, "max-w-48 truncate")} title={v.code}>{v.code}</TableCell>
                    {kolom.map((k) => {
                      const { load, lebih } = rekap.isi(v.id, k.trip.id);
                      return (
                        <TableCell key={k.trip.id} align="end" numeric className={cx(garis(k.trip.id), lebih && "font-medium text-error")}>
                          {load === 0 ? <span className="text-on-surface-variant" aria-label="not used">{EMPTY_VALUE}</span>
                            : v.capacity === null ? ANGKA(load) : `${ANGKA(load)}/${ANGKA(v.capacity)}`}
                          {lebih ? <span className="sr-only"> over capacity</span> : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {barisTotal("Passengers", (k) => ANGKA(k.total))}
                {barisTotal("Vehicles used", (k) => ANGKA(k.kendaraan))}
                {adaTanpa ? barisTotal("Without a vehicle", (k) => (
                  k.trip.follows_default
                    ? <span className={cx(k.tanpa > 0 && "text-warning")}>{ANGKA(k.tanpa)}</span>
                    : <span className="font-normal text-on-surface-variant" title="Own list: only the people assigned ride on this trip">{EMPTY_VALUE}</span>
                )) : null}
              </TableBody>
            </Table>
            <div className="h-6" />
          </>
        )}
      </PaneBody>
    </Pane>
  );
}
