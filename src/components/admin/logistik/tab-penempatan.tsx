"use client";

import { Bed, Plus, Bus as IkonBus, CaretLeft, CaretRight, MagnifyingGlass, Users, Warning, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Banner, Button, ChipMenu, Dialog, EmptyState, IconButton, ListDetail, Pane, PaneBody, PaneFooter, PaneHeader, SelectField, StatusChip, TextField, EMPTY_VALUE } from "@/components/m3";
import { kurangKendaraan, labelTripPendek, lengkapKendaraan, petaKendaraan, ringkasKendaraan, TEKS_KURANG } from "@/lib/logistik/kendaraan-trip";
import { bertabrakan, labelTanggal, rentangStay, stayPerPeserta, tanggalStay, tanggalZona, type Stay } from "@/lib/logistik/stay";
import { kunciGender, type LogistikPeserta } from "@/lib/logistik/types";
import { timeZoneOffset } from "@/lib/timezone";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import Link from "@/components/event-link";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { KolomCari, type Kirim, type TabProps } from "./bersama";
import { BannerAkibat, buatHunian, DialogStays, galatMalam, malamHotel, malamKeIso } from "./stay";

/**
 * Tab Penempatan: titik mulai Logistik.
 *
 * Panitia bekerja dari orang, bukan dari kamar: "siapa yang belum dapat kamar,
 * rombongan PT X taruh di mana". Karena itu layar pertama adalah satu tabel
 * seluruh peserta dengan kamar dan bus bawaannya, disaring ke yang belum
 * ditempatkan, lalu dicentang banyak sekaligus dan dimasukkan ke kamar atau bus
 * lewat satu dialog.
 *
 * Hotel dulu, kamar menyusul: dialog kamar juga menawarkan "Hotel only, room
 * later" per hotel. Rooming list dari hotel biasanya datang mepet, padahal
 * peserta sudah perlu tahu hotelnya (kartu Kamar, Rute, Agenda per hotel).
 *
 * Pindah hotel atau pindah kamar: peserta boleh punya beberapa stay (GRAMM
 * 5-6 lalu RAY 6-8, atau Royal 1208 5-6 lalu Royal 1410 6-8). Satu fakta per
 * kolom: Hotel, Room, Check-in dan Check-out masing-masing satu kolom, dengan
 * satu baris sejajar per stay di dalam baris orangnya. Setiap kolom itu
 * membuka dialog Stays orang itu.
 *
 * Tab Kamar dan Bus tetap ada untuk mengatur hotel, kamar, armada, dan
 * pengecualian per agenda; tab ini hanya menempatkan orang. Data orangnya
 * sendiri (nama, perusahaan, jawaban formulir) diurus di Daftar peserta, dan
 * nama di tabel ini membuka orang itu di sana.
 */

type Dialogs = "kamar" | "bus" | "lepas-kamar" | "lepas-bus" | null;

// Sama dengan Daftar peserta. Datanya tetap satu GET (saringan, hitungan, dan
// "pilih semua hasil saringan" butuh seluruh peserta), yang dipotong hanya
// baris yang digambar.
const PER_HALAMAN = 25;
/** Sama dengan batas `participant_ids` di route penghuni. */
const BATAS_KAMAR = 20;
const BATAS_HOTEL = 2000;
/** Batas `participant_id` per DELETE di route penghuni; lebih dari itu dikirim bertahap. */
const POTONG_LEPAS = 200;


