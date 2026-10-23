"use client";

import { Bed, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Banner, Button, Dialog, SelectField, StatusChip, TextField } from "@/components/m3";
import { labelTanggal, malamIso, potonganStay, tanggalStay, tanggalZona, type Stay } from "@/lib/logistik/stay";
import type { Hotel, Kamar, LogistikPeserta } from "@/lib/logistik/types";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import type { Kirim } from "./bersama";

/**
 * Potongan "pindah hotel" di Logistik: malam per stay, kalimat akibatnya, dan
 * dialog Stays satu peserta.
 *
 * Satu aturan untuk panitia: peserta punya satu atau lebih stay (hotel, kamar,
 * malam). Hampir semua acara cukup satu stay tanpa tanggal; malam hanya diisi
 * untuk yang pindah hotel. Setiap perubahan yang memotong stay lain disebut
 * dalam kalimat sebelum tombolnya ditekan, jadi tidak ada yang berubah diam-diam.
 */

/** Tanggal ("2026-11-06") ke ISO dengan jam check-in/out hotelnya, atau jam bawaan. */
export const malamKeIso = malamIso;

/** Tanggal hotel sebagai nilai awal kolom malam. */
export function malamHotel(hotel: Hotel | undefined, offset: string) {
  return {
    masuk: hotel?.check_in_at ? tanggalZona(hotel.check_in_at, offset) : "",
    keluar: hotel?.check_out_at ? tanggalZona(hotel.check_out_at, offset) : "",
  };
}

/** Galat kolom malam, atau null bila keduanya sah. */
export function galatMalam(masuk: string, keluar: string): string | null {
  if (!masuk || !keluar) return "Enter both dates.";
  if (keluar <= masuk) return "Check-out must be after check-in.";
  return null;
}

/** "Thu 5 Nov → Fri 6 Nov", dari tanggal efektif. */
export function labelMalam(masuk: string | null, keluar: string | null, offset: string): string | null {
  if (!masuk && !keluar) return null;
  const a = masuk ? labelTanggal(tanggalZona(masuk, offset)) : "…";
  const b = keluar ? labelTanggal(tanggalZona(keluar, offset)) : "…";
  return `${a} → ${b}`;
}

/**
 * Kalimat akibat untuk dialog: stay lain yang terpotong atau terhapus.
 * `malam` null = "All nights": semua stay di hotel lain diganti.
 */
export function kalimatAkibat({ orang, stayPeserta, hotelId, malam, hotelById, offset }: {
  orang: LogistikPeserta[];
  stayPeserta: Map<string, Stay[]>;
  hotelId: number;
  malam: { check_in_at: string; check_out_at: string } | null;
  hotelById: Map<number, Hotel>;
  offset: string;
}): string[] {
  const nama = (id: number) => hotelById.get(id)?.name ?? "another hotel";
  if (!malam) {
    const lain = new Map<number, number>();
    for (const o of orang) {
      for (const stay of stayPeserta.get(o.id) ?? []) {
        if (stay.hotel_id !== hotelId) lain.set(stay.hotel_id, (lain.get(stay.hotel_id) ?? 0) + 1);
      }
    }
    return [...lain].map(([id, n]) => `${plural(n, "person", "people")} also ${n === 1 ? "has" : "have"} a stay at ${nama(id)}. All nights replaces it with this hotel.`);
  }
  const hitung = new Map<string, { kalimat: string; n: number }>();
  for (const o of orang) {
    for (const p of potonganStay(stayPeserta.get(o.id) ?? [], hotelId, malam.check_in_at, malam.check_out_at, hotelById, offset)) {
      const kalimat = p.jenis === "akhir"
        ? `stay at ${nama(p.hotel_id)} will end on ${labelTanggal(p.tanggal)}${p.sisaHilang ? `. It does not continue after ${labelTanggal(p.sisaHilang)}; add ${nama(p.hotel_id)} again for those nights` : ""}`
        : p.jenis === "awal" ? `stay at ${nama(p.hotel_id)} will start on ${labelTanggal(p.tanggal)}`
        : `stay at ${nama(p.hotel_id)} will be removed, because it falls inside these nights`;
      const lama = hitung.get(kalimat);
      hitung.set(kalimat, { kalimat, n: (lama?.n ?? 0) + 1 });
    }
  }
  return [...hitung.values()].map(({ kalimat, n }) => n === 1 && orang.length === 1 ? `Their ${kalimat}.` : `${plural(n, "person", "people")}: their ${kalimat}.`);
}

