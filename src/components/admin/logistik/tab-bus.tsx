"use client";

import { ArrowCounterClockwise, ArrowSquareOut, Bus as IkonBus, CalendarDots, Eye, SignOut, Warning } from "@phosphor-icons/react";
import Link from "@/components/event-link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Banner, Button, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, Pane, PaneBody, PaneFooter,
  PaneHeader, SelectField, StatusChip, Switch, TextField, EMPTY_VALUE,
} from "@/components/m3";
import { hrefBarisAgenda, jamPendek, keteranganTrip, namaMirip, petunjukBerangkat, selisihMenit, tanggalGanda, teksBaris } from "@/lib/logistik/trip-agenda";
import type { Agenda, Bus, LogistikPeserta } from "@/lib/logistik/types";
import { cx } from "@/lib/m3/cx";
import { kurangKendaraan, petaKendaraan } from "@/lib/logistik/kendaraan-trip";
import { plural } from "@/lib/plural";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import {
  angkaAtauNull, BarisOrang, dariInputWaktu, formatWaktu, keInputWaktu, KepalaDetail, KepalaKolom, KolomCari, PilihPeserta, type TabProps,
} from "./bersama";
import { PilihBarisAgenda, useAgendaTrip, type AgendaTrip } from "./pilih-baris-agenda";

/**
 * Tab Bus, dengan dua bagian: Daftar bus dan Agenda.
 *
 * Model yang dipegang panitia (keputusan 30 Sep 2026): tiap peserta punya
 * SATU bus bawaan, dan agenda (berangkat ke venue, gala dinner, pulang)
 * memakainya kecuali diganti untuk orang tertentu. Agenda yang tidak mengikuti
 * bus bawaan disusun ulang seluruhnya: hanya pengganti yang berlaku.
 *
 * Daftar bus menjawab "siapa naik bus ini biasanya", bagian Agenda menjawab
 * "siapa naik bus apa di perjalanan ini". Angka isi per agenda datang dari
 * `transport_overview`, bukan dihitung ulang di sini, supaya layar dan
 * pemeriksa kapasitas di database tidak pernah berbeda pendapat.
 */

function usePetaBus(data: TabProps["data"]) {
  return useMemo(() => {
    const orangById = new Map(data.participants.map((orang) => [orang.id, orang]));
    const busById = new Map(data.vehicles.map((bus) => [bus.id, bus]));
    const bawaan = new Map<string, number>();
    const pengganti = new Map<number, Map<string, number | null>>();
    for (const baris of data.transport) {
      if (!orangById.has(baris.participant_id)) continue;
      if (baris.trip_id === null) {
        if (baris.vehicle_id !== null) bawaan.set(baris.participant_id, baris.vehicle_id);
      } else {
        if (!pengganti.has(baris.trip_id)) pengganti.set(baris.trip_id, new Map());
        pengganti.get(baris.trip_id)!.set(baris.participant_id, baris.vehicle_id);
      }
    }
    /** Bus yang dinaiki seseorang di satu agenda. Aturannya sama dengan `transport_effective`. */
    const busDi = (agenda: Agenda, id: string): number | null => {
      const ganti = pengganti.get(agenda.id);
      if (ganti?.has(id)) return ganti.get(id) ?? null;
      return agenda.follows_default ? bawaan.get(id) ?? null : null;
    };
    return { orangById, busById, bawaan, pengganti, busDi };
  }, [data.participants, data.vehicles, data.transport]);
}

const isiTeks = (isi: number, kapasitas: number | null) => (kapasitas === null ? String(isi) : `${isi}/${kapasitas}`);

/* ================================================================ Bus */

