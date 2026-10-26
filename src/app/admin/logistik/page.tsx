"use client";

import { Plus, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button, MetaSeparator, Pane, SegmentedButton, Tabs, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { Galat, Kerangka } from "@/components/admin/logistik/bersama";
import { DialogImpor } from "@/components/admin/logistik/dialog-impor";
import { TabBarang } from "@/components/admin/logistik/tab-barang";
import { TabAgenda, TabBus } from "@/components/admin/logistik/tab-bus";
import { TabKamar } from "@/components/admin/logistik/tab-kamar";
import { TabKereta } from "@/components/admin/logistik/tab-kereta";
import { TabPenempatan } from "@/components/admin/logistik/tab-penempatan";
import { useLogistik } from "@/components/admin/logistik/use-logistik";
import { plural } from "@/lib/plural";

/**
 * Logistik peserta: kamar, bus, tiket kereta, dan barang yang dibagikan.
 *
 * Tiga hal yang peserta lihat di area pesertanya (`member_logistics`), diatur
 * di satu halaman karena panitia mengerjakannya bersamaan dan saling
 * bersinggungan: rombongan satu perusahaan biasanya sekamar berdua dan satu
 * bus.
 *
 * Tab pertama, Penempatan, adalah tempat kerja sehari-hari: satu tabel seluruh
 * peserta, dicentang banyak lalu dimasukkan ke kamar atau bus. Tab lainnya
 * mengatur isi gudangnya (hotel dan kamar, bus dan agenda, barang).
 *
 * Keempat tab membaca satu muatan data. Tidak ada polling: berbeda dengan
 * Kehadiran, angka di sini hanya bergerak karena panitia di layar ini sendiri,
 * dan setiap perubahan memuat ulang datanya.
 */

type Bagian = "penempatan" | "kamar" | "bus" | "kereta" | "barang";
type BagianBus = "bus" | "agenda";
/** Dialog "baru" yang dibuka dari kepala halaman. */
type Baru = "kamar" | "bus" | "agenda" | "barang" | "kereta";

export default function LogistikPage() {
  const { data, error, busy, muat, kirim } = useLogistik();
  const [bagian, setBagian] = useState<Bagian>("penempatan");
  const [bagianBus, setBagianBus] = useState<BagianBus>("bus");
  const [baru, setBaru] = useState<Baru | null>(null);
  const [hotelBaru, setHotelBaru] = useState(false);
  const [impor, setImpor] = useState(false);
  // Trip yang langsung terpilih di Buses > Trips (?tab=bus&trip=). Dilepas begitu
  // panitia pindah tab, supaya kembali ke Trips tidak memilihnya lagi.
  const [tripAwal, setTripAwal] = useState<number | null>(null);

  // ?tab=barang dari Check-in > Checkpoints membuka Kit items langsung,
  // ?tab=kamar dan ?tab=bus dari dialog Logistik di Daftar peserta, dan
  // ?tab=bus&trip=<id> dari Agenda ("Edit in Logistics") membuka Buses > Trips
  // dengan trip itu terpilih. Dibaca sesudah mount supaya render server dan
  // klien sama.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const tab = query.get("tab");
      if (tab !== "barang" && tab !== "bus" && tab !== "kamar") return;
      setBagian(tab);
      const trip = Number(query.get("trip"));
      if (tab === "bus" && Number.isInteger(trip) && trip > 0) {
        setBagianBus("agenda");
        setTripAwal(trip);
      }
      // Di ponsel tab Kit items ada di ujung kanan strip dan terpotong.
      requestAnimationFrame(() => document.getElementById(`logistik-tab-${tab}`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void muat(), 0);
    return () => window.clearTimeout(timer);
  }, [muat]);

  // Jam trip yang ditautkan ke Agenda ikut bergeser bila barisnya digeser di
  // Agenda (pemicu database, migrasi 202610170002), dan "Edit in Agenda"
  // membuka tab lain. Kembali ke tab ini memuat ulang data supaya jamnya tidak
  // basi. Acara tanpa trip tertaut tidak memuat apa pun tambahan.
  const adaTautanAgenda = data?.trips.some((trip) => trip.rundown_item_id !== null) ?? false;
  useEffect(() => {
    if (!adaTautanAgenda || busy) return;
    let timer: number | undefined;
    const onFocus = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void muat(), 300);
    };
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("focus", onFocus); window.clearTimeout(timer); };
  }, [adaTautanAgenda, busy, muat]);

  // Hanya peserta aktif yang dihitung, sama dengan `assign_room` dan
  // `transport_effective`: penempatan milik peserta yang dihapus di sumber
  // tetap tersimpan, tetapi tidak menempati tempat.
  const aktif = new Set(data?.participants.map((orang) => orang.id));
  const inapAktif = data ? data.lodging.filter((b) => aktif.has(b.participant_id)) : [];
  const tanpaHotel = data ? data.participants.length - new Set(inapAktif.map((b) => b.participant_id)).size : 0;
  // Hotel sudah, nomor kamar menyusul (orang, bukan stay: yang pindah hotel
  // bisa menunggu kamar di dua hotel).
  const menungguKamar = new Set(inapAktif.filter((b) => b.room_id === null).map((b) => b.participant_id)).size;
  const tanpaBus = data
    ? data.participants.length - new Set(data.transport.filter((b) => b.trip_id === null && b.vehicle_id !== null).map((b) => b.participant_id).filter((id) => aktif.has(id))).size
    : 0;

  // Dialog "baru" milik bagian yang sedang tampil: Bus baru di Daftar bus,
  // Agenda baru di bagian Agenda.
  const aktifBaru: Baru | null = bagian === "penempatan" || (bagian === "kereta" && !data?.trains_ready) ? null : bagian === "bus" ? bagianBus : bagian;
  const tabProps = data ? { data, kirim, busy, baru: baru !== null && baru === aktifBaru, tutupBaru: () => setBaru(null) } : null;
  const LABEL_BARU: Record<Baru, string> = { kamar: "Add room", bus: "Add vehicle", agenda: "Add trip", barang: "Add kit item", kereta: "Add ticket" };

  const pilihBus = (
    <SegmentedButton<BagianBus>
      label="Vehicle section"
      value={bagianBus}
      onChange={(nilai) => { setBagianBus(nilai); setBaru(null); setTripAwal(null); }}
      options={[
        { value: "bus", label: "Vehicles", badge: data?.vehicles.length || undefined },
        { value: "agenda", label: "Trips", badge: data?.trips.length || undefined },
      ]}
    />
  );

  return (
    <WorkspacePage fill>
      <div lang="en" className="contents">
      <WorkspaceHeader
        meta={data ? (
          <>
            <span className="tabular-nums">{plural(data.participants.length, "active participant")}</span>
            {data.rooms.length > 0 || data.lodging.length > 0 ? (
              <>
                <MetaSeparator />
                <span className="tabular-nums">
                  {tanpaHotel + menungguKamar === 0 ? "Everyone has a room"
                    : [tanpaHotel > 0 ? `${tanpaHotel.toLocaleString("en-GB")} without a hotel` : null,
                      menungguKamar > 0 ? `${menungguKamar.toLocaleString("en-GB")} waiting for a room` : null].filter(Boolean).join(", ")}
                </span>
              </>
            ) : null}
            {data.vehicles.length > 0 ? (
              <>
                <MetaSeparator />
                <span className="tabular-nums">{tanpaBus === 0 ? "Everyone has a vehicle" : `${tanpaBus.toLocaleString("en-GB")} without a vehicle`}</span>
              </>
            ) : null}
          </>
        ) : null}
        actions={data && bagian !== "barang" && !(bagian === "bus" && bagianBus === "agenda") && !(bagian === "kereta" && !data.trains_ready) ? (
          <>
            <Button variant="outlined" icon={<UploadSimple size={16} />} onClick={() => setImpor(true)}>Import from Excel</Button>
            {aktifBaru === "kamar" && data.hotels.length === 0 ? (
              // Tanpa hotel, "Kamar baru" hanya bisa ditolak. Satu tombol yang
              // bisa ditekan lebih jelas daripada dua dengan salah satunya mati.
              <Button icon={<Plus size={16} />} onClick={() => setHotelBaru(true)}>Add hotel</Button>
            ) : aktifBaru ? (
              <>
                {aktifBaru === "kamar" ? <Button variant="outlined" onClick={() => setHotelBaru(true)}>Add hotel</Button> : null}
                <Button variant="outlined" icon={<Plus size={16} />} onClick={() => setBaru(aktifBaru)}>{LABEL_BARU[aktifBaru]}</Button>
              </>
            ) : null}
          </>
        ) : data && aktifBaru ? (
          <Button variant="outlined" icon={<Plus size={16} />} onClick={() => setBaru(aktifBaru)}>{LABEL_BARU[aktifBaru]}</Button>
        ) : null}
      />

      <Tabs<Bagian>
        label="Logistics sections"
        idPrefix="logistik"
        value={bagian}
        onChange={(nilai) => { setBagian(nilai); setBaru(null); setTripAwal(null); }}
        options={[
          { value: "penempatan", label: "Assignments" },
          { value: "kamar", label: "Rooms", badge: data?.rooms.length || undefined },
          { value: "bus", label: "Vehicles", badge: data?.vehicles.length || undefined },
          { value: "kereta", label: "Trains", badge: data?.trains.length || undefined },
          { value: "barang", label: "Kit items", badge: data?.items.length || undefined },
        ]}
      />

      <div role="tabpanel" id={`logistik-panel-${bagian}`} aria-labelledby={`logistik-tab-${bagian}`} className="flex min-h-0 flex-1 flex-col">
        {error && !data ? (
          <Pane aria-label="Error"><Galat pesan={error} /></Pane>
        ) : !tabProps ? (
          <Pane aria-label="Loading"><Kerangka /></Pane>
        ) : bagian === "penempatan" ? (
          <TabPenempatan data={tabProps.data} kirim={kirim} busy={busy} keTab={(tab) => { setBagian(tab); setBaru(null); }} />
        ) : bagian === "kamar" ? (
          <TabKamar {...tabProps} hotelBaru={hotelBaru} tutupHotelBaru={() => setHotelBaru(false)} />
        ) : bagian === "bus" ? (
          bagianBus === "bus" ? <TabBus {...tabProps} atas={pilihBus} /> : <TabAgenda {...tabProps} atas={pilihBus} pilihAwal={tripAwal} />
        ) : bagian === "kereta" ? (
          <TabKereta {...tabProps} />
        ) : (
          <TabBarang {...tabProps} />
        )}
      </div>

      <DialogImpor open={impor} jenisAwal={bagian === "bus" ? "bus" : bagian === "kereta" ? "kereta" : "kamar"} onClose={() => setImpor(false)} onSelesai={muat} />
      </div>
    </WorkspacePage>
  );
}