/** Pilihan malam di dialog Assign to hotel. */
export function PilihMalam({ semua, setSemua, masuk, keluar, ubah, galat, hotel, offset }: {
  semua: boolean;
  setSemua: (semua: boolean) => void;
  masuk: string;
  keluar: string;
  ubah: (masuk: string, keluar: string) => void;
  galat: string | null;
  hotel: Hotel | undefined;
  offset: string;
}) {
  const tanggalHotel = hotel ? labelMalam(hotel.check_in_at, hotel.check_out_at, offset) : null;
  const opsi = (nilai: boolean, judul: string, keterangan: string) => (
    <label className={cx("flex cursor-pointer items-start gap-3 px-4 py-2.5 text-body-medium hover:bg-panel-high", semua === nilai && "bg-accent-soft")}>
      <input type="radio" name="malam" checked={semua === nilai} onChange={() => setSemua(nilai)} className="mt-1 size-4 shrink-0 accent-[var(--md-sys-color-primary)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-on-surface">{judul}</span>
        <span className="block text-on-surface-variant">{keterangan}</span>
      </span>
    </label>
  );
  return (
    <fieldset className="rounded-md border border-outline-variant">
      <legend className="sr-only">Nights</legend>
      <p className="bg-surface-container-lowest px-4 py-1.5 text-body-small font-medium text-on-surface-variant">Nights</p>
      <div className="border-t border-outline-variant">
        {opsi(true, "All nights", tanggalHotel ? `Hotel dates, ${tanggalHotel}. Replaces any other hotel they have.` : "Hotel dates. Replaces any other hotel they have.")}
      </div>
      <div className="border-t border-outline-variant">
        {opsi(false, "Only some nights", "For people who move hotels. Keeps their other hotels for the other nights.")}
        {!semua ? (
          <div className="grid grid-cols-2 gap-3 px-4 pb-3 pl-11">
            <TextField label="Check-in" type="date" value={masuk} max={keluar || undefined} onChange={(event) => ubah(event.target.value, keluar)} />
            <TextField label="Check-out" type="date" value={keluar} min={masuk || undefined} error={masuk && keluar && galat ? galat : undefined} onChange={(event) => ubah(masuk, event.target.value)} />
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

/** Kalimat akibat, satu Banner. Kosong = tidak ada yang terpotong. */
export function BannerAkibat({ kalimat }: { kalimat: string[] }) {
  if (kalimat.length === 0) return null;
  return (
    <Banner tone="info">
      <span className="flex flex-col gap-1">{kalimat.map((k) => <span key={k}>{k}</span>)}</span>
    </Banner>
  );
}

/* ------------------------------------------------------------ Dialog Stays */

type Sunting = { jenis: "ubah"; hotelId: number } | { jenis: "tambah" } | null;

/**
 * Semua stay satu peserta, dibuka dari kolom Stay di Assignments: ubah malam,
 * lepas satu hotel, atau tambah hotel. Kamar dipilih lewat Assign to hotel
 * atau tab Rooms, bukan di sini: aturan kapasitas dan jenis kelamin milik
 * daftar kamar itu.
 */
export function DialogStays({ orang, stays, hotels, rooms, offset, busy, kirim, onClose }: {
  orang: LogistikPeserta | null;
  stays: Stay[];
  hotels: Hotel[];
  rooms: Kamar[];
  offset: string;
  busy: boolean;
  kirim: Kirim;
  onClose: () => void;
}) {
  const [sunting, setSunting] = useState<Sunting>(null);
  const [hotelBaru, setHotelBaru] = useState("");
  const [masuk, setMasuk] = useState("");
  const [keluar, setKeluar] = useState("");
  const [lepas, setLepas] = useState<number | null>(null);

  const hotelById = new Map(hotels.map((h) => [h.id, h]));
  const kamarById = new Map(rooms.map((k) => [k.id, k]));
  const bebas = hotels.filter((h) => !stays.some((s) => s.hotel_id === h.id));

  function tutup() { setSunting(null); setLepas(null); setHotelBaru(""); onClose(); }
  function mulai(baru: Sunting, hotel?: Hotel, stay?: Stay) {
    const t = stay ? tanggalStay(stay, hotel) : null;
    const awal = t ? { masuk: t.masuk ? tanggalZona(t.masuk, offset) : "", keluar: t.keluar ? tanggalZona(t.keluar, offset) : "" } : malamHotel(hotel, offset);
    setMasuk(awal.masuk); setKeluar(awal.keluar); setLepas(null);
    setHotelBaru(hotel && baru?.jenis === "tambah" ? String(hotel.id) : "");
    setSunting(baru);
  }

  // Orang tanpa stay: hotel pertama boleh tanpa tanggal (ikut tanggal hotel).
  const tanpaStay = stays.length === 0;
  const idTujuan = sunting?.jenis === "ubah" ? sunting.hotelId : Number(hotelBaru) || null;
  const malamOpsional = sunting?.jenis === "tambah" && tanpaStay;
  const kosong = !masuk && !keluar;
  const galat = malamOpsional && kosong ? null : galatMalam(masuk, keluar);
  const malam = idTujuan && !galat && !kosong ? malamKeIso(hotelById.get(idTujuan), masuk, keluar, offset) : null;
  const akibat = orang && idTujuan && malam
    ? kalimatAkibat({ orang: [orang], stayPeserta: new Map([[orang.id, stays]]), hotelId: idTujuan, malam, hotelById, offset })
    : [];

  async function simpan() {
    if (!orang || !idTujuan || galat) return;
    const hasil = await kirim("/api/admin/logistik/penghuni", "POST", { hotel_id: idTujuan, participant_ids: [orang.id], ...(malam ?? {}) });
    if (hasil !== null) setSunting(null);
  }

  async function hapus(hotelId: number) {
    if (!orang) return;
    const hasil = await kirim(`/api/admin/logistik/penghuni?participant_id=${orang.id}&hotel_id=${hotelId}`, "DELETE");
    if (hasil !== null) setLepas(null);
  }

  const formMalam = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Check-in" type="date" optional={malamOpsional} value={masuk} max={keluar || undefined} onChange={(event) => setMasuk(event.target.value)} />
        <TextField label="Check-out" type="date" optional={malamOpsional} value={keluar} min={masuk || undefined} error={masuk && keluar && galat ? galat : undefined} onChange={(event) => setKeluar(event.target.value)} />
      </div>
      {malamOpsional ? <p className="text-body-small text-on-surface-variant">Leave both empty to use the hotel&apos;s dates.</p> : null}
      <BannerAkibat kalimat={akibat} />
      <div className="flex justify-end gap-2">
        <Button variant="text" size="sm" disabled={busy} onClick={() => setSunting(null)}>Cancel</Button>
        <Button variant="tonal" size="sm" loading={busy} disabled={!idTujuan || Boolean(galat)} onClick={simpan}>Save</Button>
      </div>
    </div>
  );

  return (
    <Dialog
      open={orang !== null}
      onClose={tutup}
      dismissible={!busy}
      size="md"
      icon={<Bed size={20} />}
      title={orang ? `Stays · ${orang.name}` : "Stays"}
      description="Each hotel this person stays at, in date order. Add a hotel and its nights for someone who moves hotels."
      actions={<Button variant="outlined" disabled={busy} onClick={tutup}>Done</Button>}
    >
      <div className="flex flex-col gap-3">
        {tanpaStay && sunting?.jenis !== "tambah" ? (
          <p className="text-body-medium text-on-surface-variant">No hotel yet.</p>
        ) : null}
        {stays.length > 0 ? (
          <ol className="flex flex-col rounded-md border border-outline-variant" aria-label="Stays">
            {stays.map((stay) => {
              const hotel = hotelById.get(stay.hotel_id);
              const kamar = stay.room_id !== null ? kamarById.get(stay.room_id) : undefined;
              const t = tanggalStay(stay, hotel);
              const label = labelMalam(t.masuk, t.keluar, offset);
              const sendiri = stay.check_in_at !== null || stay.check_out_at !== null;
              const diubah = sunting?.jenis === "ubah" && sunting.hotelId === stay.hotel_id;
              return (
                <li key={stay.hotel_id} className="flex flex-col gap-2 border-b border-outline-variant px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 truncate text-title-small font-semibold text-on-surface">{hotel?.name ?? "Hotel"}</span>
                    {kamar ? <span className="tabular-nums text-body-medium text-on-surface">Room {kamar.room_number}</span> : <StatusChip dot tone="warning">Room to follow</StatusChip>}
                  </div>
                  <p className="text-body-medium text-on-surface-variant">
                    {label ? (sendiri ? label : `Hotel dates · ${label}`) : "Hotel dates not set yet"}
                  </p>
                  {diubah ? formMalam : lepas === stay.hotel_id ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="mr-auto text-body-medium text-on-surface">Remove this hotel{kamar ? " and free the room" : ""}?</span>
                      <Button variant="text" size="sm" disabled={busy} onClick={() => setLepas(null)}>Cancel</Button>
                      <Button variant="tonal" size="sm" loading={busy} onClick={() => hapus(stay.hotel_id)}>Remove</Button>
                    </div>
                  ) : sunting === null ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="text" size="sm" onClick={() => mulai({ jenis: "ubah", hotelId: stay.hotel_id }, hotel, stay)}>Change nights</Button>
                      <Button variant="text" size="sm" icon={<Trash size={16} />} onClick={() => setLepas(stay.hotel_id)}>Remove</Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}

        {sunting?.jenis === "tambah" ? (
          <div className="flex flex-col gap-3 rounded-md border border-outline-variant px-4 py-3">
            <SelectField label="Hotel" value={hotelBaru} onChange={(event) => {
              const hotel = hotelById.get(Number(event.target.value));
              setHotelBaru(event.target.value);
              // Orang tanpa stay: kosong = tanggal hotel. Sudah punya: mulai dari tanggal hotel ini.
              if (!tanpaStay) { const awal = malamHotel(hotel, offset); setMasuk(awal.masuk); setKeluar(awal.keluar); }
            }}>
              <option value="" disabled>Choose a hotel</option>
              {bebas.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </SelectField>
            {formMalam}
          </div>
        ) : sunting === null && bebas.length > 0 ? (
          <Button variant="outlined" size="sm" className="self-start" icon={<Plus size={16} />} onClick={() => mulai({ jenis: "tambah" })}>
            {tanpaStay ? "Add a hotel" : "Add another hotel"}
          </Button>
        ) : null}

        <p className="text-body-small text-on-surface-variant">To choose a room, use Assign to hotel or the Rooms tab.</p>
      </div>
    </Dialog>
  );
}
