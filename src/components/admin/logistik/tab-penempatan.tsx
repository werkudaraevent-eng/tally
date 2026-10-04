"use client";

import { Bed, Bus as IkonBus, CaretLeft, CaretRight, MagnifyingGlass, Users, Warning, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Banner, Button, ChipMenu, Dialog, EmptyState, IconButton, ListDetail, Pane, PaneBody, PaneFooter, PaneHeader, EMPTY_VALUE } from "@/components/m3";
import { kunciGender, type Bus, type Kamar, type LogistikPeserta } from "@/lib/logistik/types";
import Link from "@/components/event-link";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { KolomCari, type TabProps } from "./bersama";

/**
 * Tab Penempatan: titik mulai Logistik.
 *
 * Panitia bekerja dari orang, bukan dari kamar: "siapa yang belum dapat kamar,
 * rombongan PT X taruh di mana". Karena itu layar pertama adalah satu tabel
 * seluruh peserta dengan kamar dan bus bawaannya, disaring ke yang belum
 * ditempatkan, lalu dicentang banyak sekaligus dan dimasukkan ke kamar atau bus
 * lewat satu dialog.
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

export function TabPenempatan({ data, kirim, busy, keTab }: Pick<TabProps, "data" | "kirim" | "busy"> & { keTab: (tab: "kamar" | "bus") => void }) {
  const [cari, setCari] = useState("");
  const [saringKamar, setSaringKamar] = useState<string[]>([]);
  const [saringBus, setSaringBus] = useState<string[]>([]);
  const [saringPerusahaan, setSaringPerusahaan] = useState<string[]>([]);
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [halaman, setHalaman] = useState({ kunci: "", nomor: 0 });

  const kunciField = data.settings.gender_field_key;
  const satuHotel = data.hotels.length <= 1;

  const kamarPeserta = useMemo(() => new Map(data.lodging.map((b) => [b.participant_id, b.room_id])), [data.lodging]);
  const busPeserta = useMemo(
    () => new Map(data.transport.filter((b) => b.trip_id === null && b.vehicle_id !== null).map((b) => [b.participant_id, b.vehicle_id as number])),
    [data.transport],
  );
  const kamarById = useMemo(() => new Map(data.rooms.map((kamar) => [kamar.id, kamar])), [data.rooms]);
  const hotelById = useMemo(() => new Map(data.hotels.map((hotel) => [hotel.id, hotel])), [data.hotels]);
  const busById = useMemo(() => new Map(data.vehicles.map((bus) => [bus.id, bus])), [data.vehicles]);

  const perusahaan = useMemo(() => {
    const hitung = new Map<string, number>();
    for (const orang of data.participants) hitung.set(orang.company ?? "", (hitung.get(orang.company ?? "") ?? 0) + 1);
    return [...hitung].sort((a, b) => a[0].localeCompare(b[0], "id"));
  }, [data.participants]);

  const tampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return data.participants.filter((orang) => {
      if (kata && !orang.name.toLowerCase().includes(kata) && !(orang.company ?? "").toLowerCase().includes(kata) && orang.qr_code.toLowerCase() !== kata) return false;
      if (saringKamar[0] === "belum" && kamarPeserta.has(orang.id)) return false;
      if (saringKamar[0] === "sudah" && !kamarPeserta.has(orang.id)) return false;
      if (saringBus[0] === "belum" && busPeserta.has(orang.id)) return false;
      if (saringBus[0] === "sudah" && !busPeserta.has(orang.id)) return false;
      if (saringPerusahaan.length > 0 && !saringPerusahaan.includes(orang.company ?? "")) return false;
      return true;
    });
  }, [data.participants, cari, saringKamar, saringBus, saringPerusahaan, kamarPeserta, busPeserta]);

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
  const belumKamar = data.participants.filter((orang) => !kamarPeserta.has(orang.id)).length;
  const belumBus = data.participants.filter((orang) => !busPeserta.has(orang.id)).length;

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

  const labelKamar = (id: number | undefined) => {
    const kamar = id !== undefined ? kamarById.get(id) : undefined;
    if (!kamar) return null;
    return { nomor: kamar.room_number, hotel: satuHotel ? null : hotelById.get(kamar.hotel_id)?.name ?? null };
  };

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
      <Button variant="tonal" size="sm" icon={<Bed size={16} />} onClick={() => setDialog("kamar")}>Assign to room</Button>
      <Button variant="tonal" size="sm" icon={<IkonBus size={16} />} onClick={() => setDialog("bus")}>Assign to bus</Button>
      {dipilih.some((orang) => kamarPeserta.has(orang.id)) ? (
        <Button variant="text" size="sm" onClick={() => setDialog("lepas-kamar")}>Remove from room</Button>
      ) : null}
      {dipilih.some((orang) => busPeserta.has(orang.id)) ? (
        <Button variant="text" size="sm" onClick={() => setDialog("lepas-bus")}>Remove from bus</Button>
      ) : null}
      <Button variant="text" size="sm" className="ml-auto" icon={<X size={16} />} onClick={() => setPilih(new Set())}>Clear selection</Button>
    </PaneHeader>
  ) : (
    <PaneHeader className="flex-wrap gap-2 px-3 py-2.5">
      <KolomCari className="max-w-80" label="Search participants" placeholder="Search name, organisation or QR code" value={cari} onChange={setCari} />
      <ChipMenu
        label="Room"
        options={[{ value: "belum", label: "No room", count: belumKamar }, { value: "sudah", label: "Has a room" }]}
        selected={saringKamar}
        onChange={setSaringKamar}
        summary={(pilihan) => pilihan[0]?.label ?? "Room"}
      />
      <ChipMenu
        label="Bus"
        options={[{ value: "belum", label: "No bus", count: belumBus }, { value: "sudah", label: "Has a bus" }]}
        selected={saringBus}
        onChange={setSaringBus}
        summary={(pilihan) => pilihan[0]?.label ?? "Bus"}
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
            <EmptyState plain icon={<Users size={40} />} title="No active participants yet" description="Registered participants appear here, ready to be assigned to rooms and buses." />
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
                  <th scope="col" className={th}>Room</th>
                  <th scope="col" className={th}>Bus</th>
                </tr>
              </thead>
              <tbody>
                {barisHalaman.map((orang) => {
                  const centang = pilih.has(orang.id);
                  const kamar = labelKamar(kamarPeserta.get(orang.id));
                  const bus = busById.get(busPeserta.get(orang.id) ?? -1);
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
                      <td className={cx(td, "whitespace-nowrap")}>
                        {kamar ? (
                          <>
                            <span className="tabular-nums text-on-surface">{kamar.nomor}</span>
                            {kamar.hotel ? <span className="text-on-surface-variant"> · {kamar.hotel}</span> : null}
                          </>
                        ) : <span className="text-on-surface-variant">{EMPTY_VALUE}</span>}
                      </td>
                      <td className={cx(td, "whitespace-nowrap", bus ? "text-on-surface" : "text-on-surface-variant")}>{bus?.code ?? EMPTY_VALUE}</td>
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
        simpan={async (kamar) => selesai(await kirim("/api/admin/logistik/penghuni", "POST", { room_id: kamar.id, participant_ids: dipilih.map((o) => o.id) }))}
      />

      <DialogBus
        open={dialog === "bus"}
        orang={dipilih}
        data={data}
        busPeserta={busPeserta}
        busy={busy}
        onClose={() => setDialog(null)}
        keTabBus={() => { setDialog(null); keTab("bus"); }}
        simpan={async (bus) => selesai(await kirim("/api/admin/logistik/penumpang", "POST", { trip_id: null, vehicle_id: bus.id, participant_ids: dipilih.map((o) => o.id) }))}
      />

      <Dialog
        open={dialog === "lepas-kamar"}
        onClose={() => setDialog(null)}
        dismissible={!busy}
        title={`Remove ${plural(dipilih.filter((o) => kamarPeserta.has(o.id)).length, "person", "people")} from their room?`}
        description="Their places in the room become free again. Selected people without a room are not affected."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button>
            <Button simpan loading={busy} onClick={async () => {
              const ids = dipilih.filter((o) => kamarPeserta.has(o.id)).map((o) => `participant_id=${o.id}`).join("&");
              await selesai(await kirim(`/api/admin/logistik/penghuni?${ids}`, "DELETE"));
            }}>Remove from room</Button>
          </>
        }
      />

      <Dialog
        open={dialog === "lepas-bus"}
        onClose={() => setDialog(null)}
        dismissible={!busy}
        title={`Remove ${plural(dipilih.filter((o) => busPeserta.has(o.id)).length, "person", "people")} from their default bus?`}
        description="They will no longer have a default bus. Replacement buses set for a single trip (Buses tab, Trips section) still apply."
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button>
            <Button simpan loading={busy} onClick={async () => {
              const ids = dipilih.filter((o) => busPeserta.has(o.id)).map((o) => o.id);
              await selesai(await kirim("/api/admin/logistik/penumpang", "POST", { trip_id: null, vehicle_id: null, participant_ids: ids }));
            }}>Remove from bus</Button>
          </>
        }
      />
    </>
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

function DialogKamar({ open, orang, data, busy, onClose, keTabKamar, simpan }: {
  open: boolean;
  orang: LogistikPeserta[];
  data: TabProps["data"];
  busy: boolean;
  onClose: () => void;
  keTabKamar: () => void;
  simpan: (kamar: Kamar) => Promise<boolean>;
}) {
  const [cari, setCari] = useState("");
  const [semua, setSemua] = useState(false);
  const [tujuan, setTujuan] = useState<number | null>(null);

  function tutup() { setCari(""); setSemua(false); setTujuan(null); onClose(); }

  const kunciField = data.settings.gender_field_key;
  const wajibSama = data.settings.enforce_same_gender;
  const namaField = data.fields.find((field) => field.key === kunciField)?.label ?? kunciField;
  const ids = new Set(orang.map((o) => o.id));
  const orangById = new Map(data.participants.map((o) => [o.id, o]));
  const n = orang.length;

  // Masalah yang menolak SEMUA kamar. Ditampilkan sekali di atas, bukan
  // diulang di setiap baris.
  const tanpaGender = wajibSama && kunciField ? orang.filter((o) => !kunciGender(o.gender)) : [];
  const genderDipilih = new Set(orang.map((o) => kunciGender(o.gender)).filter(Boolean));
  const blokir =
    n > BATAS_KAMAR ? `You can add at most ${BATAS_KAMAR} people to one room at a time. Select fewer people.`
    : wajibSama && !kunciField ? "Room rules are incomplete: choose a gender field on the Rooms tab, or allow mixed rooms."
    : tanpaGender.length > 0 ? `${plural(tanpaGender.length, "person has", "people have")} no answer for ${namaField}: ${tanpaGender.slice(0, 3).map((o) => o.name).join(", ")}${tanpaGender.length > 3 ? ", and others" : ""}.`
    : wajibSama && genderDipilih.size > 1 ? "The selection includes different genders, but rooms must be same-gender. Select people of one gender only."
    : null;
  const gender = [...genderDipilih][0] ?? null;

  const baris = useMemo(() => {
    const penghuni = new Map<number, LogistikPeserta[]>();
    for (const b of data.lodging) {
      const o = orangById.get(b.participant_id);
      // Yang dipilih tidak dihitung: memindahkan mereka membebaskan tempatnya.
      if (!o || ids.has(o.id)) continue;
      penghuni.set(b.room_id, [...(penghuni.get(b.room_id) ?? []), o]);
    }
    const hotelUrut = new Map(data.hotels.map((h, i) => [h.id, i]));
    return [...data.rooms]
      .sort((a, b) => (hotelUrut.get(a.hotel_id) ?? 0) - (hotelUrut.get(b.hotel_id) ?? 0) || a.room_number.localeCompare(b.room_number, "id", { numeric: true }))
      .map((kamar) => {
        const isi = penghuni.get(kamar.id) ?? [];
        const sisa = kamar.capacity - isi.length;
        const genderKamar = kunciGender(isi.find((o) => o.gender)?.gender);
        const alasan = sisa <= 0 ? "Full"
          : sisa < n ? `${sisa} left`
          : wajibSama && gender && genderKamar && genderKamar !== gender ? "Different gender"
          : null;
        const hotel = data.hotels.find((h) => h.id === kamar.hotel_id)?.name ?? "";
        return { kamar, isi, sisa, alasan, hotel };
      });
    // `orangById` dan `ids` dibangun ulang tiap render dari data yang sama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, orang, n, gender, wajibSama]);

  const kata = cari.trim().toLowerCase();
  const tampil = baris.filter((b) =>
    (semua || !b.alasan || b.kamar.id === tujuan) &&
    (!kata || b.kamar.room_number.toLowerCase().includes(kata) || b.hotel.toLowerCase().includes(kata) || b.isi.some((o) => o.name.toLowerCase().includes(kata))));
  const pilihan = baris.find((b) => b.kamar.id === tujuan);

  return (
    <Dialog
      open={open}
      onClose={tutup}
      dismissible={!busy}
      size="lg"
      icon={<Bed size={20} />}
      title={`Assign ${plural(n, "person", "people")} to a room`}
      description={n === 1 ? orang[0]?.name : `${orang.slice(0, 3).map((o) => o.name).join(", ")}${n > 3 ? `, and ${n - 3} more` : ""}`}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan loading={busy} disabled={!pilihan || Boolean(blokir) || Boolean(pilihan.alasan)} onClick={async () => { if (pilihan && await simpan(pilihan.kamar)) tutup(); }}>
            {pilihan ? `Assign to ${pilihan.kamar.room_number}` : "Assign"}
          </Button>
        </>
      }
    >
      {data.rooms.length === 0 ? (
        <EmptyState plain icon={<Bed size={40} />} title="No rooms yet" description="Add hotels and their rooms on the Rooms tab first." action={<Button variant="outlined" size="sm" onClick={keTabKamar}>Open Rooms tab</Button>} />
      ) : blokir ? (
        <Banner tone="warning" icon={<Warning size={18} />}>{blokir}</Banner>
      ) : (
        <div className="flex flex-col gap-3">
          <KolomCari label="Search rooms" placeholder="Room number, hotel or occupant name" value={cari} onChange={setCari} />
          <label className="flex items-center gap-2 text-body-medium text-on-surface">
            <input type="checkbox" checked={semua} onChange={(event) => setSemua(event.target.checked)} className="size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
            Also show rooms without enough space
          </label>
          <ul className="flex max-h-[44dvh] flex-col overflow-y-auto rounded-md border border-outline-variant" aria-label="Destination room">
            {tampil.length === 0 ? (
              <li className="px-4 py-6 text-center text-body-medium text-on-surface-variant">
                {kata ? "No matching rooms." : `No room has ${plural(n, "free place")}${gender && wajibSama ? " for this gender" : ""}. Add rooms on the Rooms tab, or select fewer people.`}
              </li>
            ) : tampil.map((b) => (
              <BarisTujuan
                key={b.kamar.id}
                name="kamar-tujuan"
                nama={[b.kamar.room_number, data.hotels.length > 1 ? b.hotel : null, b.kamar.room_type].filter(Boolean).join(" · ")}
                keterangan={b.isi.length > 0 ? b.isi.map((o) => o.name).join(", ") : "Empty"}
                sisa={`${b.sisa} free`}
                alasan={b.alasan}
                checked={tujuan === b.kamar.id}
                onPilih={() => setTujuan(b.kamar.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}

/* -------------------------------------------------------------- Dialog bus */

