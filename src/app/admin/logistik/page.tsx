"use client";

import { Plus, UploadSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Button, MetaSeparator, Pane, SegmentedButton, Tabs, WorkspaceHeader, WorkspacePage } from "@/components/m3";
import { Galat, Kerangka, type Kirim } from "@/components/admin/logistik/bersama";
import { DialogImpor } from "@/components/admin/logistik/dialog-impor";
import { TabBarang } from "@/components/admin/logistik/tab-barang";
import { TabAgenda, TabBus } from "@/components/admin/logistik/tab-bus";
import { TabKamar } from "@/components/admin/logistik/tab-kamar";
import { TabPenempatan } from "@/components/admin/logistik/tab-penempatan";
import { useToast } from "@/components/toast";
import { pesanGalatApi } from "@/lib/api-message";
import { eventApiPath } from "@/lib/event-url";
import type { LogistikData } from "@/lib/logistik/types";

/**
 * Logistik peserta: kamar, bus, dan barang yang dibagikan.
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

type Bagian = "penempatan" | "kamar" | "bus" | "barang";
type BagianBus = "bus" | "agenda";
/** Dialog "baru" yang dibuka dari kepala halaman. */
type Baru = "kamar" | "bus" | "agenda" | "barang";

export default function LogistikPage() {
  const [data, setData] = useState<LogistikData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bagian, setBagian] = useState<Bagian>("penempatan");
  const [bagianBus, setBagianBus] = useState<BagianBus>("bus");
  const [baru, setBaru] = useState<Baru | null>(null);
  const [hotelBaru, setHotelBaru] = useState(false);
  const [impor, setImpor] = useState(false);
  const toast = useToast();

  const muat = useCallback(async () => {
    const response = await fetch(eventApiPath("/api/admin/logistik"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setError("Data logistik gagal dimuat. Periksa koneksi, lalu muat ulang halaman.");
      return;
    }
    setData(await response.json());
    setError("");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void muat(), 0);
    return () => window.clearTimeout(timer);
  }, [muat]);

  const kirim: Kirim = useCallback(async (path, method, body) => {
    setBusy(true);
    const response = await fetch(eventApiPath(path), {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => null);
    if (!response) {
      setBusy(false);
      toast.error("Koneksi gagal", "Muat ulang untuk melihat keadaan sebenarnya.");
      return null;
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy(false);
      toast.error("Gagal disimpan", pesanGalatApi(json) ?? "Coba lagi.");
      return null;
    }
    // Dimuat ulang sebelum tombolnya hidup lagi: angka isi kamar dan bus yang
    // tertinggal satu langkah mengundang klik kedua ke kamar yang sudah penuh.
    await muat();
    setBusy(false);
    return json;
  }, [muat, toast]);

  // Hanya peserta aktif yang dihitung, sama dengan `assign_room` dan
  // `transport_effective`: penempatan milik peserta yang dihapus di sumber
  // tetap tersimpan, tetapi tidak menempati tempat.
  const aktif = new Set(data?.participants.map((orang) => orang.id));
  const tanpaKamar = data ? data.participants.length - new Set(data.lodging.map((b) => b.participant_id).filter((id) => aktif.has(id))).size : 0;
  const tanpaBus = data
    ? data.participants.length - new Set(data.transport.filter((b) => b.trip_id === null && b.vehicle_id !== null).map((b) => b.participant_id).filter((id) => aktif.has(id))).size
    : 0;

  // Dialog "baru" milik bagian yang sedang tampil: Bus baru di Daftar bus,
  // Agenda baru di bagian Agenda.
  const aktifBaru: Baru | null = bagian === "penempatan" ? null : bagian === "bus" ? bagianBus : bagian;
  const tabProps = data ? { data, kirim, busy, baru: baru !== null && baru === aktifBaru, tutupBaru: () => setBaru(null) } : null;
  const LABEL_BARU: Record<Baru, string> = { kamar: "Kamar baru", bus: "Bus baru", agenda: "Agenda baru", barang: "Barang baru" };

  const pilihBus = (
    <SegmentedButton<BagianBus>
      label="Bagian bus"
      value={bagianBus}
      onChange={(nilai) => { setBagianBus(nilai); setBaru(null); }}
      options={[
        { value: "bus", label: "Daftar bus", badge: data?.vehicles.length || undefined },
        { value: "agenda", label: "Agenda", badge: data?.trips.length || undefined },
      ]}
    />
  );

  return (
    <WorkspacePage fill>
      <WorkspaceHeader
        meta={data ? (
          <>
            <span className="tabular-nums">{data.participants.length} peserta aktif</span>
            {data.rooms.length > 0 ? (
              <>
                <MetaSeparator />
                <span className="tabular-nums">{tanpaKamar === 0 ? "Semua dapat kamar" : `${tanpaKamar} belum dapat kamar`}</span>
              </>
            ) : null}
            {data.vehicles.length > 0 ? (
              <>
                <MetaSeparator />
                <span className="tabular-nums">{tanpaBus === 0 ? "Semua punya bus" : `${tanpaBus} belum punya bus`}</span>
              </>
            ) : null}
          </>
        ) : null}
        actions={data && bagian !== "barang" && !(bagian === "bus" && bagianBus === "agenda") ? (
          <>
            <Button variant="outlined" icon={<UploadSimple size={16} />} onClick={() => setImpor(true)}>Impor Excel</Button>
            {aktifBaru === "kamar" && data.hotels.length === 0 ? (
              // Tanpa hotel, "Kamar baru" hanya bisa ditolak. Satu tombol yang
              // bisa ditekan lebih jelas daripada dua dengan salah satunya mati.
              <Button icon={<Plus size={16} />} onClick={() => setHotelBaru(true)}>Hotel baru</Button>
            ) : aktifBaru ? (
              <>
                {aktifBaru === "kamar" ? <Button variant="outlined" onClick={() => setHotelBaru(true)}>Hotel baru</Button> : null}
                <Button variant="outlined" icon={<Plus size={16} />} onClick={() => setBaru(aktifBaru)}>{LABEL_BARU[aktifBaru]}</Button>
              </>
            ) : null}
          </>
        ) : data && aktifBaru ? (
          <Button variant="outlined" icon={<Plus size={16} />} onClick={() => setBaru(aktifBaru)}>{LABEL_BARU[aktifBaru]}</Button>
        ) : null}
      />

      <Tabs<Bagian>
        label="Bagian logistik"
        idPrefix="logistik"
        value={bagian}
        onChange={(nilai) => { setBagian(nilai); setBaru(null); }}
        options={[
          { value: "penempatan", label: "Penempatan" },
          { value: "kamar", label: "Kamar", badge: data?.rooms.length || undefined },
          { value: "bus", label: "Bus", badge: data?.vehicles.length || undefined },
          { value: "barang", label: "Barang", badge: data?.items.length || undefined },
        ]}
      />

      <div role="tabpanel" id={`logistik-panel-${bagian}`} aria-labelledby={`logistik-tab-${bagian}`} className="flex min-h-0 flex-1 flex-col">
        {error && !data ? (
          <Pane aria-label="Galat"><Galat pesan={error} /></Pane>
        ) : !tabProps ? (
          <Pane aria-label="Memuat"><Kerangka /></Pane>
        ) : bagian === "penempatan" ? (
          <TabPenempatan data={tabProps.data} kirim={kirim} busy={busy} keTab={(tab) => { setBagian(tab); setBaru(null); }} />
        ) : bagian === "kamar" ? (
          <TabKamar {...tabProps} hotelBaru={hotelBaru} tutupHotelBaru={() => setHotelBaru(false)} />
        ) : bagian === "bus" ? (
          bagianBus === "bus" ? <TabBus {...tabProps} atas={pilihBus} /> : <TabAgenda {...tabProps} atas={pilihBus} />
        ) : (
          <TabBarang {...tabProps} />
        )}
      </div>

      <DialogImpor open={impor} jenisAwal={bagian === "bus" ? "bus" : "kamar"} onClose={() => setImpor(false)} onSelesai={muat} />
    </WorkspacePage>
  );
}