export function TabPenempatan({ data, kirim, busy, keTab }: Pick<TabProps, "data" | "kirim" | "busy"> & { keTab: (tab: "kamar" | "bus") => void }) {
  const [cari, setCari] = useState("");
  const [saringKamar, setSaringKamar] = useState<string[]>([]);
  const [saringBus, setSaringBus] = useState<string[]>([]);
  const [saringPerusahaan, setSaringPerusahaan] = useState<string[]>([]);
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [halaman, setHalaman] = useState({ kunci: "", nomor: 0 });
  const [stayDibuka, setStayDibuka] = useState<string | null>(null);
  const { zone } = useEventTimeZone();
  const offset = timeZoneOffset(zone);

  const kunciField = data.settings.gender_field_key;

  const hotelById = useMemo(() => new Map(data.hotels.map((hotel) => [hotel.id, hotel])), [data.hotels]);
  const inapPeserta = useMemo(() => stayPerPeserta(data.lodging, hotelById), [data.lodging, hotelById]);
  const busPeserta = useMemo(
    () => new Map(data.transport.filter((b) => b.trip_id === null && b.vehicle_id !== null).map((b) => [b.participant_id, b.vehicle_id as number])),
    [data.transport],
  );
  const kamarById = useMemo(() => new Map(data.rooms.map((kamar) => [kamar.id, kamar])), [data.rooms]);
  const busById = useMemo(() => new Map(data.vehicles.map((bus) => [bus.id, bus])), [data.vehicles]);
  // Kendaraan yang dinaiki di tiap Trip (pengecualian, atau kendaraan utama bila
  // trip mengikutinya). Tanpa Trip: kendaraan utama saja, seperti sebelumnya.
  const kendaraan = useMemo(() => {
    const baca = petaKendaraan(data.transport, data.trips);
    return new Map(data.participants.map((orang) => [orang.id, baca(orang.id)]));
  }, [data.transport, data.trips, data.participants]);
  const kodeBus = (id: number) => busById.get(id)?.code ?? "Vehicle";

  const perusahaan = useMemo(() => {
    const hitung = new Map<string, number>();
    for (const orang of data.participants) hitung.set(orang.company ?? "", (hitung.get(orang.company ?? "") ?? 0) + 1);
    return [...hitung].sort((a, b) => a[0].localeCompare(b[0], "id"));
  }, [data.participants]);

  const tampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return data.participants.filter((orang) => {
      if (kata && !orang.name.toLowerCase().includes(kata) && !(orang.company ?? "").toLowerCase().includes(kata) && orang.qr_code.toLowerCase() !== kata) return false;
      const inap = inapPeserta.get(orang.id) ?? [];
      if (saringKamar[0] === "belum" && inap.length > 0) return false;
      if (saringKamar[0] === "menyusul" && !inap.some((s) => s.room_id === null)) return false;
      if (saringKamar[0] === "sudah" && !(inap.length > 0 && inap.every((s) => s.room_id !== null))) return false;
      if (saringKamar[0] === "pindah" && inap.length < 2) return false;
      if (saringBus[0] === "belum" && !kurangKendaraan(kendaraan.get(orang.id)!)) return false;
      if (saringBus[0] === "sudah" && !lengkapKendaraan(kendaraan.get(orang.id)!)) return false;
      if (saringPerusahaan.length > 0 && !saringPerusahaan.includes(orang.company ?? "")) return false;
      return true;
    });
  }, [data.participants, cari, saringKamar, saringBus, saringPerusahaan, inapPeserta, kendaraan]);

  // Saringan berubah, halaman kembali ke 1. Disetel saat render, bukan di efek,
  // supaya tidak ada satu bingkai yang menampilkan halaman 5 dari hasil baru.
  const kunciSaringan = JSON.stringify([cari.trim(), saringKamar, saringBus, saringPerusahaan]);
  if (halaman.kunci !== kunciSaringan) setHalaman({ kunci: kunciSaringan, nomor: 0 });
  const jumlahHalaman = Math.max(1, Math.ceil(tampil.length / PER_HALAMAN));
  const nomorHalaman = Math.min(halaman.kunci === kunciSaringan ? halaman.nomor : 0, jumlahHalaman - 1);
  const barisHalaman = tampil.slice(nomorHalaman * PER_HALAMAN, (nomorHalaman + 1) * PER_HALAMAN);
  const keHalaman = (nomor: number) => setHalaman({ kunci: kunciSaringan, nomor });

  const adaSaringan = Boolean(cari.trim()) || saringKamar.length + saringBus.length + saringPerusahaan.length > 0;
  const dipilih = data.participants.filter((orang) => pilih.has(orang.id));
  const semuaHalamanDipilih = barisHalaman.length > 0 && barisHalaman.every((orang) => pilih.has(orang.id));
  const sebagianDipilih = !semuaHalamanDipilih && barisHalaman.some((orang) => pilih.has(orang.id));
  const semuaTampilDipilih = tampil.length > 0 && tampil.every((orang) => pilih.has(orang.id));
  const belumHotel = data.participants.filter((orang) => !inapPeserta.has(orang.id)).length;
  const menungguKamar = data.participants.filter((orang) => inapPeserta.get(orang.id)?.some((s) => s.room_id === null)).length;
  const pindahHotel = data.participants.filter((orang) => (inapPeserta.get(orang.id)?.length ?? 0) > 1).length;
  const belumBus = data.participants.filter((orang) => kurangKendaraan(kendaraan.get(orang.id)!)).length;
  const adaTrip = data.trips.length > 0;

  function ubah(id: string, centang: boolean) {
    setPilih((lama) => {
      const baru = new Set(lama);
      if (centang) baru.add(id); else baru.delete(id);
      return baru;
    });
  }

  function pilihBanyak(orang: typeof tampil, centang: boolean) {
    setPilih((lama) => {
      const baru = new Set(lama);
      for (const o of orang) if (centang) baru.add(o.id); else baru.delete(o.id);
      return baru;
    });
  }

  function hapusSaringan() {
    setCari(""); setSaringKamar([]); setSaringBus([]); setSaringPerusahaan([]);
  }

  async function selesai(hasil: unknown) {
    if (hasil === null) return false;
    setPilih(new Set());
    setDialog(null);
    return true;
  }

  const adaInap = dipilih.filter((orang) => inapPeserta.has(orang.id));
  const orangStay = stayDibuka ? data.participants.find((orang) => orang.id === stayDibuka) ?? null : null;

  const toolbar = pilih.size > 0 ? (
    <PaneHeader className="flex-wrap gap-2 px-3 py-2.5">
      <span className="mr-1 text-body-medium tabular-nums text-on-surface" aria-live="polite">{pilih.size.toLocaleString("en-GB")} selected</span>
      {/* Centang di kepala tabel memilih satu halaman. Rombongan satu perusahaan
          bisa lebih dari 25 orang, jadi sisanya dipilih dari sini, bukan dengan
          membuka halaman demi halaman. */}
      {semuaHalamanDipilih && !semuaTampilDipilih ? (
        <Button variant="text" size="sm" onClick={() => pilihBanyak(tampil, true)}>
          {adaSaringan ? `Select all ${plural(tampil.length, "filtered result")}` : `Select all ${plural(tampil.length, "participant")}`}
        </Button>
      ) : null}
      <Button variant="tonal" size="sm" icon={<Bed size={16} />} onClick={() => setDialog("kamar")}>Assign to hotel</Button>
      <Button variant="tonal" size="sm" icon={<IkonBus size={16} />} onClick={() => setDialog("bus")}>Assign to vehicle</Button>
      {adaInap.length > 0 ? (
        <Button variant="text" size="sm" onClick={() => setDialog("lepas-kamar")}>Remove from hotel</Button>
      ) : null}
      {dipilih.some((orang) => busPeserta.has(orang.id)) ? (
        <Button variant="text" size="sm" onClick={() => setDialog("lepas-bus")}>Remove from vehicle</Button>
      ) : null}
      <Button variant="text" size="sm" className="ml-auto" icon={<X size={16} />} onClick={() => setPilih(new Set())}>Clear selection</Button>
    </PaneHeader>
  ) : (
    <PaneHeader className="flex-wrap gap-2 px-3 py-2.5">
      <KolomCari className="max-w-80" label="Search participants" placeholder="Search name, organisation or QR code" value={cari} onChange={setCari} />
      <ChipMenu
        label="Stay"
        options={[
          { value: "belum", label: "No hotel", count: belumHotel },
          { value: "menyusul", label: "Room to follow", count: menungguKamar },
          { value: "sudah", label: "Has a room" },
          ...(pindahHotel > 0 ? [{ value: "pindah", label: "Moves hotel", count: pindahHotel }] : []),
        ]}
        selected={saringKamar}
        onChange={setSaringKamar}
        summary={(pilihan) => pilihan[0]?.label ?? "Stay"}
      />
      <ChipMenu
        label="Vehicle"
        options={[{ value: "belum", label: adaTrip ? "Missing on a trip" : "No vehicle", count: belumBus }, { value: "sudah", label: "Has a vehicle" }]}
        selected={saringBus}
        onChange={setSaringBus}
        summary={(pilihan) => pilihan[0]?.label ?? "Vehicle"}
      />
      <ChipMenu
        label="Organisation"
        multiple
        searchable
        options={perusahaan.map(([nama, jumlah]) => ({ value: nama, label: nama || "No organisation", count: jumlah }))}
        selected={saringPerusahaan}
        onChange={setSaringPerusahaan}
      />
    </PaneHeader>
  );

  const th = "h-9 whitespace-nowrap border-b border-outline-variant bg-surface-container-lowest px-3 text-left text-body-medium font-normal text-on-surface-variant";

  return (
    <>
      {/* Lewat ListDetail meski tanpa panel detail: di layar pendek (zoom 150%)
          ia yang membuat daftar setinggi layar dan kepala tabelnya menempel,
          sama dengan Daftar peserta. Pane biasa memanjang mengikuti isinya dan
          kepala tabel ikut tergulir hilang. */}
      <ListDetail detail={null} list={
      <Pane aria-label="Participant assignments">
        {toolbar}
        <PaneBody className="overflow-x-auto">
          {data.participants.length === 0 ? (
            <EmptyState plain icon={<Users size={40} />} title="No active participants yet" description="Registered participants appear here, ready to be assigned to rooms and vehicles." />
          ) : tampil.length === 0 ? (
            <EmptyState
              plain
              icon={<MagnifyingGlass size={40} />}
              title="No matching participants"
              description="Loosen the filters or change your search."
              action={<Button variant="outlined" size="sm" onClick={hapusSaringan}>Clear filters</Button>}
            />
          ) : (
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-body-medium">
              <thead className="sticky top-0 z-[1]">
                <tr>
                  <th scope="col" className={cx(th, "w-10 pl-4 pr-0")}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${plural(barisHalaman.length, "participant")} on this page`}
                      checked={semuaHalamanDipilih}
                      ref={(el) => { if (el) el.indeterminate = sebagianDipilih; }}
                      onChange={(event) => pilihBanyak(barisHalaman, event.target.checked)}
                      className="size-4 align-middle accent-[var(--md-sys-color-primary)]"
                    />
                  </th>
                  <th scope="col" className={th}>Name</th>
                  <th scope="col" className={th}>Organisation</th>
                  {kunciField ? <th scope="col" className={th}>Gender</th> : null}
                  <th scope="col" className={th}>Hotel</th>
                  <th scope="col" className={th}>Room</th>
                  <th scope="col" className={th}>Check-in</th>
                  <th scope="col" className={th}>Check-out</th>
                  <th scope="col" className={th}>Vehicle</th>
                </tr>
              </thead>
              <tbody>
                {barisHalaman.map((orang) => {
                  const centang = pilih.has(orang.id);
                  const stays = inapPeserta.get(orang.id) ?? [];
                  const kend = ringkasKendaraan(kendaraan.get(orang.id)!, kodeBus);
                  const td = "border-b border-outline-variant px-3 py-2";
                  return (
                    <tr
                      key={orang.id}
                      onClick={() => ubah(orang.id, !centang)}
                      className={cx("cursor-pointer", centang ? "bg-accent-soft" : "hover:bg-panel-high")}
                    >
                      <td className={cx(td, "w-10 pl-4 pr-0")}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${orang.name}`}
                          checked={centang}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => ubah(orang.id, event.target.checked)}
                          className="size-4 align-middle accent-[var(--md-sys-color-primary)]"
                        />
                      </td>
                      <td className={cx(td, "max-w-[260px] truncate")}>
                        <Link
                          href={`/admin/participants?peserta=${encodeURIComponent(orang.qr_code)}`}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-sm text-on-surface underline-offset-2 hover:underline"
                          title="Open in Participant list"
                        >
                          {orang.name}
                        </Link>
                      </td>
                      <td className={cx(td, "max-w-[220px] truncate text-on-surface-variant")}>{orang.company || EMPTY_VALUE}</td>
                      {kunciField ? <td className={cx(td, "text-on-surface-variant")}>{orang.gender || EMPTY_VALUE}</td> : null}
                      {(["hotel", "kamar", "masuk", "keluar"] as const).map((kolom) => (
                        <td key={kolom} className={cx(td, "whitespace-nowrap py-1", kolom === "hotel" && "max-w-[200px]")}>
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); setStayDibuka(orang.id); }}
                            className="-mx-2 flex min-h-9 w-[calc(100%+16px)] flex-col justify-center rounded-md px-2 py-1 text-left hover:bg-panel-high"
                            aria-label={`Stays of ${orang.name}`}
                          >
                            {stays.length === 0 ? <span className="text-on-surface-variant">{EMPTY_VALUE}</span> : stays.map((stay, i) => {
                              const kamar = stay.room_id !== null ? kamarById.get(stay.room_id) : undefined;
                              const hotel = hotelById.get(stay.hotel_id);
                              const t = tanggalStay(stay, hotel);
                              const sebelum = i > 0 ? stays[i - 1] : null;
                              const gantiKamar = sebelum !== null && sebelum.hotel_id === stay.hotel_id;
                              return (
                                <span key={i} className="flex h-7 items-center gap-2 truncate">
                                  {kolom === "hotel" ? (
                                    <span title={hotel?.name} className={cx("truncate", gantiKamar ? "text-on-surface-variant" : "text-on-surface")}>{hotel?.name}</span>
                                  ) : kolom === "kamar" ? (
                                    kamar ? <span className="tabular-nums text-on-surface">{kamar.room_number}</span> : <StatusChip dot tone="warning">To follow</StatusChip>
                                  ) : (
                                    <span className="tabular-nums text-on-surface-variant">{(() => { const v = kolom === "masuk" ? t.masuk : t.keluar; return v ? labelTanggal(tanggalZona(v, offset)).slice(4) : EMPTY_VALUE; })()}</span>
                                  )}
                                </span>
                              );
                            })}
                          </button>
                        </td>
                      ))}
                      <td className={cx(td, "whitespace-nowrap", kend.satu !== null || kend.baris.length > 0 ? "text-on-surface" : "text-on-surface-variant")}>
                        {/* Berbeda per Trip: satu baris per trip, seperti kolom Stay untuk dua hotel. */}
                        {kend.baris.length > 0 ? (
                          <span className="flex flex-col gap-0.5">
                            {kend.baris.map((b) => (
                              <span key={b.trip.id} className="flex items-center gap-2">
                                <span className="text-on-surface-variant">{labelTripPendek(b.trip, offset)}</span>
                                {b.status === "kurang" ? <StatusChip dot tone="warning">{TEKS_KURANG}</StatusChip>
                                  : <span className={b.status === "tidak" ? "text-on-surface-variant" : undefined}>{b.teks}</span>}
                              </span>
                            ))}
                          </span>
                        ) : kend.satu ?? EMPTY_VALUE}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PaneBody>
        <PaneFooter
          className="bg-surface-container-lowest py-2"
          note={
            <span className="tabular-nums">
              {tampil.length === 0 ? "0 participants" : `${nomorHalaman * PER_HALAMAN + 1}–${nomorHalaman * PER_HALAMAN + barisHalaman.length} of ${tampil.length.toLocaleString("en-GB")}`}
              {adaSaringan ? ` (${plural(data.participants.length, "participant")} in total)` : ""}
            </span>
          }
        >
          {jumlahHalaman > 1 ? (
            <>
              <IconButton size="sm" variant="outlined" label="Previous page" disabled={nomorHalaman === 0} onClick={() => keHalaman(nomorHalaman - 1)}><CaretLeft size={16} /></IconButton>
              <span className="min-w-14 text-center text-body-medium tabular-nums text-on-surface-variant">{nomorHalaman + 1} / {jumlahHalaman}</span>
              <IconButton size="sm" variant="outlined" label="Next page" disabled={nomorHalaman + 1 >= jumlahHalaman} onClick={() => keHalaman(nomorHalaman + 1)}><CaretRight size={16} /></IconButton>
            </>
          ) : null}
        </PaneFooter>
      </Pane>
      } />

      <DialogKamar
        open={dialog === "kamar"}
        orang={dipilih}
        data={data}
        busy={busy}
        onClose={() => setDialog(null)}
        keTabKamar={() => { setDialog(null); keTab("kamar"); }}
        stayPeserta={inapPeserta}
        offset={offset}
        simpan={async (items) => selesai(await simpanPenempatan(kirim, items))}
      />

      <DialogStays
        key={stayDibuka ?? "tutup"}
        orang={orangStay}
        stays={stayDibuka ? inapPeserta.get(stayDibuka) ?? [] : []}
        hotels={data.hotels}
        rooms={data.rooms}
        hunian={buatHunian(data.lodging, data.participants, data.hotels)}
        offset={offset}
        busy={busy}
        kirim={kirim}
        onClose={() => setStayDibuka(null)}
      />

      <DialogBus
        open={dialog === "bus"}
        orang={dipilih}
        data={data}
        busPeserta={busPeserta}
        busy={busy}
        onClose={() => setDialog(null)}
        keTabBus={() => { setDialog(null); keTab("bus"); }}
        simpan={async (utama, trips, kembali, langkah) => selesai(await simpanKendaraan(kirim, dipilih.map((o) => o.id), utama, trips, kembali, langkah))}
      />

      <DialogLepasKamar open={dialog === "lepas-kamar"} orang={adaInap} busy={busy} kirim={kirim} onClose={() => setDialog(null)} onSelesai={selesai} />

      <DialogLepasBus open={dialog === "lepas-bus"} orang={dipilih.filter((o) => busPeserta.has(o.id))} busy={busy} kirim={kirim} onClose={() => setDialog(null)} onSelesai={selesai} />
    </>
  );
}