export function TabBus({ data, kirim, busy, baru, tutupBaru, atas }: TabProps & { atas?: ReactNode }) {
  const { orangById, busById, bawaan } = usePetaBus(data);
  const [pilih, setPilih] = useState<number | null>(null);
  const [ubah, setUbah] = useState<Bus | null>(null);
  const [tambah, setTambah] = useState(false);
  const [hapus, setHapus] = useState<Bus | null>(null);
  const [cari, setCari] = useState("");
  const [tampilan, setTampilan] = useState(false);
  const tampil = data.bus_shown;
  // Kendaraan sampai ke peserta: sakelar induk Logistics menyala dan bagian Vehicle tidak disembunyikan.
  const kendaraanTampil = tampil.logistics && !(tampil.hidden ?? []).includes("vehicles");

  const penumpang = useMemo(() => {
    const peta = new Map<number, LogistikPeserta[]>();
    for (const [id, busId] of bawaan) {
      const orang = orangById.get(id);
      if (orang) peta.set(busId, [...(peta.get(busId) ?? []), orang]);
    }
    return peta;
  }, [bawaan, orangById]);
  const tanpaBus = data.participants.length - bawaan.size;
  const adaTrip = data.trips.length > 0;
  const kurangDiTrip = useMemo(() => {
    if (!adaTrip) return 0;
    const baca = petaKendaraan(data.transport, data.trips);
    return data.participants.filter((orang) => kurangKendaraan(baca(orang.id))).length;
  }, [adaTrip, data.transport, data.trips, data.participants]);

  const lebihDi = (bus: Bus) => data.overview.filter((baris) => baris.vehicle_id === bus.id && baris.over_capacity).length;

  const daftar = (
    <Pane aria-label="Vehicles">
      {atas ? (
        <PaneHeader className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          {atas}
          {/* Sama dengan Room rules di tab Rooms: disetel sekali, cukup terlihat. */}
          <Button variant="text" size="sm" className="ml-auto" icon={<Eye size={16} />} onClick={() => setTampilan(true)}>
            {!tampil.logistics ? "Participants don't see vehicles yet" : !kendaraanTampil ? "Hidden from participants" : tampil.plate && tampil.crew ? "Participants see plate and crew" : tampil.plate ? "Participants see plate" : tampil.crew ? "Participants see crew" : "Participants see vehicle name only"}
          </Button>
        </PaneHeader>
      ) : null}
      <PaneBody>
        {data.vehicles.length === 0 ? (
          <EmptyState
            plain
            icon={<IkonBus size={40} />}
            title="No vehicles yet"
            description="Start with Add vehicle at the top right. Give each vehicle the name participants will see, such as Bus 1, then assign its default passengers."
          />
        ) : (
          <>
            <KepalaKolom kolom={[["Vehicle", "min-w-0 flex-1"], ["Plate", "w-28 max-sm:hidden"], [adaTrip ? "Passengers" : "Default passengers", "w-36 text-right"]]} />
            {data.vehicles.map((bus) => {
              const isi = penumpang.get(bus.id)?.length ?? 0;
              const lebih = (bus.capacity !== null && isi > bus.capacity) || lebihDi(bus) > 0;
              // Dengan Trip: isi tersedikit sampai terbanyak di antara semua trip
              // (`transport_overview`), karena kendaraan bisa diisi per trip saja.
              const perTrip = data.trips.map((agenda) => data.overview.find((o) => o.trip_id === agenda.id && o.vehicle_id === bus.id)?.load ?? 0);
              const teksIsi = !adaTrip ? isiTeks(isi, bus.capacity)
                : Math.min(...perTrip) === Math.max(...perTrip) ? isiTeks(perTrip[0], bus.capacity)
                  : `${Math.min(...perTrip)}–${isiTeks(Math.max(...perTrip), bus.capacity)}`;
              return (
                <button
                  key={bus.id}
                  type="button"
                  aria-pressed={pilih === bus.id}
                  onClick={() => setPilih(bus.id)}
                  className={cx("flex w-full items-center gap-3 border-b border-outline-variant px-4 py-2.5 text-left text-body-medium",
                    pilih === bus.id ? "bg-accent-soft" : "hover:bg-primary-soft")}
                >
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="text-on-surface">{bus.code}</span>
                    {lebih ? <StatusChip dot tone="error">Over capacity</StatusChip> : null}
                  </span>
                  <span className="w-28 shrink-0 truncate text-on-surface-variant max-sm:hidden">{bus.plate_number ?? EMPTY_VALUE}</span>
                  <span className={cx("w-36 shrink-0 text-right tabular-nums", lebih ? "text-error" : "text-on-surface")}>{teksIsi}</span>
                </button>
              );
            })}
          </>
        )}
      </PaneBody>
      {data.vehicles.length > 0 ? (
        <PaneFooter note={adaTrip
          ? (kurangDiTrip === 0 ? "Every participant has a vehicle on every trip." : `${kurangDiTrip.toLocaleString("en-GB")} of ${plural(data.participants.length, "participant")} are missing a vehicle on a trip.`)
          : tanpaBus === 0 ? "Every participant has a default vehicle." : `${tanpaBus.toLocaleString("en-GB")} of ${plural(data.participants.length, "participant")} have no default vehicle.`} />
      ) : null}
    </Pane>
  );

  const bus = pilih !== null ? busById.get(pilih) ?? null : null;
  const isiBus = bus ? penumpang.get(bus.id) ?? [] : [];
  const kata = cari.trim().toLowerCase();
  const isiTampil = kata ? isiBus.filter((orang) => orang.name.toLowerCase().includes(kata) || (orang.company ?? "").toLowerCase().includes(kata)) : isiBus;
  const sisa = bus?.capacity != null ? bus.capacity - isiBus.length : undefined;

  const detail = bus ? (
    <Pane as="aside" aria-label={`${bus.code} details`}>
      <KepalaDetail
        nama={bus.code}
        chip={lebihDi(bus) > 0 ? { tone: "error", teks: `Over capacity on ${plural(lebihDi(bus), "trip")}` } : null}
        sub={[bus.plate_number, bus.capacity === null ? "No capacity limit" : plural(bus.capacity, "seat")].filter(Boolean).join(" · ")}
        angka={isiTeks(isiBus.length, bus.capacity)}
        keterangan="default passengers"
        onClose={() => setPilih(null)}
      />
      <PaneBody>
        <DetailSection title="On each trip">
          {data.trips.length === 0 ? (
            <p className="text-body-medium text-on-surface-variant">No trips yet. Create them under Trips so participants can see their vehicle schedule.</p>
          ) : (
            <ul className="flex flex-col">
              {data.trips.map((agenda) => {
                const baris = data.overview.find((o) => o.trip_id === agenda.id && o.vehicle_id === bus.id);
                const isi = baris?.load ?? 0;
                return (
                  <li key={agenda.id} className="flex items-center gap-3 py-1.5 text-body-medium">
                    <span className="min-w-0 flex-1 truncate text-on-surface">{agenda.name}</span>
                    {baris?.over_capacity ? <StatusChip dot tone="error">Over</StatusChip> : null}
                    <span className={cx("shrink-0 tabular-nums", baris?.over_capacity ? "text-error" : "text-on-surface-variant")}>{isiTeks(isi, bus.capacity)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </DetailSection>
        {bus.crew_contact ? (
          <DetailSection title="Crew">
            <p className="whitespace-pre-line text-body-medium text-on-surface">{bus.crew_contact}</p>
            <p className="text-body-small text-on-surface-variant">{!tampil.crew ? "Not shown to participants." : kendaraanTampil ? "Shown to this vehicle's passengers in their Participant area." : !tampil.logistics ? "Not shown yet: Logistics is off in the Participant area." : "Not shown: vehicles are hidden from participants."}</p>
          </DetailSection>
        ) : null}
        <DetailSection title="Default passengers">
          {isiBus.length > 12 ? <KolomCari label="Search passengers" placeholder="Search name or organisation" value={cari} onChange={setCari} /> : null}
          {isiBus.length === 0 ? (
            <p className="text-body-medium text-on-surface-variant">No passengers yet. Add them with the button below.</p>
          ) : (
            <ul className="flex flex-col">
              {isiTampil.slice(0, 300).map((orang) => (
                <BarisOrang
                  key={orang.id}
                  orang={orang}
                  aksi={
                    <IconButton simpan size="sm" label={`Remove ${orang.name} from ${bus.code}`} disabled={busy}
                      onClick={() => void kirim("/api/admin/logistik/penumpang", "POST", { trip_id: null, vehicle_id: null, participant_ids: [orang.id] })}>
                      <SignOut size={16} />
                    </IconButton>
                  }
                />
              ))}
            </ul>
          )}
        </DetailSection>
      </PaneBody>
      <PaneFooter note={sisa === undefined ? undefined : sisa > 0 ? `${plural(sisa, "seat")} left` : "Vehicle full"}>
        {isiBus.length === 0 ? (
          <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus(bus)}>Delete</Button>
        ) : null}
        <Button variant="outlined" size="sm" onClick={() => setUbah(bus)}>Edit</Button>
        <Button simpan size="sm" disabled={busy || (sisa !== undefined && sisa <= 0)} onClick={() => setTambah(true)}>Add passengers</Button>
      </PaneFooter>
    </Pane>
  ) : null;

  return (
    <>
      <ListDetail list={daftar} detail={detail} />

      {bus ? (
        <PilihPeserta
          open={tambah}
          onClose={() => setTambah(false)}
          title={`Add passengers to ${bus.code}`}
          description="The default vehicle applies on every trip that uses default vehicles. Changes for a single trip are set under Trips."
          peserta={data.participants}
          utama={(orang) => !bawaan.has(orang.id)}
          labelUtama="Participants without a default vehicle."
          keterangan={(orang) => {
            const lama = bawaan.get(orang.id);
            return lama !== undefined ? `Now on ${busById.get(lama)?.code ?? "another vehicle"}` : null;
          }}
          alasanTolak={(orang) => (bawaan.get(orang.id) === bus.id ? `Already on ${bus.code}` : null)}
          batas={sisa !== undefined ? Math.max(sisa, 0) : undefined}
          tombol={`Assign to ${bus.code}`}
          busy={busy}
          onSubmit={async (ids) => Boolean(await kirim("/api/admin/logistik/penumpang", "POST", { trip_id: null, vehicle_id: bus.id, participant_ids: ids }))}
        />
      ) : null}

      <DialogTampilan
        open={tampilan}
        onClose={() => setTampilan(false)}
        busy={busy}
        awal={{ plate: tampil.plate, crew: tampil.crew, vehicles: !(tampil.hidden ?? []).includes("vehicles") }}
        logistik={tampil.logistics}
        simpan={async (nilai) => {
          const lama = tampil.hidden ?? [];
          // Bagian lain dibiarkan seperti yang dimuat; hanya Vehicle yang diubah di sini.
          const hidden = nilai.vehicles ? lama.filter((bagian) => bagian !== "vehicles") : [...new Set([...lama, "vehicles"])];
          const ubahBagian = nilai.vehicles === lama.includes("vehicles") ? { hide_logistics: hidden } : {};
          return Boolean(await kirim("/api/admin/area-peserta", "PATCH", { member: { show_bus_plate: nilai.plate, show_bus_crew: nilai.crew, ...ubahBagian } }));
        }}
      />

      <FormBus
        bus={baru ? { id: 0, code: "", capacity: null, plate_number: null, crew_contact: null, sort_order: 0 } : ubah}
        busy={busy}
        onClose={() => { setUbah(null); tutupBaru(); }}
        simpan={async (nilai, id) => {
          const hasil = await kirim("/api/admin/logistik/data/bus", id ? "PATCH" : "POST", id ? { id, ...nilai } : { ...nilai, sort_order: data.vehicles.length });
          if (hasil && !id) setPilih((hasil as Bus).id);
          return Boolean(hasil);
        }}
      />

      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!busy}
        tone="danger"
        title={`Delete ${hapus?.code ?? ""}?`}
        description="This vehicle has no default passengers. If a trip still uses it as a replacement, it cannot be deleted. This cannot be undone."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={async () => {
              const target = hapus;
              setHapus(null);
              if (target && await kirim(`/api/admin/logistik/data/bus?id=${target.id}`, "DELETE")) setPilih(null);
            }}>Delete vehicle</Button>
          </>
        }
      />
    </>
  );
}

type NilaiBus = { code: string; capacity: number | null; plate_number: string | null; crew_contact: string | null };

function FormBus({ bus, busy, onClose, simpan }: {
  /** `id` 0 = bus baru. Null = dialog tertutup. */
  bus: Bus | null;
  busy: boolean;
  onClose: () => void;
  simpan: (nilai: NilaiBus, id?: number) => Promise<boolean>;
}) {
  const awal = { code: bus?.code ?? "", capacity: bus?.capacity != null ? String(bus.capacity) : "", plate_number: bus?.plate_number ?? "", crew_contact: bus?.crew_contact ?? "" };
  const [draf, setDraf] = useState<typeof awal | null>(null);
  const nilai = draf ?? awal;
  const ubah = (kolom: keyof typeof awal, isi: string) => setDraf({ ...nilai, [kolom]: isi });
  function tutup() { setDraf(null); onClose(); }

  const kapasitas = angkaAtauNull(nilai.capacity);
  const galatKapasitas = nilai.capacity.trim() && (kapasitas === null || kapasitas < 1 || kapasitas > 200) ? "Enter 1 to 200, or leave empty." : undefined;
  const sah = Boolean(nilai.code.trim()) && !galatKapasitas;
  const lama = bus && bus.id > 0 ? bus : null;

  async function kirimForm() {
    if (!sah) return;
    const ok = await simpan({
      code: nilai.code.trim(), capacity: kapasitas, plate_number: nilai.plate_number.trim() || null, crew_contact: nilai.crew_contact.trim() || null,
    }, lama?.id);
    if (ok) tutup();
  }

  return (
    <Dialog
      open={bus !== null}
      onClose={tutup}
      dismissible={!busy}
      title={lama ? `Edit ${lama.code}` : "New vehicle"}
      icon={<IkonBus size={20} />}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan type="submit" form="form-bus" loading={busy} disabled={!sah}>{lama ? "Save vehicle" : "Add vehicle"}</Button>
        </>
      }
    >
      <form id="form-bus" className="grid grid-cols-2 gap-4" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        <TextField label="Vehicle name" placeholder="e.g. Bus 1, Hiace 2 or Elf 3" hint="Put the type in the name. Participants see it as written." autoFocus value={nilai.code} onChange={(event) => ubah("code", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Capacity" optional type="number" inputMode="numeric" min={1} max={200} value={nilai.capacity} error={galatKapasitas} hint="Leave empty for no limit." onChange={(event) => ubah("capacity", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Plate number" optional value={nilai.plate_number} onChange={(event) => ubah("plate_number", event.target.value)} className="col-span-2" />
        <TextField label="Crew contact" optional placeholder="Name and phone number" hint="Staff only." value={nilai.crew_contact} onChange={(event) => ubah("crew_contact", event.target.value)} className="col-span-2" />
      </form>
    </Dialog>
  );
}

/* ========================================================= Agenda bus */

export function TabAgenda({ data, kirim, busy, baru, tutupBaru, atas, pilihAwal }: TabProps & {
  atas?: ReactNode;
  /** Trip yang langsung terpilih (?tab=bus&trip=, dari "Edit in Logistics" di Agenda). */
  pilihAwal?: number | null;
}) {
  const { zone, abbr } = useEventTimeZone();
  const { orangById, busById, bawaan, pengganti, busDi } = usePetaBus(data);
  // Sebelum migrasi 202610170002 trip belum bisa ditautkan: tidak ada pemilih
  // yang bisa dipakai lalu gagal saat disimpan, dan panel detail tetap seperti dulu.
  const siapTautan = data.trip_agenda_ready;
  const agendaTrip = useAgendaTrip(siapTautan);
  // Isi bagian Agenda row untuk trip tertaut. Reload memindahkan fokus ke sini.
  const kotakTautan = useRef<HTMLDivElement | null>(null);
  const [pilih, setPilih] = useState<number | null>(pilihAwal ?? null);
  const [ubah, setUbah] = useState<Agenda | null>(null);
  const [ganti, setGanti] = useState(false);
  const [tujuan, setTujuan] = useState<string>("");
  const [hapus, setHapus] = useState<Agenda | null>(null);

  const agendaBaru: Agenda = { id: 0, name: "", depart_at: null, origin: null, destination: null, meeting_point: null, follows_default: true, sort_order: 0, rundown_item_id: null };
  const muatan = (agenda: Agenda) => data.overview.filter((baris) => baris.trip_id === agenda.id);
  /** Baris Agenda tautan trip ini beserta tabnya, bila sudah dimuat. */
  const lokasiTrip = (agenda: Agenda) => (agenda.rundown_item_id !== null ? agendaTrip.agenda?.peta.baris.get(agenda.rundown_item_id) ?? null : null);
  const ganda = (tanggal: string) => (agendaTrip.agenda ? tanggalGanda(agendaTrip.agenda.bagian, tanggal) : false);
  const keteranganChip = (agenda: Agenda) => {
    const lokasi = lokasiTrip(agenda);
    if (!lokasi) return "Linked to an agenda row";
    const tab = ganda(lokasi.bagian.event_date) ? `, in the ${lokasi.bagian.name.trim()} tab` : "";
    return `Linked to agenda row ${teksBaris(lokasi.bagian.event_date, lokasi.baris.start_time, lokasi.baris.title)}${tab}`;
  };

  const daftar = (
    <Pane aria-label="Vehicle trips">
      {atas ? <PaneHeader className="px-3 py-2.5">{atas}</PaneHeader> : null}
      {data.trips.length > 0 && data.vehicles.length === 0 ? (
        <PaneHeader className="text-body-medium text-on-surface-variant">No vehicles yet. Add them under Vehicles before assigning participants.</PaneHeader>
      ) : null}
      <PaneBody>
        {data.trips.length === 0 ? (
          <EmptyState
            plain
            icon={<CalendarDots size={40} />}
            title="No vehicle trips yet"
            description="A trip is one journey, such as Hotel to venue or Gala dinner. Create one with Add trip at the top right; participants see their vehicle for each trip."
          />
        ) : (
          <>
            <KepalaKolom kolom={[["Trip", "min-w-0 flex-1"], ["Departs", "w-36 max-sm:hidden"], ["Passengers", "w-24 text-right"]]} />
            {data.trips.map((agenda) => {
              const isi = muatan(agenda);
              const total = isi.reduce((jumlah, baris) => jumlah + baris.load, 0);
              const lebih = isi.some((baris) => baris.over_capacity);
              return (
                <button
                  key={agenda.id}
                  type="button"
                  aria-pressed={pilih === agenda.id}
                  onClick={() => setPilih(agenda.id)}
                  className={cx("flex w-full items-center gap-3 border-b border-outline-variant px-4 py-2.5 text-left text-body-medium",
                    pilih === agenda.id ? "bg-accent-soft" : "hover:bg-primary-soft")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-on-surface">{agenda.name}</span>
                      {agenda.rundown_item_id !== null ? <StatusChip tone="neutral" title={keteranganChip(agenda)}>Agenda</StatusChip> : null}
                      {!agenda.follows_default ? <StatusChip tone="neutral">Own list</StatusChip> : null}
                      {lebih ? <StatusChip dot tone="error">Vehicle over capacity</StatusChip> : null}
                    </span>
                    {agenda.origin || agenda.destination ? (
                      <span className="block truncate text-on-surface-variant">{[agenda.origin, agenda.destination].filter(Boolean).join(" to ")}</span>
                    ) : null}
                  </span>
                  <span className="w-36 shrink-0 text-on-surface-variant max-sm:hidden">{agenda.depart_at ? formatWaktu(agenda.depart_at, zone) : EMPTY_VALUE}</span>
                  <span className="w-24 shrink-0 text-right tabular-nums text-on-surface">{total}</span>
                </button>
              );
            })}
          </>
        )}
      </PaneBody>
    </Pane>
  );

  const agenda = pilih !== null ? data.trips.find((t) => t.id === pilih) ?? null : null;
  const daftarGanti = agenda ? [...(pengganti.get(agenda.id) ?? new Map()).entries()]
    .map(([id, busId]) => ({ orang: orangById.get(id)!, busId }))
    .filter((baris) => baris.orang)
    .sort((a, b) => a.orang.name.localeCompare(b.orang.name, "id")) : [];

  const detail = agenda ? (() => {
    const isi = muatan(agenda);
    const total = isi.reduce((jumlah, baris) => jumlah + baris.load, 0);
    const lebih = isi.filter((baris) => baris.over_capacity);
    const lokasi = lokasiTrip(agenda);
    const selisih = lokasi && agenda.depart_at ? selisihMenit(keInputWaktu(agenda.depart_at, zone), lokasi.bagian.event_date, lokasi.baris.start_time) : null;
    return (
      <Pane as="aside" aria-label={`Trip ${agenda.name} details`}>
        <KepalaDetail
          nama={agenda.name}
          sub={agenda.depart_at ? `Departs ${formatWaktu(agenda.depart_at, zone)} ${abbr}` : "No departure time yet"}
          angka={total}
          keterangan={`${total === 1 ? "passenger" : "passengers"} on ${plural(isi.filter((baris) => baris.load > 0).length, "bus", "buses")}`}
          onClose={() => setPilih(null)}
        />
        <PaneBody>
          {lebih.length > 0 ? (
            <div className="px-5 pt-4">
              <Banner tone="error" icon={<Warning size={18} />}>
                {lebih.map((baris) => busById.get(baris.vehicle_id)?.code).join(", ")} over capacity on this trip. Move some passengers to another vehicle.
              </Banner>
            </div>
          ) : null}
          {/* Tautannya disunting di dialog Edit; Agenda hanya dibuka untuk barisnya. */}
          {siapTautan ? (
            <DetailSection
              title="Agenda row"
              action={lokasi ? (
                <Link href={hrefBarisAgenda(lokasi)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm text-body-medium font-medium text-primary hover:underline">
                  Edit in Agenda
                  <ArrowSquareOut size={14} aria-hidden />
                  <span className="sr-only">(new tab)</span>
                </Link>
              ) : null}
            >
              {agenda.rundown_item_id === null ? (
                <p className="text-body-medium text-on-surface-variant">Not linked. Pick a row under Edit so participants see their vehicle on it in their schedule.</p>
              ) : (
                // Satu wadah untuk semua keadaan tautan: fokus dari Reload tetap
                // di sini saat tombolnya hilang bersama pesan gagalnya.
                <div ref={kotakTautan} tabIndex={-1} className="text-body-medium outline-none">
                  {lokasi ? (
                    <>
                      <p className="text-on-surface">{teksBaris(lokasi.bagian.event_date, lokasi.baris.start_time, lokasi.baris.title)}</p>
                      {ganda(lokasi.bagian.event_date) ? <p className="text-on-surface-variant">In the {lokasi.bagian.name.trim()} tab.</p> : null}
                      {selisih !== null ? <p className="text-on-surface-variant">{keteranganTrip(selisih)}</p> : null}
                    </>
                  ) : agendaTrip.memuat ? (
                    <p className="text-on-surface-variant">Loading agenda…</p>
                  ) : agendaTrip.agenda ? (
                    <p className="text-on-surface-variant">This row is no longer in the agenda. Reload the page.</p>
                  ) : (
                    <p className="text-on-surface-variant">
                      Agenda failed to load.{" "}
                      <button type="button" onClick={() => { kotakTautan.current?.focus(); agendaTrip.muatUlang(); }} className="font-medium text-primary underline">Reload</button>
                    </p>
                  )}
                </div>
              )}
            </DetailSection>
          ) : null}
          <DetailSection>
            <Switch simpan
              checked={agenda.follows_default}
              disabled={busy}
              onChange={(nilai) => void kirim("/api/admin/logistik/data/agenda", "PATCH", { id: agenda.id, follows_default: nilai })}
              label="Use default vehicles"
              description={agenda.follows_default
                ? "Participants ride their default vehicle, except those changed below."
                : "Own list: only participants assigned below ride a vehicle on this trip."}
            />
          </DetailSection>
          <DetailSection title="Vehicle load">
            {data.vehicles.length === 0 ? (
              <p className="text-body-medium text-on-surface-variant">No vehicles yet. Add them under Vehicles.</p>
            ) : (
              <ul className="flex flex-col">
                {isi.map((baris) => {
                  const bus = busById.get(baris.vehicle_id);
                  if (!bus) return null;
                  return (
                    <li key={baris.vehicle_id} className="flex items-center gap-3 py-1.5 text-body-medium">
                      <span className="min-w-0 flex-1 truncate text-on-surface">{bus.code}</span>
                      {baris.over_capacity ? <StatusChip dot tone="error">Over</StatusChip> : null}
                      <span className={cx("shrink-0 tabular-nums", baris.over_capacity ? "text-error" : "text-on-surface-variant")}>{isiTeks(baris.load, bus.capacity)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </DetailSection>
          <DetailSection title={agenda.follows_default ? "Changed on this trip" : "Passengers on this trip"}>
            {daftarGanti.length === 0 ? (
              <p className="text-body-medium text-on-surface-variant">
                {agenda.follows_default ? "None. Every participant rides their default vehicle." : "None yet. Assign participants with the button below."}
              </p>
            ) : (
              <ul className="flex flex-col">
                {daftarGanti.slice(0, 300).map(({ orang, busId }) => {
                  const asal = bawaan.get(orang.id);
                  const ket = busId === null ? "No vehicle" : busById.get(busId)?.code ?? "Another vehicle";
                  return (
                    <BarisOrang
                      key={orang.id}
                      orang={orang}
                      keterangan={agenda.follows_default && asal !== undefined ? `${ket}, usually ${busById.get(asal)?.code ?? "another vehicle"}` : ket}
                      aksi={
                        <IconButton simpan size="sm" disabled={busy}
                          label={agenda.follows_default ? `Return ${orang.name} to their default vehicle` : `Remove ${orang.name} from this trip`}
                          onClick={() => void kirim("/api/admin/logistik/penumpang", "DELETE", { trip_id: agenda.id, participant_ids: [orang.id] })}>
                          {agenda.follows_default ? <ArrowCounterClockwise size={16} /> : <SignOut size={16} />}
                        </IconButton>
                      }
                    />
                  );
                })}
              </ul>
            )}
          </DetailSection>
          <DetailSection title="What participants see">
            <dl className="flex flex-col gap-2">
              <KeyValue label="From">{agenda.origin ?? EMPTY_VALUE}</KeyValue>
              <KeyValue label="To">{agenda.destination ?? EMPTY_VALUE}</KeyValue>
              <KeyValue label="Meeting point">{agenda.meeting_point ?? EMPTY_VALUE}</KeyValue>
            </dl>
          </DetailSection>
        </PaneBody>
        <PaneFooter>
          <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus(agenda)}>Delete</Button>
          <Button variant="outlined" size="sm" onClick={() => setUbah(agenda)}>Edit</Button>
          <Button simpan size="sm" disabled={busy || data.vehicles.length === 0} onClick={() => { setTujuan(String(data.vehicles[0]?.id ?? "")); setGanti(true); }}>
            {agenda.follows_default ? "Change participants' vehicle" : "Assign participants"}
          </Button>
        </PaneFooter>
      </Pane>
    );
  })() : null;

  const busTujuan = tujuan === "none" ? null : Number(tujuan) || null;

  return (
    <>
      <ListDetail list={daftar} detail={detail} />

      {agenda ? (
        <PilihPeserta
          open={ganti}
          onClose={() => setGanti(false)}
          title={agenda.follows_default ? `Change vehicle on ${agenda.name}` : `Assign participants to ${agenda.name}`}
          description="Applies to this trip only. Participants' default vehicle does not change."
          peserta={data.participants}
          utama={(orang) => !(pengganti.get(agenda.id)?.has(orang.id))}
          labelUtama={agenda.follows_default ? "Participants not yet changed on this trip." : "Participants not yet assigned on this trip."}
          keterangan={(orang) => {
            const sekarang = busDi(agenda, orang.id);
            return sekarang === null ? "Now: no vehicle" : `Now on ${busById.get(sekarang)?.code ?? "another vehicle"}`;
          }}
          alasanTolak={(orang) => (pengganti.get(agenda.id)?.has(orang.id) && busDi(agenda, orang.id) === busTujuan ? "Already here" : null)}
          tombol="Save assignments"
          busy={busy}
          onSubmit={async (ids) => Boolean(await kirim("/api/admin/logistik/penumpang", "POST", { trip_id: agenda.id, vehicle_id: busTujuan, participant_ids: ids }))}
        >
          <SelectField label="Vehicle" value={tujuan} onChange={(event) => setTujuan(event.target.value)}>
            {data.vehicles.map((bus) => <option key={bus.id} value={bus.id}>{bus.code}</option>)}
            <option value="none">No vehicle on this trip</option>
          </SelectField>
        </PilihPeserta>
      ) : null}

      <FormAgenda
        agenda={baru ? agendaBaru : ubah}
        trips={data.trips}
        siapTautan={siapTautan}
        agendaTrip={agendaTrip}
        busy={busy}
        zone={zone}
        onClose={() => { setUbah(null); tutupBaru(); }}
        simpan={async (nilai, id) => {
          const hasil = await kirim("/api/admin/logistik/data/agenda", id ? "PATCH" : "POST", id ? { id, ...nilai } : { ...nilai, sort_order: data.trips.length });
          if (hasil && !id) setPilih((hasil as Agenda).id);
          return Boolean(hasil);
        }}
      />

      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!busy}
        tone="danger"
        title={`Delete trip ${hapus?.name ?? ""}?`}
        description={`This also deletes ${plural(hapus ? pengganti.get(hapus.id)?.size ?? 0 : 0, "assignment")} made for this trip only. Participants' default vehicle does not change. This cannot be undone.`}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={async () => {
              const target = hapus;
              setHapus(null);
              if (target && await kirim(`/api/admin/logistik/data/agenda?id=${target.id}`, "DELETE")) setPilih(null);
            }}>Delete trip</Button>
          </>
        }
      />
    </>
  );
}

type NilaiAgenda = Omit<Agenda, "id" | "sort_order">;

/**
 * Dialog New trip / Edit trip.
 *
 * Kolom pertama, Agenda row, menautkan trip ke satu baris Agenda. Memilih
 * baris mengisi Trip name dan Departs selama keduanya kosong atau masih berisi
 * isian baris sebelumnya (Edit trip tertaut: baris tautannya); yang sudah
 * diketik tidak ditimpa, dan petunjuk di bawah Departs menyebut selisihnya
 * terhadap baris itu (12 jam atau lebih: peringatan dengan tombol perbaikan,
 * simpan tetap boleh). Sebelum migrasi 202610170002 kolom itu diganti catatan.
 *
 * Edit hanya mengirim kolom yang berubah: jam trip tertaut bisa digeser dari
 * Agenda (pemicu database) sejak dialog ini dibuka, dan simpanan yang tidak
 * menyentuh Departs tidak boleh mengembalikannya ke jam lama.
 */
function FormAgenda({ agenda, trips, siapTautan, agendaTrip, busy, zone, onClose, simpan }: {
  /** `id` 0 = agenda baru. Null = dialog tertutup. */
  agenda: Agenda | null;
  /** Semua trip acara ini: "Used by" di pemilih baris dan petunjuk nama yang mirip. */
  trips: Agenda[];
  /** false = kolom tautan Agenda belum ada di database (`trip_agenda_ready`). */
  siapTautan: boolean;
  agendaTrip: AgendaTrip;
  busy: boolean;
  zone: ReturnType<typeof useEventTimeZone>["zone"];
  onClose: () => void;
  simpan: (nilai: Partial<NilaiAgenda>, id?: number) => Promise<boolean>;
}) {
  const awal = {
    rundown_item_id: agenda?.rundown_item_id ?? null,
    name: agenda?.name ?? "", depart_at: keInputWaktu(agenda?.depart_at ?? null, zone), origin: agenda?.origin ?? "",
    destination: agenda?.destination ?? "", meeting_point: agenda?.meeting_point ?? "", follows_default: agenda?.follows_default ?? true,
  };
  const [draf, setDraf] = useState<typeof awal | null>(null);
  // Isian terakhir dari baris Agenda. Kolom yang masih sama dengan ini belum
  // diubah tangan, jadi boleh diganti saat baris lain dipilih. Sebelum ada
  // pilihan di dialog ini, isiannya dari baris tautan trip (Edit): jam yang
  // masih sama dengan jam mulai baris itu ikut pindah ke baris baru.
  const [isian, setIsian] = useState<{ name: string; depart_at: string } | null>(null);
  const kolomBerangkat = useRef<HTMLDivElement | null>(null);
  const nilai = draf ?? awal;
  function tutup() { setDraf(null); setIsian(null); onClose(); }
  const lama = agenda && agenda.id > 0 ? agenda : null;
  const sah = Boolean(nilai.name.trim());

  const lain = trips.filter((trip) => trip.id !== lama?.id);
  const dipakai = new Map<number, string[]>();
  for (const trip of lain) {
    if (trip.rundown_item_id !== null) dipakai.set(trip.rundown_item_id, [...(dipakai.get(trip.rundown_item_id) ?? []), trip.name]);
  }
  const lokasiDari = (id: number | null) => (id !== null ? agendaTrip.agenda?.peta.baris.get(id) ?? null : null);
  const isianDari = (pilihan: NonNullable<ReturnType<typeof lokasiDari>>) => ({
    name: pilihan.baris.title.trim(),
    depart_at: `${pilihan.bagian.event_date}T${jamPendek(pilihan.baris.start_time)}`,
  });
  const lokasi = lokasiDari(nilai.rundown_item_id);
  const lokasiAwal = lokasiDari(awal.rundown_item_id);
  const isianKini = isian ?? (lokasiAwal ? isianDari(lokasiAwal) : null);
  // Baris yang sama di Batch 1 dan Batch 2 mengisi nama yang sama: petunjuknya
  // menyebut trip yang sudah ada sebagai contoh pembeda, bukan menebaknya.
  const namaLain = namaMirip(nilai.name, lain.map((trip) => trip.name));
  const petunjukJam = lokasi && nilai.depart_at ? petunjukBerangkat(nilai.depart_at, lokasi.bagian.event_date, lokasi.baris.start_time) : null;

  function pilihBaris(id: number | null) {
    const pilihan = lokasiDari(id);
    if (!pilihan) {
      setDraf({ ...nilai, rundown_item_id: id });
      return;
    }
    const isi = isianDari(pilihan);
    setDraf({
      ...nilai,
      rundown_item_id: id,
      name: !nilai.name.trim() || nilai.name === isianKini?.name ? isi.name : nilai.name,
      depart_at: !nilai.depart_at || nilai.depart_at === isianKini?.depart_at ? isi.depart_at : nilai.depart_at,
    });
    setIsian(isi);
  }

  function perbaikiJam(isi: string) {
    setDraf({ ...nilai, depart_at: isi });
    // Tombolnya hilang bersama peringatannya; fokus pindah ke kolom yang baru diperbaiki.
    window.requestAnimationFrame(() => kolomBerangkat.current?.querySelector("input")?.focus());
  }

  const bentuk = (isi: typeof awal): NilaiAgenda => ({
    rundown_item_id: isi.rundown_item_id,
    name: isi.name.trim(), depart_at: dariInputWaktu(isi.depart_at, zone), origin: isi.origin.trim() || null,
    destination: isi.destination.trim() || null, meeting_point: isi.meeting_point.trim() || null, follows_default: isi.follows_default,
  });

  async function kirimForm() {
    if (!sah) return;
    const isi = bentuk(nilai);
    let ok: boolean;
    if (lama) {
      const semula = bentuk(awal);
      const berubah = Object.fromEntries(Object.entries(isi).filter(([kolom, isiKolom]) => isiKolom !== semula[kolom as keyof NilaiAgenda])) as Partial<NilaiAgenda>;
      if (Object.keys(berubah).length === 0) { tutup(); return; }
      ok = await simpan(berubah, lama.id);
    } else {
      // Trip baru tanpa baris tidak menyebut kolom tautannya: kolom itu belum
      // ada sebelum migrasi 202610170002, dan trip seperti ini harus tetap tersimpan.
      const { rundown_item_id: tautan, ...tanpaTautan } = isi;
      ok = await simpan(tautan === null ? tanpaTautan : isi);
    }
    if (ok) tutup();
  }

  return (
    <Dialog
      open={agenda !== null}
      onClose={tutup}
      dismissible={!busy}
      title={lama ? `Edit ${lama.name}` : "New trip"}
      icon={<CalendarDots size={20} />}
      description="The name, time and meeting point appear in the participant area with the vehicle name."
      // Dengan kolom Agenda row dialog ini melewati 90dvh di 1280x588: judul dan
      // tombol tetap, hanya isinya yang bergulir.
      scrollBody
      actions={
        <>
          {/* Alasan tombol utama mati, di sampingnya. Kosong saat tombolnya hidup. */}
          <span className="mr-auto self-center text-body-medium text-on-surface-variant empty:hidden" aria-live="polite">{sah ? "" : siapTautan ? "Pick a row or enter a name" : "Enter a name"}</span>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan type="submit" form="form-agenda" loading={busy} disabled={!sah}>{lama ? "Save trip" : "Add trip"}</Button>
        </>
      }
    >
      <form id="form-agenda" className="grid grid-cols-2 gap-4 pt-5" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        {siapTautan ? (
          <PilihBarisAgenda value={nilai.rundown_item_id} onChange={pilihBaris} agendaTrip={agendaTrip} dipakai={dipakai} />
        ) : (
          // Sama dengan Outfit di Agenda: tanpa kolomnya, tidak ada kontrol yang bisa dipakai lalu gagal saat disimpan.
          <p className="col-span-2 text-body-medium text-on-surface-variant">Linking a trip to an Agenda row needs a database update first (migration 202610170002).</p>
        )}
        {/* Fokus awal tetap di Trip name, seperti sebelum ada Agenda row: trip
            tanpa baris langsung diketik, dan pemilihnya satu Shift+Tab di atas. */}
        <TextField
          label="Trip name"
          placeholder="e.g. Hotel to venue"
          autoFocus
          value={nilai.name}
          hint={namaLain ? <>Another trip is named <span className="font-medium text-on-surface">{namaLain}</span>. Add what tells the two apart.</> : undefined}
          onChange={(event) => setDraf({ ...nilai, name: event.target.value })}
          className="col-span-2"
        />
        <div ref={kolomBerangkat} className="col-span-2">
          <TextField
            label="Departs"
            optional
            type="datetime-local"
            value={nilai.depart_at}
            warning={petunjukJam?.jenis === "peringatan"}
            hint={petunjukJam?.teks}
            // Tombol perbaikan di samping peringatan, bukan di dalamnya: kolom
            // ini dibacakan dengan kalimat peringatannya saja.
            hintAction={petunjukJam?.jenis === "peringatan" ? (
              <button type="button" onClick={() => perbaikiJam(petunjukJam.nilai)} className="inline-flex min-h-10 shrink-0 items-center rounded-sm text-body-medium font-semibold text-primary hover:underline">
                {petunjukJam.tombol}
              </button>
            ) : undefined}
            onChange={(event) => setDraf({ ...nilai, depart_at: event.target.value })}
          />
        </div>
        <TextField label="From" optional value={nilai.origin} onChange={(event) => setDraf({ ...nilai, origin: event.target.value })} className="max-sm:col-span-2" />
        <TextField label="To" optional value={nilai.destination} onChange={(event) => setDraf({ ...nilai, destination: event.target.value })} className="max-sm:col-span-2" />
        <TextField label="Meeting point" optional placeholder="e.g. Main lobby" value={nilai.meeting_point} onChange={(event) => setDraf({ ...nilai, meeting_point: event.target.value })} className="col-span-2" />
        {!lama ? (
          <Switch
            className="col-span-2"
            checked={nilai.follows_default}
            onChange={(follows) => setDraf({ ...nilai, follows_default: follows })}
            label="Use default vehicles"
            description="Turn off for a journey with its own passenger list, such as a return to two different destinations."
          />
        ) : null}
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------ Dialog */

type Tampilan = { plate: boolean; crew: boolean; vehicles: boolean };

/**
 * Yang peserta lihat tentang busnya, untuk seluruh acara (bukan per bus):
 * nama bus selalu, plat nomor dan kontak kru hanya bila dinyalakan. Disimpan
 * di `landing_config.member` lewat Area peserta, tempat sakelar portal lainnya.
 */
function DialogTampilan({ open, onClose, busy, awal, logistik, simpan }: {
  open: boolean;
  /** Sakelar induk Logistics di Participant area; mati = kartu Bus tidak tampil ke peserta sama sekali. */
  logistik: boolean;
  onClose: () => void;
  busy: boolean;
  awal: Tampilan;
  simpan: (nilai: Tampilan) => Promise<boolean>;
}) {
  const [draf, setDraf] = useState<Tampilan | null>(null);
  const nilai = draf ?? awal;
  function tutup() { setDraf(null); onClose(); }
  return (
    <Dialog
      open={open}
      onClose={tutup}
      dismissible={!busy}
      title="What participants see"
      description="These apply to every vehicle in this event, and only to the vehicles each participant rides."
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan loading={busy} onClick={async () => { if (await simpan(nilai)) tutup(); }}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!logistik ? (
          <p className="rounded-sm bg-surface-container-low px-3 py-2 text-body-small text-on-surface-variant">
            Participants don&apos;t see their vehicle yet, because Logistics is off. Turn it on in{" "}
            <Link href="/admin/area-peserta" className="rounded-sm font-medium text-primary hover:underline">Participant area</Link>.
          </p>
        ) : null}
        <Switch
          checked={nilai.vehicles}
          onChange={(vehicles) => setDraf({ ...nilai, vehicles })}
          label="Show vehicles to participants"
          description="Their vehicle name, such as Bus 3, on each trip: on the Travel tab, Home and the Next up reminder. Same setting as Vehicle and trips under Logistics in the Participant area."
        />
        <Switch
          checked={nilai.plate}
          disabled={!nilai.vehicles}
          onChange={(plate) => setDraf({ ...nilai, plate })}
          label="Plate number"
          description="Helps participants find their vehicle in the car park."
        />
        <Switch
          checked={nilai.crew}
          disabled={!nilai.vehicles}
          onChange={(crew) => setDraf({ ...nilai, crew })}
          label="Crew contact"
          description="Shown as written, with Call and WhatsApp buttons for the phone number. Ask the crew before turning this on."
        />
      </div>
    </Dialog>
  );
}