function DialogBus({ open, orang, data, busPeserta, busy, onClose, keTabBus, simpan }: {
  open: boolean;
  orang: LogistikPeserta[];
  data: TabProps["data"];
  busPeserta: Map<string, number>;
  busy: boolean;
  onClose: () => void;
  keTabBus: () => void;
  simpan: (bus: Bus) => Promise<boolean>;
}) {
  const [tujuan, setTujuan] = useState<number | null>(null);
  function tutup() { setTujuan(null); onClose(); }

  const n = orang.length;
  const ids = new Set(orang.map((o) => o.id));
  const aktif = new Set(data.participants.map((o) => o.id));
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
  const pilihan = baris.find((b) => b.bus.id === tujuan);

  return (
    <Dialog
      open={open}
      onClose={tutup}
      dismissible={!busy}
      size="md"
      icon={<IkonBus size={20} />}
      title={`Assign ${plural(n, "person", "people")} to a bus`}
      description="This becomes their default bus on every trip. Exceptions for a single trip are set on the Buses tab, Trips section."
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan loading={busy} disabled={!pilihan || Boolean(pilihan.alasan)} onClick={async () => { if (pilihan && await simpan(pilihan.bus)) tutup(); }}>
            {pilihan ? `Assign to ${pilihan.bus.code}` : "Assign"}
          </Button>
        </>
      }
    >
      {data.vehicles.length === 0 ? (
        <EmptyState plain icon={<IkonBus size={40} />} title="No buses yet" description="Add buses on the Buses tab first." action={<Button variant="outlined" size="sm" onClick={keTabBus}>Open Buses tab</Button>} />
      ) : (
        <ul className="flex max-h-[44dvh] flex-col overflow-y-auto rounded-md border border-outline-variant" aria-label="Destination bus">
          {baris.map((b) => (
            <BarisTujuan
              key={b.bus.id}
              name="bus-tujuan"
              nama={b.bus.code}
              keterangan={b.bus.plate_number}
              sisa={b.sisa === null ? plural(b.isi, "passenger") : plural(b.sisa, "free seat")}
              alasan={b.alasan}
              checked={tujuan === b.bus.id}
              onPilih={() => setTujuan(b.bus.id)}
            />
          ))}
        </ul>
      )}
    </Dialog>
  );
}