/* ----------------------------------------------------- Dialog lepas kamar/bus */

/** Lepas semua hotel (dan kamar) orang-orang ini. Dipakai Assignments dan Daftar peserta. */
export function DialogLepasKamar({ open, orang, busy, kirim, onClose, onSelesai }: {
  open: boolean;
  /** Hanya yang punya stay. */
  orang: LogistikPeserta[];
  busy: boolean;
  kirim: Kirim;
  onClose: () => void;
  onSelesai: (hasil: unknown) => unknown;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={`Remove ${plural(orang.length, "person", "people")} from their hotels?`}
      description="Every hotel and room they have is removed, and their places in rooms become free again. To remove just one hotel or change nights, open their stays instead."
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button simpan loading={busy} onClick={async () => {
            // Bertahap per 200: batas route, dan URL ribuan id terlalu panjang.
            let hasil: unknown = null;
            for (let i = 0; i < orang.length; i += POTONG_LEPAS) {
              const ids = orang.slice(i, i + POTONG_LEPAS).map((o) => `participant_id=${o.id}`).join("&");
              hasil = await kirim(`/api/admin/logistik/penghuni?${ids}`, "DELETE");
              if (hasil === null) break;
            }
            await onSelesai(hasil);
          }}>Remove from hotel</Button>
        </>
      }
    />
  );
}

