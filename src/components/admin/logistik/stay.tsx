"use client";

import { Bed, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Banner, Button, Dialog, SelectField, StatusChip, TextField } from "@/components/m3";
import { bertabrakan, labelTanggal, malamIso, potonganStay, puncakHuni, rentangStay, tanggalStay, tanggalZona, type Stay } from "@/lib/logistik/stay";
import { judulKamar, urutKamar } from "@/lib/logistik/nama-kamar";
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
export function kalimatAkibat({ orang, stayPeserta, hotelId, stayId, malam, hotelById, offset }: {
  orang: LogistikPeserta[];
  stayPeserta: Map<string, Stay[]>;
  hotelId: number;
  /** Stay yang diubah; "baru" = stay tambahan. Tanpa itu: satu-satunya stay orang itu di hotel ini, bila ada. */
  stayId?: number | "baru";
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
    const stays = stayPeserta.get(o.id) ?? [];
    const diHotel = stays.filter((stay) => stay.hotel_id === hotelId);
    const kecuali = stayId === "baru" ? null : stayId ?? (diHotel.length === 1 ? diHotel[0].id : null);
    for (const p of potonganStay(stays, kecuali, malam.check_in_at, malam.check_out_at, hotelById, offset)) {
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

type Sunting = { jenis: "ubah"; stayId: number } | { jenis: "kamar"; stayId: number } | { jenis: "tambah" } | null;

/** Isi kamar per malam, dari stay yang sudah tersimpan. */
export type Hunian = {
  /** Penghuni lain yang berbagi malam dengan `rentang`. */
  sekamar: (roomId: number, rentang: [number, number] | null, kecuali: (stay: Stay) => boolean) => Stay[];
  /** Penghuni terbanyak pada satu waktu dalam `rentang`, tanpa yang dikecualikan. */
  puncak: (roomId: number, rentang: [number, number] | null, kecuali: (stay: Stay) => boolean) => number;
};

/**
 * Penghuni aktif per kamar, per malam (peserta yang dihapus di sumber tidak
 * menempati tempat, sama dengan `lodging_cek_kamar`). Kamar 1208 yang
 * dikosongkan seseorang 6 Nov tampil kosong untuk malam 6-8 Nov.
 */
export function buatHunian(lodging: Stay[], participants: Array<{ id: string }>, hotels: Hotel[]): Hunian {
  const aktif = new Set(participants.map((o) => o.id));
  const hotelById = new Map(hotels.map((h) => [h.id, h]));
  const perKamar = new Map<number, Array<{ stay: Stay; r: [number, number] | null }>>();
  for (const b of lodging) {
    if (b.room_id === null || !aktif.has(b.participant_id)) continue;
    perKamar.set(b.room_id, [...(perKamar.get(b.room_id) ?? []), { stay: b, r: rentangStay(b, undefined, hotelById.get(b.hotel_id)) }]);
  }
  return {
    sekamar: (roomId, rentang, kecuali) => (perKamar.get(roomId) ?? []).filter((x) => !kecuali(x.stay) && bertabrakan(x.r, rentang)).map((x) => x.stay),
    puncak: (roomId, rentang, kecuali) => puncakHuni((perKamar.get(roomId) ?? []).filter((x) => !kecuali(x.stay)).map((x) => x.r), rentang),
  };
}

/**
 * Semua stay satu peserta, dibuka dari kolom Hotel/Room/Check-in/Check-out di
 * Assignments atau dari panel peserta di Daftar peserta: pilih kamar, ubah
 * malam, lepas satu stay, atau tambah stay.
 *
 * Setiap stay disebut dengan id-nya: satu orang boleh dua stay di hotel yang
 * sama (check-out 6 Nov lalu check-in lagi di kamar lain). Kamar dipilih per
 * stay di sini juga, supaya pintu dari Daftar peserta tidak buntu (di sana
 * tidak ada tab Rooms). Pilihan kamar hanya dari hotel stay itu, dan sisa
 * tempatnya dihitung untuk malam stay itu. Kapasitas dan aturan jenis kelamin
 * tetap diperiksa RPC-nya; daftar di sini hanya menandai kamar yang penuh.
 */
export function DialogStays({ orang, stays, hotels, rooms, hunian, offset, busy, kirim, onClose }: {
  orang: LogistikPeserta | null;
  stays: Stay[];
  hotels: Hotel[];
  rooms: Kamar[];
  /** Isi kamar per malam (`buatHunian`). */
  hunian: Hunian;
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
  const [kamarBaru, setKamarBaru] = useState("");

  const hotelById = new Map(hotels.map((h) => [h.id, h]));
  const kamarById = new Map(rooms.map((k) => [k.id, k]));
  const stayById = new Map(stays.map((s) => [s.id, s]));
  // Sama dengan dialog Assign: paling banyak enam stay.
  const bisaTambah = stays.length < 6 && hotels.length > 0;

  function tutup() { setSunting(null); setLepas(null); setHotelBaru(""); setKamarBaru(""); onClose(); }
  function mulai(baru: Sunting, hotel?: Hotel, stay?: Stay) {
    const t = stay ? tanggalStay(stay, hotel) : null;
    const awal = t ? { masuk: t.masuk ? tanggalZona(t.masuk, offset) : "", keluar: t.keluar ? tanggalZona(t.keluar, offset) : "" } : malamHotel(hotel, offset);
    setMasuk(awal.masuk); setKeluar(awal.keluar); setLepas(null);
    setHotelBaru(hotel && baru?.jenis === "tambah" ? String(hotel.id) : "");
    setSunting(baru);
  }

  // Orang tanpa stay: stay pertama boleh tanpa tanggal (ikut tanggal hotel).
  const tanpaStay = stays.length === 0;
  const stayDiubah = sunting?.jenis === "ubah" ? stayById.get(sunting.stayId) : undefined;
  const idTujuan = stayDiubah ? stayDiubah.hotel_id : Number(hotelBaru) || null;
  const malamOpsional = sunting?.jenis === "tambah" && tanpaStay;
  const kosong = !masuk && !keluar;
  const galat = malamOpsional && kosong ? null : galatMalam(masuk, keluar);
  const malam = idTujuan && !galat && !kosong ? malamKeIso(hotelById.get(idTujuan), masuk, keluar, offset) : null;
  const akibat = orang && idTujuan && malam
    ? kalimatAkibat({ orang: [orang], stayPeserta: new Map([[orang.id, stays]]), hotelId: idTujuan, stayId: stayDiubah?.id ?? "baru", malam, hotelById, offset })
    : [];
  // Stay tambahan di hotel stay sebelumnya = pindah kamar: disebut, supaya
  // panitia tahu ini memang dua kartu di portal.
  const sebelumTambah = sunting?.jenis === "tambah" && malam
    ? stays.filter((s) => { const t = tanggalStay(s, hotelById.get(s.hotel_id)); return t.keluar !== null && Date.parse(t.keluar) <= Date.parse(malam.check_in_at); }).at(-1)
    : undefined;
  const pindahKamar = sebelumTambah && idTujuan === sebelumTambah.hotel_id;

  async function simpan() {
    if (!orang || !idTujuan || galat) return;
    const isi = stayDiubah
      ? { hotel_id: idTujuan, participant_ids: [orang.id], ...malam, stay_id: stayDiubah.id }
      : malam ? { hotel_id: idTujuan, participant_ids: [orang.id], ...malam, ...(tanpaStay ? {} : { tambah: true }) }
      : { hotel_id: idTujuan, participant_ids: [orang.id] };
    const hasil = await kirim("/api/admin/logistik/penghuni", "POST", isi);
    if (hasil !== null) setSunting(null);
  }

  // "" = belum dipilih, "menyusul" = lepas kamar (hotel dan malam tetap), angka = id kamar.
  async function simpanKamar(stay: Stay) {
    if (!orang || !kamarBaru) return;
    const hasil = kamarBaru === "menyusul"
      ? stay.room_id !== null ? await kirim("/api/admin/logistik/penghuni", "POST", { release_room_id: stay.room_id, participant_ids: [orang.id] }) : {}
      : await kirim("/api/admin/logistik/penghuni", "POST", { room_id: Number(kamarBaru), participant_ids: [orang.id], stay_id: stay.id });
    if (hasil !== null) { setSunting(null); setKamarBaru(""); }
  }

  async function hapus(stay: Stay) {
    if (!orang) return;
    const hasil = await kirim(`/api/admin/logistik/penghuni?participant_id=${orang.id}&stay_id=${stay.id}`, "DELETE");
    if (hasil !== null) setLepas(null);
  }

  const formMalam = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Check-in" type="date" optional={malamOpsional} value={masuk} max={keluar || undefined} onChange={(event) => setMasuk(event.target.value)} />
        <TextField label="Check-out" type="date" optional={malamOpsional} value={keluar} min={masuk || undefined} error={masuk && keluar && galat ? galat : undefined} onChange={(event) => setKeluar(event.target.value)} />
      </div>
      {malamOpsional ? <p className="text-body-small text-on-surface-variant">Leave both empty to use the hotel&apos;s dates.</p> : null}
      {pindahKamar ? <p className="text-body-small text-on-surface-variant">Room change: they check out of their {hotelById.get(sebelumTambah.hotel_id)?.name ?? "hotel"} stay and check in again on {labelTanggal(masuk)}.</p> : null}
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
      description="Each stay in date order. Add a stay with its nights for someone who moves hotels or changes rooms."
      actions={<Button variant="outlined" disabled={busy} onClick={tutup}>Done</Button>}
    >
      <div className="flex flex-col gap-3">
        {tanpaStay && sunting?.jenis !== "tambah" ? (
          <p className="text-body-medium text-on-surface-variant">No hotel yet.</p>
        ) : null}
        {stays.length > 0 ? (
          <ol className="flex flex-col rounded-md border border-outline-variant" aria-label="Stays">
            {stays.map((stay, i) => {
              const hotel = hotelById.get(stay.hotel_id);
              const kamar = stay.room_id !== null ? kamarById.get(stay.room_id) : undefined;
              const t = tanggalStay(stay, hotel);
              const label = labelMalam(t.masuk, t.keluar, offset);
              const sendiri = stay.check_in_at !== null || stay.check_out_at !== null;
              const gantiKamar = i > 0 && stays[i - 1].hotel_id === stay.hotel_id;
              const diubah = sunting?.jenis === "ubah" && sunting.stayId === stay.id;
              const pilihKamar = sunting?.jenis === "kamar" && sunting.stayId === stay.id;
              const rentang = rentangStay(stay, undefined, hotel);
              const kamarHotel = rooms
                .filter((k) => k.hotel_id === stay.hotel_id)
                .sort(urutKamar);
              return (
                <li key={stay.id} className="flex flex-col gap-2 border-b border-outline-variant px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 truncate text-title-small font-semibold text-on-surface">{hotel?.name ?? "Hotel"}</span>
                    {kamar ? <span className="tabular-nums text-body-medium text-on-surface">{judulKamar(kamar)}</span> : <StatusChip dot tone="warning">Room to follow</StatusChip>}
                    {kamar && kamar.room_number === null ? <StatusChip dot tone="warning">Number to follow</StatusChip> : null}
                  </div>
                  <p className="text-body-medium text-on-surface-variant">
                    {label ? (sendiri ? label : `Hotel dates · ${label}`) : "Hotel dates not set yet"}
                    {gantiKamar ? " · Room change" : ""}
                  </p>
                  {pilihKamar ? (
                    <div className="flex flex-col gap-3">
                      {kamarHotel.length === 0 ? (
                        <p className="text-body-medium text-on-surface-variant">This hotel has no rooms yet. Add them in Logistics, Rooms tab.</p>
                      ) : (
                        <SelectField label="Room" value={kamarBaru} onChange={(event) => setKamarBaru(event.target.value)}>
                          <option value="" disabled>Choose a room</option>
                          {kamar ? <option value="menyusul">Room to follow (keep the hotel)</option> : null}
                          {kamarHotel.map((k) => {
                            // Tempat dihitung untuk malam stay ini saja; stay orang ini sendiri tidak dihitung.
                            const isi = hunian.puncak(k.id, rentang, (s) => s.participant_id === orang?.id);
                            const penuh = isi >= k.capacity && k.id !== stay.room_id;
                            return (
                              <option key={k.id} value={k.id} disabled={penuh || k.id === stay.room_id}>
                                {[judulKamar(k), k.room_type, k.id === stay.room_id ? "current" : penuh ? "full these nights" : `${k.capacity - isi} of ${k.capacity} free`].filter(Boolean).join(" · ")}
                              </option>
                            );
                          })}
                        </SelectField>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button variant="text" size="sm" disabled={busy} onClick={() => { setSunting(null); setKamarBaru(""); }}>Cancel</Button>
                        {kamarHotel.length > 0 ? <Button variant="tonal" size="sm" loading={busy} disabled={!kamarBaru} onClick={() => void simpanKamar(stay)}>Save</Button> : null}
                      </div>
                    </div>
                  ) : diubah ? formMalam : lepas === stay.id ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="mr-auto text-body-medium text-on-surface">Remove this stay{kamar ? " and free the room" : ""}?</span>
                      <Button variant="text" size="sm" disabled={busy} onClick={() => setLepas(null)}>Cancel</Button>
                      <Button variant="tonal" size="sm" loading={busy} onClick={() => hapus(stay)}>Remove</Button>
                    </div>
                  ) : sunting === null ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="text" size="sm" onClick={() => { setLepas(null); setKamarBaru(""); setSunting({ jenis: "kamar", stayId: stay.id }); }}>{kamar ? "Change room" : "Choose room"}</Button>
                      <Button variant="text" size="sm" onClick={() => mulai({ jenis: "ubah", stayId: stay.id }, hotel, stay)}>Change nights</Button>
                      <Button variant="text" size="sm" icon={<Trash size={16} />} onClick={() => setLepas(stay.id)}>Remove</Button>
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
              // Orang tanpa stay: kosong = tanggal hotel. Sudah punya: mulai pada
              // hari check-out stay terakhirnya, sampai check-out hotel ini.
              if (!tanpaStay) {
                const awal = malamHotel(hotel, offset);
                const akhir = stays.at(-1);
                const t = akhir ? tanggalStay(akhir, hotelById.get(akhir.hotel_id)) : null;
                const mulaiDari = t?.keluar ? tanggalZona(t.keluar, offset) : awal.masuk;
                setMasuk(mulaiDari); setKeluar(awal.keluar > mulaiDari ? awal.keluar : "");
              }
            }}>
              <option value="" disabled>Choose a hotel</option>
              {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </SelectField>
            {formMalam}
          </div>
        ) : sunting === null && bisaTambah ? (
          <Button variant="outlined" size="sm" className="self-start" icon={<Plus size={16} />} onClick={() => mulai({ jenis: "tambah" })}>
            {tanpaStay ? "Add a hotel" : "Add another stay"}
          </Button>
        ) : null}

      </div>
    </Dialog>
  );
}