/** Lepas bus bawaan orang-orang ini. */
export function DialogLepasBus({ open, orang, busy, kirim, onClose, onSelesai }: {
  open: boolean;
  /** Hanya yang punya bus bawaan. */
  orang: LogistikPeserta[];
  busy: boolean;
  kirim: Kirim;
  onClose: () => void;
  onSelesai: (hasil: unknown) => unknown;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={`Remove ${plural(orang.length, "person", "people")} from their default vehicle?`}
      description="They will no longer have a default vehicle. Replacement vehicles set for a single trip (Vehicles tab, Trips section) still apply."
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button simpan loading={busy} onClick={async () => {
            await onSelesai(await kirim("/api/admin/logistik/penumpang", "POST", { trip_id: null, vehicle_id: null, participant_ids: orang.map((o) => o.id) }));
          }}>Remove from vehicle</Button>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------ Dialog kamar */

/** Satu baris pilihan di dialog tujuan: radio, nama, keterangan, sisa tempat. */
function BarisTujuan({ nama, keterangan, sisa, alasan, checked, onPilih, name }: {
  nama: string;
  keterangan: string | null;
  sisa: string;
  alasan: string | null;
  checked: boolean;
  onPilih: () => void;
  name: string;
}) {
  return (
    <li className="border-b border-outline-variant last:border-b-0">
      <label className={cx("flex items-center gap-3 px-4 py-2 text-body-medium", alasan ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-panel-high", checked && "bg-accent-soft")}>
        <input type="radio" name={name} checked={checked} disabled={Boolean(alasan)} onChange={onPilih} className="size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-on-surface">{nama}</span>
          {keterangan ? <span className="block truncate text-on-surface-variant">{keterangan}</span> : null}
        </span>
        <span className={cx("shrink-0 tabular-nums", alasan ? "text-on-surface-variant" : "text-on-surface")}>{alasan ?? sisa}</span>
      </label>
    </li>
  );
}

/** Seluruh stay satu orang untuk `replace_stays` (PUT penghuni). */
export type ItemStays = {
  participant_id: string;
  stays: Array<{ hotel_id: number; room_id: number | null; check_in_at: string | null; check_out_at: string | null }>;
};

/**
 * Menulis hasil dialog Assign to hotel: seluruh stay tiap orang diganti
 * sekaligus lewat `replace_stays`, satu transaksi. Isi kamar diperiksa per
 * malam sesudah semuanya tertulis, jadi tidak ada yang tersimpan setengah dan
 * urutan stay tidak berpengaruh. Null bila gagal: toast-nya sudah tampil dari
 * `kirim`.
 */
export async function simpanPenempatan(kirim: Kirim, items: ItemStays[]): Promise<unknown> {
  return kirim("/api/admin/logistik/penghuni", "PUT", { items });
}

/** Isian satu stay di dialog. `kamar` "" = kamar menyusul; tanggal "" = belum diisi. */
type IsianStay = { kunci: number; hotelId: string; kamar: string; masuk: string; keluar: string };

const malamDalam = (masuk: string, keluar: string) => Math.round((Date.parse(keluar) - Date.parse(masuk)) / 86_400_000);

export function DialogKamar({ open, orang, data, busy, onClose, keTabKamar, stayPeserta, offset, simpan }: {
  open: boolean;
  orang: LogistikPeserta[];
  data: TabProps["data"];
  busy: boolean;
  onClose: () => void;
  keTabKamar: () => void;
  stayPeserta: Map<string, Stay[]>;
  offset: string;
  simpan: (items: ItemStays[]) => Promise<boolean>;
}) {
  const kosongStay = (kunci: number): IsianStay => ({ kunci, hotelId: "", kamar: "", masuk: "", keluar: "" });
  // Satu hotel saja yang sudah ada: langsung terpilih, dengan tanggal hotelnya.
  const awal = (): IsianStay[] => {
    if (data.hotels.length !== 1) return [kosongStay(1)];
    const tanggal = malamHotel(data.hotels[0], offset);
    return [{ kunci: 1, hotelId: String(data.hotels[0].id), kamar: "", ...tanggal }];
  };
  const [stays, setStays] = useState<IsianStay[]>(awal);
  function tutup() { setStays(awal()); onClose(); }

  const kunciField = data.settings.gender_field_key;
  const wajibSama = data.settings.enforce_same_gender;
  const namaField = data.fields.find((field) => field.key === kunciField)?.label ?? kunciField;
  const ids = new Set(orang.map((o) => o.id));
  const orangById = new Map(data.participants.map((o) => [o.id, o]));
  const hotelById = new Map(data.hotels.map((h) => [h.id, h]));
  const n = orang.length;

  // Masalah yang menolak SEMUA kamar. Ditampilkan sekali di atas, bukan
  // diulang di setiap baris. "Room later" tidak terkena: aturan jenis kelamin
  // dan kapasitas milik kamar.
  const tanpaGender = wajibSama && kunciField ? orang.filter((o) => !kunciGender(o.gender)) : [];
  const genderDipilih = new Set(orang.map((o) => kunciGender(o.gender)).filter(Boolean));
  const blokirKamar =
    n > BATAS_KAMAR ? `To put people in a room, select at most ${BATAS_KAMAR}. You can still place everyone in a hotel now and add room numbers later.`
    : wajibSama && !kunciField ? "Room rules are incomplete: choose a gender field on the Rooms tab, or allow mixed rooms. You can still place them in a hotel now."
    : tanpaGender.length > 0 ? `${plural(tanpaGender.length, "person has", "people have")} no answer for ${namaField}: ${tanpaGender.slice(0, 3).map((o) => o.name).join(", ")}${tanpaGender.length > 3 ? ", and others" : ""}. They can only be placed in a hotel for now.`
    : wajibSama && genderDipilih.size > 1 ? "The selection includes different genders, so only a hotel can be chosen. To pick rooms, select people of one gender only."
    : null;
  const blokirHotel = n > BATAS_HOTEL ? `Select at most ${BATAS_HOTEL.toLocaleString("en-GB")} people at a time.` : null;
  const gender = [...genderDipilih][0] ?? null;

  // Isi kamar per malam. Yang dipilih tidak dihitung: stay mereka diganti
  // seluruhnya, jadi tempatnya bebas.
  const hunian = useMemo(() => buatHunian(data.lodging, data.participants, data.hotels), [data.lodging, data.participants, data.hotels]);
  const kamarUrut = useMemo(() => [...data.rooms].sort((a, b) => a.room_number.localeCompare(b.room_number, "id", { numeric: true })), [data.rooms]);

  function ubah(kunci: number, isi: Partial<IsianStay>) {
    setStays((lama) => lama.map((s) => (s.kunci === kunci ? { ...s, ...isi } : s)));
  }
  function pilihHotel(kunci: number, hotelId: string, urutan: number) {
    const hotel = hotelById.get(Number(hotelId));
    const tanggal = malamHotel(hotel, offset);
    // Stay berikutnya mulai pada hari check-out stay sebelumnya, juga di
    // hotel yang sama (pindah kamar). Check-out kosong bila tanggal hotelnya
    // tidak sesudah itu (Stay 1 masih sampai hari terakhir): panitia
    // mengisinya, bukan disambut pesan salah.
    const sebelum = urutan > 0 ? stays[urutan - 1] : null;
    const masuk = sebelum?.keluar || tanggal.masuk;
    ubah(kunci, { hotelId, kamar: "", masuk, keluar: tanggal.keluar > masuk ? tanggal.keluar : "" });
  }

  // Satu hotel dengan tanggal hotelnya = "All nights", seperti sebelumnya:
  // stay tanpa tanggal sendiri, jadi ikut bila tanggal hotel berubah.
  const satuSemuaMalam = stays.length === 1 && stays[0].hotelId !== "" && (() => {
    const t = malamHotel(hotelById.get(Number(stays[0].hotelId)), offset);
    return stays[0].masuk === t.masuk && stays[0].keluar === t.keluar;
  })();

  const galatPer = stays.map((s, i) => {
    if (!s.hotelId) return null;
    if (satuSemuaMalam && !s.masuk && !s.keluar) return null;
    const galat = galatMalam(s.masuk, s.keluar);
    if (galat) return galat;
    const tabrak = stays.find((x, j) => j !== i && x.masuk && x.keluar && x.masuk < s.keluar && s.masuk < x.keluar);
    return tabrak ? `Nights overlap Stay ${stays.indexOf(tabrak) + 1}.` : null;
  });
  const malamIsian = (s: IsianStay) => {
    const hotel = hotelById.get(Number(s.hotelId));
    return satuSemuaMalam || !s.masuk || !s.keluar ? null : malamKeIso(hotel, s.masuk, s.keluar, offset);
  };
  // Kamar hotel stay ini dengan sisa tempatnya pada malam stay ini.
  const kamarUntuk = (s: IsianStay) => {
    if (!s.hotelId) return [];
    const hotel = hotelById.get(Number(s.hotelId));
    const rentang = rentangStay(malamIsian(s) ?? { check_in_at: null, check_out_at: null }, undefined, hotel);
    const lain = (stay: Stay) => ids.has(stay.participant_id);
    return kamarUrut.filter((k) => k.hotel_id === hotel?.id).map((kamar) => {
      const sisa = kamar.capacity - hunian.puncak(kamar.id, rentang, lain);
      const genderKamar = kunciGender(hunian.sekamar(kamar.id, rentang, lain).map((x) => orangById.get(x.participant_id)?.gender).find(Boolean));
      const alasan = sisa <= 0 ? "full these nights"
        : sisa < n ? `${sisa} left`
        : wajibSama && gender && genderKamar && genderKamar !== gender ? "different gender"
        : null;
      return { kamar, sisa, alasan };
    });
  };
  const kamarDipilih = (s: IsianStay) => (s.kamar ? kamarUntuk(s).find((b) => String(b.kamar.id) === s.kamar) : undefined);
  const siap = stays.every((s) => s.hotelId) && galatPer.every((g) => !g) && !blokirHotel && stays.every((s) => !kamarDipilih(s)?.alasan);

  // Kamar yang sudah ada tetap dipakai bila "Room later" dipilih di hotel yang
  // sama dengan malam yang bertabrakan (yang diubah hanya malamnya). "All
  // nights" dengan Room later tetap mengosongkan kamarnya, seperti sebelumnya.
  const kamarLama = (o: LogistikPeserta, s: IsianStay, dipakai: Set<number>) => {
    if (satuSemuaMalam || s.kamar) return null;
    const hotel = hotelById.get(Number(s.hotelId));
    const rentang = rentangStay(malamIsian(s) ?? { check_in_at: null, check_out_at: null }, undefined, hotel);
    const lama = (stayPeserta.get(o.id) ?? []).find((x) => x.hotel_id === hotel?.id && x.room_id !== null && !dipakai.has(x.id) && bertabrakan(rentangStay(x, undefined, hotel), rentang));
    if (lama) dipakai.add(lama.id);
    return lama?.room_id ?? null;
  };
  const items: ItemStays[] = siap ? orang.map((o) => {
    const dipakai = new Set<number>();
    return {
      participant_id: o.id,
      stays: stays.map((s) => {
        const malam = malamIsian(s);
        return {
          hotel_id: Number(s.hotelId),
          room_id: kamarDipilih(s)?.kamar.id ?? kamarLama(o, s, dipakai),
          check_in_at: malam?.check_in_at ?? null,
          check_out_at: malam?.check_out_at ?? null,
        };
      }),
    };
  }) : [];

  // Stay lain yang masih dimiliki dan tidak ada di dialog ini: diganti.
  const dipilihHotel = new Set(stays.map((s) => Number(s.hotelId)).filter(Boolean));
  const hotelLain = new Map<number, number>();
  for (const o of orang) {
    for (const hotelId of new Set((stayPeserta.get(o.id) ?? []).map((x) => x.hotel_id))) {
      if (!dipilihHotel.has(hotelId)) hotelLain.set(hotelId, (hotelLain.get(hotelId) ?? 0) + 1);
    }
  }
  const akibat = [...hotelLain].map(([id, jumlah]) =>
    `${plural(jumlah, "person", "people")} also ${jumlah === 1 ? "has" : "have"} a stay at ${hotelById.get(id)?.name ?? "another hotel"}. It will be removed.`);
  for (const s of stays) {
    if (!s.hotelId || s.kamar) continue;
    const punya = orang.filter((o) => (stayPeserta.get(o.id) ?? []).some((x) => x.hotel_id === Number(s.hotelId) && x.room_id !== null)).length;
    const nama = hotelById.get(Number(s.hotelId))?.name;
    if (punya > 0) {
      akibat.push(satuSemuaMalam
        ? `${plural(punya, "person", "people")} already ${punya === 1 ? "has a room" : "have rooms"} at ${nama}. Room later takes ${punya === 1 ? "them out of it" : "them out of their rooms"}.`
        : `${plural(punya, "person", "people")} already ${punya === 1 ? "has a room" : "have rooms"} at ${nama}. They keep ${punya === 1 ? "it" : "them"} for the nights that overlap.`);
    }
  }
  async function tetapkan() {
    if (await simpan(items)) tutup();
  }

  const kunciBerikut = Math.max(0, ...stays.map((s) => s.kunci)) + 1;
  const bisaTambah = stays.length < 6;

  return (
    <Dialog
      open={open}
      onClose={tutup}
      dismissible={!busy}
      size="lg"
      icon={<Bed size={20} />}
      title={`Assign ${plural(n, "person", "people")} to ${stays.length > 1 ? "hotels" : "a hotel"}`}
      description={`${n === 1 ? orang[0]?.name : `${orang.slice(0, 3).map((o) => o.name).join(", ")}${n > 3 ? `, and ${n - 3} more` : ""}`}. Add one stay, or one per part of the trip for people who move hotels or change rooms.`}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan loading={busy} disabled={!siap} onClick={() => void tetapkan()}>
            Assign
          </Button>
        </>
      }
    >
      {data.hotels.length === 0 ? (
        <EmptyState plain icon={<Bed size={40} />} title="No hotels yet" description="Add a hotel on the Rooms tab first. Rooms can follow later." action={<Button variant="outlined" size="sm" onClick={keTabKamar}>Open Rooms tab</Button>} />
      ) : blokirHotel ? (
        <Banner tone="warning" icon={<Warning size={18} />}>{blokirHotel}</Banner>
      ) : (
        <div className="flex flex-col gap-3">
          {blokirKamar ? <Banner tone="warning" icon={<Warning size={18} />}>{blokirKamar}</Banner> : null}
          <ol className="flex flex-col rounded-md border border-outline-variant" aria-label="Hotels">
            {stays.map((s, i) => {
              const kamar = kamarUntuk(s);
              const galat = galatPer[i];
              const malam = s.masuk && s.keluar && !galat ? malamDalam(s.masuk, s.keluar) : null;
              return (
                <li key={s.kunci} className="flex flex-col gap-3 border-b border-outline-variant px-4 py-3 last:border-b-0">
                  <div className="flex min-h-9 items-center justify-between gap-2">
                    <p className="text-title-small font-semibold text-on-surface">{stays.length > 1 ? `Stay ${i + 1}` : "Stay"}</p>
                    {stays.length > 1 ? (
                      <Button variant="text" disabled={busy} onClick={() => setStays((lama) => lama.filter((x) => x.kunci !== s.kunci))}>Remove</Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField label="Hotel" value={s.hotelId} onChange={(event) => pilihHotel(s.kunci, event.target.value, i)}>
                      <option value="" disabled>Choose a hotel</option>
                      {data.hotels.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Room"
                      value={s.kamar}
                      disabled={!s.hotelId || Boolean(blokirKamar) || kamar.length === 0}
                      hint={s.hotelId && !blokirKamar && kamar.length === 0 ? "No rooms yet. Add them on the Rooms tab." : undefined}
                      onChange={(event) => ubah(s.kunci, { kamar: event.target.value })}
                    >
                      <option value="">Room later</option>
                      {kamar.map((b) => (
                        <option key={b.kamar.id} value={b.kamar.id} disabled={Boolean(b.alasan)}>
                          {[`Room ${b.kamar.room_number}`, b.kamar.room_type, b.alasan ?? `${b.sisa} free`].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField label="Check-in" type="date" value={s.masuk} disabled={!s.hotelId} max={s.keluar || undefined} onChange={(event) => ubah(s.kunci, { masuk: event.target.value })} />
                    <TextField label="Check-out" type="date" value={s.keluar} disabled={!s.hotelId} min={s.masuk || undefined} error={galat && s.masuk && s.keluar ? galat : undefined} onChange={(event) => ubah(s.kunci, { keluar: event.target.value })} />
                  </div>
                  {malam !== null ? <p className="-mt-1 text-body-small text-on-surface-variant">{plural(malam, "night")}{i > 0 && s.hotelId && s.hotelId === stays[i - 1].hotelId ? ` · Room change: they check out of Stay ${i} and check in again on ${labelTanggal(s.masuk)}.` : ""}</p> : null}
                </li>
              );
            })}
          </ol>
          {bisaTambah ? (
            <Button variant="text" className="self-start" icon={<Plus size={16} />} disabled={busy} onClick={() => setStays((lama) => [...lama, kosongStay(kunciBerikut)])}>
              Add another stay
            </Button>
          ) : null}
          <p className="text-body-medium text-on-surface-variant">
            {stays.length > 1 ? "These stays replace the ones they have now. Nights cannot overlap." : "This stay replaces the ones they have now."}
          </p>
          <BannerAkibat kalimat={akibat} />
        </div>
      )}
    </Dialog>
  );
}

/* --------------------------------------------------------- Dialog kendaraan */

/** Satu perjalanan yang naik kendaraan lain di dialog. `kendaraan` "" = belum dipilih, "tanpa" = tidak ikut kendaraan. */
type IsianTrip = { kunci: number; tripId: string; kendaraan: string };

/** Satu langkah simpan kendaraan yang sudah berhasil. */
export type LangkahKendaraan = { jenis: "trip"; tripId: number } | { jenis: "utama" } | { jenis: "kembali"; tripId: number };

/**
 * Menulis hasil dialog Assign to vehicle untuk orang-orang ini. Urutannya
 * menjaga pemeriksaan kapasitas `assign_bus`: perjalanan khusus lebih dulu
 * (mereka keluar dari kendaraan utama di perjalanan itu), lalu kendaraan
 * utama, lalu perjalanan khusus yang dihapus kembali ke kendaraan utama.
 * Tidak satu transaksi: `langkah` mencatat yang sudah tersimpan, dan mengulang
 * aman karena setiap langkah menulis keadaan akhir, bukan selisih.
 */
export async function simpanKendaraan(kirim: Kirim, ids: string[], utama: number | null, trips: Array<{ tripId: number; vehicleId: number | null }>, kembali: number[], langkah?: (l: LangkahKendaraan) => void): Promise<unknown> {
  let hasil: unknown = true;
  for (const t of trips) {
    hasil = await kirim("/api/admin/logistik/penumpang", "POST", { trip_id: t.tripId, vehicle_id: t.vehicleId, participant_ids: ids });
    if (hasil === null) return null;
    langkah?.({ jenis: "trip", tripId: t.tripId });
  }
  if (utama !== null) {
    hasil = await kirim("/api/admin/logistik/penumpang", "POST", { trip_id: null, vehicle_id: utama, participant_ids: ids });
    if (hasil === null) return null;
    langkah?.({ jenis: "utama" });
  }
  for (const tripId of kembali) {
    hasil = await kirim("/api/admin/logistik/penumpang", "DELETE", { trip_id: tripId, participant_ids: ids });
    if (hasil === null) return null;
    langkah?.({ jenis: "kembali", tripId });
  }
  return hasil;
}

/**
 * Assign to vehicle: kendaraan utama dan, bila perlu, kendaraan lain di
 * beberapa perjalanan, dalam satu dialog seperti Assign to hotel. Daftar
 * perjalanan di sini MENGGANTI perjalanan khusus yang mereka punya: yang
 * dimiliki semua orang terpilih sudah terisi, yang tidak ada di daftar
 * dikembalikan ke kendaraan utama (dan disebut di bawah sebelum disimpan).
 */
export function DialogBus({ open, orang, data, busPeserta, busy, onClose, keTabBus, simpan }: {
  open: boolean;
  orang: LogistikPeserta[];
  data: TabProps["data"];
  busPeserta: Map<string, number>;
  busy: boolean;
  onClose: () => void;
  keTabBus: () => void;
  simpan: (utama: number | null, trips: Array<{ tripId: number; vehicleId: number | null }>, kembali: number[], langkah: (l: LangkahKendaraan) => void) => Promise<boolean>;
}) {
  const n = orang.length;
  const ids = new Set(orang.map((o) => o.id));
  const aktif = new Set(data.participants.map((o) => o.id));
  const tripById = new Map(data.trips.map((t) => [t.id, t]));
  const busById = new Map(data.vehicles.map((b) => [b.id, b]));

  // Perjalanan khusus orang terpilih: trip -> (peserta -> kendaraan atau null).
  const khusus = new Map<number, Map<string, number | null>>();
  for (const a of data.transport) {
    if (a.trip_id === null || !ids.has(a.participant_id) || !tripById.has(a.trip_id)) continue;
    const m = khusus.get(a.trip_id) ?? new Map<string, number | null>();
    m.set(a.participant_id, a.vehicle_id);
    khusus.set(a.trip_id, m);
  }

  const awal = (): { utama: number | null; trips: IsianTrip[] } => {
    const daftarUtama = orang.map((o) => busPeserta.get(o.id) ?? null);
    const utama = daftarUtama.length > 0 && daftarUtama.every((v) => v !== null && v === daftarUtama[0]) ? daftarUtama[0] : null;
    // Perjalanan yang sama persis untuk semua orang terpilih: sudah terisi.
    const trips: IsianTrip[] = [];
    for (const t of data.trips) {
      const m = khusus.get(t.id);
      if (!m || m.size !== n) continue;
      const nilai = [...m.values()];
      if (nilai.every((v) => v === nilai[0])) trips.push({ kunci: trips.length + 1, tripId: String(t.id), kendaraan: nilai[0] === null ? "tanpa" : String(nilai[0]) });
    }
    return { utama, trips };
  };
  const [utama, setUtama] = useState<number | null>(() => awal().utama);
  // Kendaraan bawaan yang sudah dimiliki semua orang terpilih: tidak dikirim ulang bila tidak diganti.
  const [utamaAwal, setUtamaAwal] = useState<number | null>(() => awal().utama);
  const [trips, setTrips] = useState<IsianTrip[]>(() => awal().trips);
  const [sebagian, setSebagian] = useState<LangkahKendaraan[]>([]);
  // Dialog tetap terpasang saat tertutup: isian disegarkan setiap dibuka.
  const [kunciBuka, setKunciBuka] = useState(open);
  if (open !== kunciBuka) {
    setKunciBuka(open);
    if (open) { const a = awal(); setUtama(a.utama); setUtamaAwal(a.utama); setTrips(a.trips); setSebagian([]); }
  }
  function tutup() { setSebagian([]); onClose(); }

  // Isi kendaraan utama tanpa orang terpilih: memindahkan mereka membebaskan tempatnya.
  const isiBawaan = new Map<number, number>();
  for (const [pid, busId] of busPeserta) {
    if (!aktif.has(pid) || ids.has(pid)) continue;
    isiBawaan.set(busId, (isiBawaan.get(busId) ?? 0) + 1);
  }
  const baris = data.vehicles.map((bus) => {
    const isi = isiBawaan.get(bus.id) ?? 0;
    const sisa = bus.capacity === null ? null : bus.capacity - isi;
    const alasan = sisa === null ? null : sisa <= 0 ? "Full" : sisa < n ? `${sisa} left` : null;
    return { bus, isi, sisa, alasan };
  });
  const pilihan = baris.find((b) => b.bus.id === utama);

  // Isi tiap kendaraan di satu perjalanan tanpa orang terpilih, dari kendaraan
  // efektif tiap peserta (pengganti, atau kendaraan utama bila perjalanannya
  // mengikuti kendaraan utama), sama dengan transport_effective.
  const isiTrip = useMemo(() => {
    const ganti = new Map<string, number | null>();
    for (const a of data.transport) if (a.trip_id !== null) ganti.set(`${a.trip_id}:${a.participant_id}`, a.vehicle_id);
    const hasil = new Map<number, Map<number, number>>();
    for (const t of data.trips) {
      const m = new Map<number, number>();
      for (const o of data.participants) {
        if (ids.has(o.id)) continue;
        const k = `${t.id}:${o.id}`;
        const v = ganti.has(k) ? ganti.get(k)! : t.follows_default ? busPeserta.get(o.id) ?? null : null;
        if (v !== null) m.set(v, (m.get(v) ?? 0) + 1);
      }
      hasil.set(t.id, m);
    }
    return hasil;
    // `ids` dibangun ulang tiap render dari `orang` yang sama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, orang, busPeserta]);
  const alasanTrip = (tripId: number, busId: number) => {
    const bus = busById.get(busId);
    if (!bus || bus.capacity === null) return null;
    const sisa = bus.capacity - (isiTrip.get(tripId)?.get(busId) ?? 0);
    return sisa <= 0 ? "full" : sisa < n ? `${sisa} left` : null;
  };

  const ubahTrip = (kunci: number, isi: Partial<IsianTrip>) => setTrips((lama) => lama.map((t) => (t.kunci === kunci ? { ...t, ...isi } : t)));
  const dipilihTrip = new Set(trips.map((t) => Number(t.tripId)).filter(Boolean));
  const tripLengkap = trips.every((t) => t.tripId && t.kendaraan && (t.kendaraan === "tanpa" || !alasanTrip(Number(t.tripId), Number(t.kendaraan))));
  const kembali = [...khusus.keys()].filter((id) => !dipilihTrip.has(id));
  const isiTrips = trips.filter((t) => t.tripId && t.kendaraan).map((t) => ({ tripId: Number(t.tripId), vehicleId: t.kendaraan === "tanpa" ? null : Number(t.kendaraan) }));
  const utamaKirim = utama !== null && utama !== utamaAwal ? utama : null;
  const adaUbahan = utamaKirim !== null || isiTrips.length > 0 || kembali.length > 0;
  const siap = adaUbahan && tripLengkap && !(utamaKirim !== null && pilihan?.alasan);

  const namaTrip = (id: number) => tripById.get(id)?.name || "a trip";
  const akibat = kembali.map((id) => {
    const jumlah = khusus.get(id)?.size ?? 0;
    const ikut = tripById.get(id)?.follows_default;
    return `${plural(jumlah, "person", "people")} ${jumlah === 1 ? "has" : "have"} a different vehicle on ${namaTrip(id)}. It will be removed, so ${ikut ? "they ride their default vehicle there" : "they are not on that trip's list"}.`;
  });
  const tanpaUtama = utama === null ? orang.filter((o) => !busPeserta.has(o.id)).length : 0;
  const daftarSendiri = data.trips.filter((t) => !t.follows_default && !dipilihTrip.has(t.id));

  const rencana: LangkahKendaraan[] = [
    ...isiTrips.map((t): LangkahKendaraan => ({ jenis: "trip", tripId: t.tripId })),
    ...(utamaKirim !== null ? [{ jenis: "utama" } as LangkahKendaraan] : []),
    ...kembali.map((tripId): LangkahKendaraan => ({ jenis: "kembali", tripId })),
  ];
  const samaLangkah = (a: LangkahKendaraan, b: LangkahKendaraan) => a.jenis === b.jenis && (a.jenis === "utama" || (b.jenis !== "utama" && a.tripId === b.tripId));
  const belumTersimpan = rencana.filter((l) => !sebagian.some((x) => samaLangkah(x, l)));
  const langkahNama = (l: LangkahKendaraan) => (l.jenis === "utama" ? "the default vehicle" : l.jenis === "trip" ? namaTrip(l.tripId) : `back to default on ${namaTrip(l.tripId)}`);
  async function tetapkan() {
    const selesai: LangkahKendaraan[] = [];
    setSebagian([]);
    if (await simpan(utamaKirim, isiTrips, kembali, (l) => selesai.push(l))) tutup();
    else setSebagian(selesai);
  }

  const kunciBerikut = Math.max(0, ...trips.map((t) => t.kunci)) + 1;
  const bisaTambah = trips.length < data.trips.length && data.vehicles.length > 0;

  return (
    <Dialog
      open={open}
      onClose={tutup}
      dismissible={!busy}
      size={data.trips.length > 0 ? "lg" : "md"}
      icon={<IkonBus size={20} />}
      title={`Assign ${plural(n, "person", "people")} to a vehicle`}
      description={`${n === 1 ? orang[0]?.name : `${orang.slice(0, 3).map((o) => o.name).join(", ")}${n > 3 ? `, and ${n - 3} more` : ""}`}. Choose the vehicle they ride on every trip. Add a trip only where they ride something else.`}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan loading={busy} disabled={!siap} onClick={() => void tetapkan()}>
            {pilihan && trips.length === 0 && kembali.length === 0 ? `Assign to ${pilihan.bus.code}` : "Assign"}
          </Button>
        </>
      }
    >
      {data.vehicles.length === 0 ? (
        <EmptyState plain icon={<IkonBus size={40} />} title="No vehicles yet" description="Add vehicles on the Vehicles tab first." action={<Button variant="outlined" size="sm" onClick={keTabBus}>Open Vehicles tab</Button>} />
      ) : (
        <div className="flex flex-col gap-3">
          {sebagian.length > 0 ? (
            <Banner tone="warning" icon={<Warning size={18} />}>
              {`Only part of this was saved: ${sebagian.map(langkahNama).join(", ")}. Not saved yet: ${belumTersimpan.map(langkahNama).join(", ")}. Press Assign again to finish. It is safe to repeat.`}
            </Banner>
          ) : null}
          <div className="flex flex-col gap-2">
            <p className="text-title-small font-semibold text-on-surface">Default vehicle</p>
            <ul className={cx("flex flex-col overflow-y-auto rounded-md border border-outline-variant", data.trips.length > 0 ? "max-h-[30dvh]" : "max-h-[44dvh]")} aria-label="Default vehicle">
              {baris.map((b) => (
                <BarisTujuan
                  key={b.bus.id}
                  name="bus-tujuan"
                  nama={b.bus.code}
                  keterangan={b.bus.plate_number}
                  sisa={b.sisa === null ? plural(b.isi, "passenger") : plural(b.sisa, "free seat")}
                  alasan={b.alasan}
                  checked={utama === b.bus.id}
                  onPilih={() => setUtama(b.bus.id)}
                />
              ))}
            </ul>
            {utama === null && n - tanpaUtama > 0 ? (
              <p className="text-body-small text-on-surface-variant">Leave it empty to keep the default vehicle they have now.</p>
            ) : null}
          </div>

          {data.trips.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-title-small font-semibold text-on-surface">Different vehicle on some trips</p>
              {trips.length > 0 ? (
                <ol className="flex flex-col rounded-md border border-outline-variant" aria-label="Trips with a different vehicle">
                  {trips.map((t) => {
                    const tripId = Number(t.tripId);
                    return (
                      <li key={t.kunci} className="grid items-end gap-3 border-b border-outline-variant px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <SelectField label="Trip" value={t.tripId} onChange={(event) => ubahTrip(t.kunci, { tripId: event.target.value, kendaraan: "" })}>
                          <option value="" disabled>Choose a trip</option>
                          {data.trips.map((trip) => (
                            <option key={trip.id} value={trip.id} disabled={trips.some((x) => x.kunci !== t.kunci && x.tripId === String(trip.id))}>
                              {trip.follows_default ? trip.name : `${trip.name} · own list`}
                            </option>
                          ))}
                        </SelectField>
                        <SelectField label="Vehicle" value={t.kendaraan} disabled={!t.tripId} onChange={(event) => ubahTrip(t.kunci, { kendaraan: event.target.value })}>
                          <option value="" disabled>Choose a vehicle</option>
                          {data.vehicles.map((bus) => {
                            const alasan = t.tripId ? alasanTrip(tripId, bus.id) : null;
                            return <option key={bus.id} value={bus.id} disabled={Boolean(alasan)}>{alasan ? `${bus.code} · ${alasan}` : bus.code}</option>;
                          })}
                          <option value="tanpa">No vehicle on this trip</option>
                        </SelectField>
                        <Button variant="text" className="justify-self-start" disabled={busy} onClick={() => setTrips((lama) => lama.filter((x) => x.kunci !== t.kunci))}>Remove</Button>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              {bisaTambah ? (
                <Button variant="text" className="self-start" icon={<Plus size={16} />} disabled={busy} onClick={() => setTrips((lama) => [...lama, { kunci: kunciBerikut, tripId: "", kendaraan: "" }])}>
                  Add a trip
                </Button>
              ) : null}
              {daftarSendiri.length > 0 ? (
                <p className="text-body-small text-on-surface-variant">
                  {`${daftarSendiri.map((t) => t.name).join(", ")} ${daftarSendiri.length === 1 ? "uses its" : "use their"} own list, so the default vehicle does not apply there. Add ${daftarSendiri.length === 1 ? "it" : "them"} here to put these people on it.`}
                </p>
              ) : null}
            </div>
          ) : null}
          <BannerAkibat kalimat={akibat} />
        </div>
      )}
    </Dialog>
  );
}
