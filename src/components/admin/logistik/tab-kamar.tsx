"use client";

import { Bed, Buildings, MagnifyingGlass, SignOut, Warning } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  Banner, Button, ChipMenu, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, Pane, PaneBody, PaneFooter,
  PaneHeader, SelectField, StatusChip, StatusDot, Switch, TextArea, TextField, EMPTY_VALUE,
} from "@/components/m3";
import { bertabrakan, labelRentang, puncakHuni, rentangStay, tanggalStay, type Stay } from "@/lib/logistik/stay";
import { judulKamar, urutKamar } from "@/lib/logistik/nama-kamar";
import { kunciGender, type Hotel, type Kamar, type LogistikData, type LogistikPeserta } from "@/lib/logistik/types";
import { timeZoneOffset } from "@/lib/timezone";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import {
  angkaAtauNull, BarisKelompok, BarisOrang, dariInputWaktu, formatWaktu, keInputWaktu, KepalaDetail, KepalaKolom, KolomCari, PilihPeserta, type TabProps,
} from "./bersama";

/**
 * Tab Kamar: siapa tidur di mana, dan kamar mana yang perlu dibereskan.
 *
 * Keputusan yang diambil di layar ini: memasukkan orang ke kamar dan
 * menemukan kamar yang bermasalah. Karena itu masalah (melebihi kapasitas,
 * penghuni berbeda jenis kelamin) tampil sebagai chip di barisnya dan bisa
 * disaring, sedangkan kamar yang wajar hanya menampilkan isinya.
 *
 * Kedua masalah itu tidak bisa dibuat lewat layar ini (`assign_room`
 * menolaknya), tetapi bisa muncul dari arah lain: peserta yang dihapus di
 * sumber lalu dipulihkan, kapasitas yang diturunkan, atau jawaban jenis
 * kelamin yang diubah setelah penempatan.
 *
 * Tamu hotel yang belum punya kamar (nomor kamar menyusul) tampil sebagai satu
 * baris "Room to follow" di bawah nama hotelnya. Mengeluarkan orang dari kamar
 * mengembalikannya ke baris itu, bukan melepas hotelnya: kartu Kamar, Rute,
 * dan Agenda per hotel di portal peserta tetap benar selama kamar diatur ulang.
 */

/** `tunggu`: baris "Room to follow" hotel itu (tamu tanpa kamar). */
type Pilihan = { jenis: "kamar"; id: number } | { jenis: "hotel"; id: number } | { jenis: "tunggu"; id: number } | null;
type Keadaan = "kosong" | "ada-tempat" | "penuh" | "perlu-dicek";
type DialogKamar = { mode: "baru"; hotelId?: number } | { mode: "ubah"; kamar: Kamar } | null;
type DialogHotel = { mode: "baru" } | { mode: "ubah"; hotel: Hotel } | null;

/** Orang, bukan stay: yang pindah kamar menunggu dua kamar di hotel yang sama. */
const jumlahOrang = (daftar: Array<{ orang: LogistikPeserta }>) => new Set(daftar.map((x) => x.orang.id)).size;

export function TabKamar({ data, kirim, busy, baru, tutupBaru, hotelBaru, tutupHotelBaru }: TabProps & { hotelBaru: boolean; tutupHotelBaru: () => void }) {
  const { zone, abbr } = useEventTimeZone();
  const offset = timeZoneOffset(zone);
  const [pilihan, setPilihan] = useState<Pilihan>(null);
  const [cari, setCari] = useState("");
  const [saringHotel, setSaringHotel] = useState<string[]>([]);
  const [saringKeadaan, setSaringKeadaan] = useState<string[]>([]);
  const [dialogKamar, setDialogKamar] = useState<DialogKamar>(null);
  const [dialogHotel, setDialogHotel] = useState<DialogHotel>(null);
  const [aturan, setAturan] = useState(false);
  const [tambahPenghuni, setTambahPenghuni] = useState(false);
  const [hapus, setHapus] = useState<{ jenis: "kamar"; kamar: Kamar } | { jenis: "hotel"; hotel: Hotel } | null>(null);

  const kunciField = data.settings.gender_field_key;
  const wajibSama = data.settings.enforce_same_gender;
  const namaField = data.fields.find((field) => field.key === kunciField)?.label ?? kunciField;

  // ---- Turunan -------------------------------------------------------------
  const orangById = useMemo(() => new Map(data.participants.map((orang) => [orang.id, orang])), [data.participants]);
  // Penghuni per kamar, dengan stay-nya: orang yang pindah kamar di hotel yang
  // sama menempati 1208 malam 5-6 dan 1410 malam 6-8, jadi isi kamar dihitung
  // per malam, bukan jumlah semua orang yang pernah tidur di sana.
  const penghuniKamar = useMemo(() => {
    const peta = new Map<number, Array<{ orang: LogistikPeserta; stay: Stay; r: [number, number] | null }>>();
    const hotelPeta = new Map(data.hotels.map((hotel) => [hotel.id, hotel]));
    for (const baris of data.lodging) {
      const orang = orangById.get(baris.participant_id);
      // Peserta yang dihapus di sumber tidak ada di daftar dan tidak dihitung,
      // sama seperti `assign_room` tidak menghitungnya.
      if (!orang || baris.room_id === null) continue;
      peta.set(baris.room_id, [...(peta.get(baris.room_id) ?? []), { orang, stay: baris, r: rentangStay(baris, undefined, hotelPeta.get(baris.hotel_id)) }]);
    }
    return peta;
  }, [data.lodging, data.hotels, orangById]);
  const menungguHotel = useMemo(() => {
    const peta = new Map<number, Array<{ orang: LogistikPeserta; stay: Stay }>>();
    for (const baris of data.lodging) {
      const orang = orangById.get(baris.participant_id);
      if (!orang || baris.room_id !== null) continue;
      peta.set(baris.hotel_id, [...(peta.get(baris.hotel_id) ?? []), { orang, stay: baris }]);
    }
    for (const isi of peta.values()) isi.sort((a, b) => a.orang.name.localeCompare(b.orang.name, "id"));
    return peta;
  }, [data.lodging, orangById]);
  // Semua stay per peserta: orang yang pindah hotel punya lebih dari satu.
  const stayPeserta = useMemo(() => {
    const peta = new Map<string, LogistikData["lodging"]>();
    for (const baris of data.lodging) peta.set(baris.participant_id, [...(peta.get(baris.participant_id) ?? []), baris]);
    return peta;
  }, [data.lodging]);
  const kamarById = useMemo(() => new Map(data.rooms.map((kamar) => [kamar.id, kamar])), [data.rooms]);
  const hotelById = useMemo(() => new Map(data.hotels.map((hotel) => [hotel.id, hotel])), [data.hotels]);

  /**
   * Isi kamar: `isi` semua penghuninya (urut malam), `puncak` penghuni
   * terbanyak pada satu malam. Melebihi kapasitas dan jenis kelamin campuran
   * hanya dihitung di antara yang berbagi malam, sama dengan `lodging_cek_kamar`.
   */
  function masalah(kamar: Kamar) {
    const semua = [...(penghuniKamar.get(kamar.id) ?? [])].sort((a, b) => (a.r?.[0] ?? 0) - (b.r?.[0] ?? 0) || a.orang.name.localeCompare(b.orang.name, "id"));
    const isi = semua.map((x) => x.orang);
    const puncak = Math.max(0, ...semua.map((x) => 1 + puncakHuni(semua.filter((y) => y !== x).map((y) => y.r), x.r)));
    const lebih = puncak > kamar.capacity;
    const campuran = Boolean(kunciField) && semua.some((a) => semua.some((b) => {
      const ga = kunciGender(a.orang.gender);
      const gb = kunciGender(b.orang.gender);
      return Boolean(ga && gb && ga !== gb) && bertabrakan(a.r, b.r);
    }));
    // Malam berbeda-beda: nama penghuni disebut dengan malamnya.
    const bergantian = semua.length > 1 && puncak < semua.length;
    return { isi, semua, puncak, lebih, campuran, bergantian };
  }

  function keadaan(kamar: Kamar): Keadaan {
    const { isi, puncak, lebih, campuran } = masalah(kamar);
    if (lebih || campuran) return "perlu-dicek";
    if (isi.length === 0) return "kosong";
    return puncak >= kamar.capacity ? "penuh" : "ada-tempat";
  }

  const kata = cari.trim().toLowerCase();
  const kamarTampil = data.rooms.filter((kamar) => {
    if (saringHotel.length > 0 && !saringHotel.includes(String(kamar.hotel_id))) return false;
    if (saringKeadaan.length > 0 && !saringKeadaan.includes(keadaan(kamar))) return false;
    if (!kata) return true;
    return [kamar.room_number, kamar.label].some((teks) => teks?.toLowerCase().includes(kata)) ||
      (penghuniKamar.get(kamar.id) ?? []).some(({ orang }) => orang.name.toLowerCase().includes(kata));
  });
  // Kolom Label dan Bed hanya ada bila salah satu kamar mengisinya: acara lama tidak berubah.
  const adaLabel = data.rooms.some((kamar) => kamar.label);
  const adaKasur = data.rooms.some((kamar) => kamar.bed_type);
  // Dengan Label dan Bed, daftar kamar terlalu sempit untuk semua kolom: Bed
  // dan Type hanya di layar lebar, selalu ada di panel detail kamar.
  const sempit = adaLabel || adaKasur ? "w-28 max-2xl:hidden" : "w-28 max-sm:hidden";
  const perluDicek = data.rooms.filter((kamar) => keadaan(kamar) === "perlu-dicek").length;
  const menyaring = Boolean(kata) || saringHotel.length > 0 || saringKeadaan.length > 0;

  // ---- Tulis ---------------------------------------------------------------
  /** Keluar dari kamar, tetap tamu hotelnya dengan malam yang sama (kembali ke "Room to follow"). */
  async function keluarkan(orang: LogistikPeserta, roomId: number) {
    await kirim("/api/admin/logistik/penghuni", "POST", { release_room_id: roomId, participant_ids: [orang.id] });
  }

  /** Lepas stay ini saja. Stay lain (pindah hotel atau kamar) tetap. */
  async function lepasStay(orang: LogistikPeserta, stay: Stay) {
    await kirim(`/api/admin/logistik/penghuni?participant_id=${orang.id}&stay_id=${stay.id}`, "DELETE");
  }

  async function hapusSekarang() {
    if (!hapus) return;
    const hasil = hapus.jenis === "kamar"
      ? await kirim(`/api/admin/logistik/data/kamar?id=${hapus.kamar.id}`, "DELETE")
      : await kirim(`/api/admin/logistik/data/hotel?id=${hapus.hotel.id}`, "DELETE");
    setHapus(null);
    if (hasil) setPilihan(null);
  }

  // ---- Daftar --------------------------------------------------------------
  const aturanTerpasang = !wajibSama || Boolean(kunciField);
  // Aturan kamar duduk di ujung bilah saringan, bukan pita sendiri: ia dibaca
  // sekali saat menyiapkan acara, lalu hanya perlu terlihat, bukan menonjol.
  const tombolAturan = (
    <Button variant="text" size="sm" className="ml-auto" icon={<StatusDot tone={aturanTerpasang ? "success" : "warning"} />} onClick={() => setAturan(true)}>
      {!wajibSama ? "Rule: mixed rooms allowed" : kunciField ? `Rule: same ${namaField}` : "Room rules incomplete"}
    </Button>
  );

  const saringan = (
    <PaneHeader className="flex-wrap gap-2 px-3 py-2.5">
      {data.rooms.length > 0 ? (
        <>
          <KolomCari className="max-w-80" label="Search rooms or occupants" placeholder="Search room number or occupant name" value={cari} onChange={setCari} />
          {data.hotels.length > 1 ? (
            <ChipMenu
              label="Hotel"
              multiple
              options={data.hotels.map((hotel) => ({ value: String(hotel.id), label: hotel.name, count: data.rooms.filter((kamar) => kamar.hotel_id === hotel.id).length }))}
              selected={saringHotel}
              onChange={setSaringHotel}
            />
          ) : null}
          <ChipMenu
            label="Status"
            multiple
            options={[
              { value: "kosong", label: "Empty" },
              { value: "ada-tempat", label: "Space left" },
              { value: "penuh", label: "Full" },
              { value: "perlu-dicek", label: "Needs checking", count: perluDicek },
            ]}
            selected={saringKeadaan}
            onChange={setSaringKeadaan}
          />
        </>
      ) : null}
      {tombolAturan}
    </PaneHeader>
  );

  const daftar = (
    <Pane aria-label="Rooms">
      {saringan}
      <PaneBody>
        {data.hotels.length === 0 ? (
          <EmptyState
            plain
            icon={<Buildings size={40} />}
            title="No hotels yet"
            description="Every room belongs to a hotel. Start with Add hotel at the top right, then add its rooms."
          />
        ) : (
          <>
            <KepalaKolom kolom={[
              ...(adaLabel ? [["Label", "w-24"] as [string, string]] : []),
              ["Room", "w-24"],
              ["Occupants", "min-w-0 flex-1"],
              ...(adaKasur ? [["Bed", "w-20 max-2xl:hidden"] as [string, string]] : []),
              ["Type", sempit],
              ["Filled", "w-16 text-right"],
            ]} />
            {menyaring && kamarTampil.length === 0 ? (
              <EmptyState
                plain
                icon={<MagnifyingGlass size={40} />}
                title="No matching rooms"
                description="Change your search or clear the filters to see every room."
                action={<Button variant="outlined" onClick={() => { setCari(""); setSaringHotel([]); setSaringKeadaan([]); }}>Clear filters</Button>}
              />
            ) : data.hotels.filter((hotel) => saringHotel.length === 0 || saringHotel.includes(String(hotel.id))).map((hotel) => {
              const kamarHotel = kamarTampil.filter((kamar) => kamar.hotel_id === hotel.id).sort(urutKamar);
              const menunggu = menungguHotel.get(hotel.id) ?? [];
              // Baris "Room to follow" ikut saringan: Status tidak berlaku
              // untuknya (itu keadaan kamar), cari mencocokkan nama tamu.
              const tampilTunggu = menunggu.length > 0 && saringKeadaan.length === 0 &&
                (!kata || menunggu.some(({ orang }) => orang.name.toLowerCase().includes(kata)));
              if (menyaring && kamarHotel.length === 0 && !tampilTunggu) return null;
              const tungguDipilih = pilihan?.jenis === "tunggu" && pilihan.id === hotel.id;
              const semuaKamar = data.rooms.filter((kamar) => kamar.hotel_id === hotel.id);
              const terisi = semuaKamar.reduce((jumlah, kamar) => jumlah + masalah(kamar).puncak, 0);
              const tempat = semuaKamar.reduce((jumlah, kamar) => jumlah + kamar.capacity, 0);
              return (
                <div key={hotel.id}>
                  <BarisKelompok
                    label={`Hotel ${hotel.name}`}
                    selected={pilihan?.jenis === "hotel" && pilihan.id === hotel.id}
                    onSelect={() => setPilihan({ jenis: "hotel", id: hotel.id })}
                  >
                    <Buildings size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-on-surface">{hotel.name}</span>
                    {menunggu.length > 0 ? <StatusChip dot tone="warning">{jumlahOrang(menunggu).toLocaleString("en-GB")} waiting for a room</StatusChip> : null}
                    <span className="shrink-0 tabular-nums text-on-surface-variant">{plural(semuaKamar.length, "room")} · {terisi}/{tempat} places</span>
                  </BarisKelompok>
                  {tampilTunggu ? (
                    <button
                      type="button"
                      aria-pressed={tungguDipilih}
                      onClick={() => setPilihan({ jenis: "tunggu", id: hotel.id })}
                      className={cx(
                        "flex w-full items-center gap-3 border-b border-outline-variant px-4 py-2 text-left text-body-medium",
                        tungguDipilih ? "bg-accent-soft" : "hover:bg-panel-high",
                      )}
                    >
                      {adaLabel ? <span className="w-24 shrink-0" /> : null}
                      <span className="w-24 shrink-0 truncate text-on-surface">To follow</span>
                      <span className="min-w-0 flex-1 truncate text-on-surface-variant">{[...new Set(menunggu.map(({ orang }) => orang.name))].join(", ")}</span>
                      {adaKasur ? <span className="w-20 shrink-0 max-2xl:hidden" /> : null}
                      <span className={cx("shrink-0", sempit)} />
                      <span className="w-16 shrink-0 text-right tabular-nums text-on-surface">{jumlahOrang(menunggu).toLocaleString("en-GB")}</span>
                    </button>
                  ) : null}
                  {semuaKamar.length === 0 && !menyaring ? (
                    <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant px-4 py-3 text-body-medium text-on-surface-variant">
                      <span className="min-w-0 flex-1">No rooms in this hotel yet.</span>
                      <Button variant="outlined" size="sm" onClick={() => setDialogKamar({ mode: "baru", hotelId: hotel.id })}>Add room</Button>
                    </div>
                  ) : kamarHotel.map((kamar) => {
                    const { isi, puncak, lebih, campuran } = masalah(kamar);
                    const dipilih = pilihan?.jenis === "kamar" && pilihan.id === kamar.id;
                    return (
                      <button
                        key={kamar.id}
                        type="button"
                        aria-pressed={dipilih}
                        onClick={() => setPilihan({ jenis: "kamar", id: kamar.id })}
                        className={cx(
                          "flex w-full items-center gap-3 border-b border-outline-variant px-4 py-2 text-left text-body-medium",
                          dipilih ? "bg-accent-soft" : "hover:bg-panel-high",
                        )}
                      >
                        {adaLabel ? <span className="w-24 shrink-0 truncate text-on-surface">{kamar.label ?? EMPTY_VALUE}</span> : null}
                        <span className="w-24 shrink-0 truncate tabular-nums text-on-surface">
                          {kamar.room_number ?? <StatusChip dot tone="warning">To follow</StatusChip>}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          {lebih ? <StatusChip dot tone="error">Over capacity</StatusChip> : null}
                          {campuran ? <StatusChip dot tone="warning">Mixed gender</StatusChip> : null}
                          <span className="min-w-0 truncate text-on-surface-variant">
                            {isi.length > 0 ? isi.map((orang) => orang.name).join(", ") : "Empty"}
                          </span>
                        </span>
                        {adaKasur ? <span className="w-20 shrink-0 truncate text-on-surface-variant max-2xl:hidden">{kamar.bed_type ?? EMPTY_VALUE}</span> : null}
                        <span className={cx("shrink-0 truncate text-on-surface-variant", sempit)}>{kamar.room_type ?? EMPTY_VALUE}</span>
                        <span className={cx("w-16 shrink-0 text-right tabular-nums", lebih ? "text-error" : "text-on-surface")}>
                          {puncak}/{kamar.capacity}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </PaneBody>
    </Pane>
  );

  // ---- Detail --------------------------------------------------------------
  let detail = null;
  const kamarDipilih = pilihan?.jenis === "kamar" ? kamarById.get(pilihan.id) ?? null : null;
  const hotelDipilih = pilihan?.jenis === "hotel" ? hotelById.get(pilihan.id) ?? null : null;
  const tungguDipilih = pilihan?.jenis === "tunggu" ? hotelById.get(pilihan.id) ?? null : null;

  if (kamarDipilih) {
    const { semua, puncak, lebih, campuran, bergantian } = masalah(kamarDipilih);
    const hotel = hotelById.get(kamarDipilih.hotel_id);
    const sisa = kamarDipilih.capacity - puncak;
    // Kamar dari rooming list (label, kasur, atau nomor menyusul): satu fakta
    // per baris di "Room details", bukan digabung di bawah judul.
    const rinci = kamarDipilih.label !== null || kamarDipilih.bed_type !== null || kamarDipilih.room_number === null;
    detail = (
      <Pane as="aside" aria-label={`${judulKamar(kamarDipilih)} details`}>
        <KepalaDetail
          nama={judulKamar(kamarDipilih)}
          chip={lebih ? { tone: "error", teks: "Over capacity" } : campuran ? { tone: "warning", teks: "Mixed gender" } : null}
          sub={rinci ? hotel?.name : [hotel?.name, kamarDipilih.room_type, kamarDipilih.floor ? `Floor ${kamarDipilih.floor}` : null].filter(Boolean).join(" · ")}
          angka={`${puncak}/${kamarDipilih.capacity}`}
          keterangan={bergantian ? "places filled on the busiest night" : "places filled"}
          onClose={() => setPilihan(null)}
        />
        <PaneBody>
          {lebih || campuran ? (
            <div className="px-5 pt-4">
              <Banner tone={lebih ? "error" : "warning"} icon={<Warning size={18} />}>
                {lebih
                  ? `This room has ${plural(puncak - kamarDipilih.capacity, "person", "people")} more than its capacity on some nights. Remove someone or raise the capacity.`
                  : "The occupants have different genders, usually because an answer changed after they were assigned. Move one of them."}
              </Banner>
            </div>
          ) : null}
          {rinci ? (
            <DetailSection title="Room details">
              <dl className="flex flex-col gap-2">
                <KeyValue label="Room number">{kamarDipilih.room_number ?? <StatusChip dot tone="warning">To follow</StatusChip>}</KeyValue>
                <KeyValue label="Label">{kamarDipilih.label ?? EMPTY_VALUE}</KeyValue>
                <KeyValue label="Bed">{kamarDipilih.bed_type ?? EMPTY_VALUE}</KeyValue>
                <KeyValue label="Room type">{kamarDipilih.room_type ?? EMPTY_VALUE}</KeyValue>
                <KeyValue label="Floor">{kamarDipilih.floor ?? EMPTY_VALUE}</KeyValue>
              </dl>
              {kamarDipilih.room_number === null ? (
                <p className="text-body-small text-on-surface-variant">Occupants see that their room number is still to follow, and who they share with. The label is never shown to them.</p>
              ) : null}
            </DetailSection>
          ) : null}
          <DetailSection title="Occupants">
            {semua.length === 0 ? (
              <p className="text-body-medium text-on-surface-variant">No occupants yet. Add them with the button below.</p>
            ) : (
              <ul className="flex flex-col">
                {semua.map(({ orang, stay }) => (
                  <BarisOrang
                    key={stay.id}
                    orang={orang}
                    keterangan={[
                      kunciField ? orang.gender ?? "No gender" : null,
                      bergantian || stay.check_in_at !== null ? labelRentang(tanggalStay(stay, hotel).masuk, tanggalStay(stay, hotel).keluar, offset) : null,
                    ].filter(Boolean).join(" · ") || null}
                    aksi={
                      <IconButton simpan size="sm" label={`Take ${orang.name} out of the room (stays at the hotel, room to follow)`} disabled={busy} onClick={() => void keluarkan(orang, kamarDipilih.id)}>
                        <SignOut size={16} />
                      </IconButton>
                    }
                  />
                ))}
              </ul>
            )}
          </DetailSection>
          {kamarDipilih.notes ? (
            <DetailSection title="Staff notes">
              <p className="whitespace-pre-line text-body-medium text-on-surface">{kamarDipilih.notes}</p>
              <p className="text-body-small text-on-surface-variant">Never shown to participants.</p>
            </DetailSection>
          ) : null}
        </PaneBody>
        <PaneFooter note={sisa > 0 ? `${plural(sisa, "place")} left${bergantian ? " on the busiest night" : ""}` : "Room full"}>
          {semua.length === 0 ? (
            <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus({ jenis: "kamar", kamar: kamarDipilih })}>Delete</Button>
          ) : null}
          <Button variant="outlined" size="sm" onClick={() => setDialogKamar({ mode: "ubah", kamar: kamarDipilih })}>Edit</Button>
          <Button simpan size="sm" disabled={busy || sisa <= 0} onClick={() => setTambahPenghuni(true)}>Add occupants</Button>
        </PaneFooter>
      </Pane>
    );
  } else if (tungguDipilih) {
    const menunggu = menungguHotel.get(tungguDipilih.id) ?? [];
    detail = (
      <Pane as="aside" aria-label={`${tungguDipilih.name}, waiting for a room`}>
        <KepalaDetail
          nama="Room to follow"
          sub={tungguDipilih.name}
          angka={jumlahOrang(menunggu).toLocaleString("en-GB")}
          keterangan={jumlahOrang(menunggu) === 1 ? "guest" : "guests"}
          onClose={() => setPilihan(null)}
        />
        <PaneBody>
          <DetailSection title="Guests">
            <p className="text-body-small text-on-surface-variant">
              They already see this hotel in their participant area, with &ldquo;Nomor kamar menyusul&rdquo;. Give them a room from the room itself (Add occupants), or import the hotel&apos;s rooming list.
            </p>
            {menunggu.length === 0 ? (
              <p className="text-body-medium text-on-surface-variant">Everyone at this hotel has a room.</p>
            ) : (
              <ul className="flex flex-col">
                {menunggu.map(({ orang, stay }) => (
                  <BarisOrang
                    key={stay.id}
                    orang={orang}
                    keterangan={[
                      kunciField ? orang.gender ?? "No gender" : null,
                      stay.check_in_at !== null ? labelRentang(tanggalStay(stay, tungguDipilih).masuk, tanggalStay(stay, tungguDipilih).keluar, offset) : null,
                    ].filter(Boolean).join(" · ") || null}
                    aksi={
                      <IconButton simpan size="sm" label={`Remove ${orang.name} from ${tungguDipilih.name}`} disabled={busy} onClick={() => void lepasStay(orang, stay)}>
                        <SignOut size={16} />
                      </IconButton>
                    }
                  />
                ))}
              </ul>
            )}
          </DetailSection>
        </PaneBody>
      </Pane>
    );
  } else if (hotelDipilih) {
    const semuaKamar = data.rooms.filter((kamar) => kamar.hotel_id === hotelDipilih.id);
    const menunggu = jumlahOrang(menungguHotel.get(hotelDipilih.id) ?? []);
    const terisi = semuaKamar.reduce((jumlah, kamar) => jumlah + masalah(kamar).puncak, 0);
    const tempat = semuaKamar.reduce((jumlah, kamar) => jumlah + kamar.capacity, 0);
    detail = (
      <Pane as="aside" aria-label={`Hotel ${hotelDipilih.name} details`}>
        <KepalaDetail
          nama={hotelDipilih.name}
          sub={[plural(semuaKamar.length, "room"), menunggu > 0 ? `${menunggu.toLocaleString("en-GB")} waiting for a room` : null].filter(Boolean).join(" · ")}
          angka={`${terisi}/${tempat}`}
          keterangan="places filled"
          onClose={() => setPilihan(null)}
        />
        <PaneBody>
          <DetailSection title="What participants see">
            <dl className="flex flex-col gap-2">
              <KeyValue label="Address">{hotelDipilih.address ?? EMPTY_VALUE}</KeyValue>
              <KeyValue label="Map">
                {hotelDipilih.map_url ? <a href={hotelDipilih.map_url} target="_blank" rel="noreferrer" className="text-primary underline">Open map</a> : EMPTY_VALUE}
              </KeyValue>
              <KeyValue label="Hotel check-in">{hotelDipilih.check_in_at ? `${formatWaktu(hotelDipilih.check_in_at, zone)} ${abbr}` : EMPTY_VALUE}</KeyValue>
              <KeyValue label="Hotel check-out">{hotelDipilih.check_out_at ? `${formatWaktu(hotelDipilih.check_out_at, zone)} ${abbr}` : EMPTY_VALUE}</KeyValue>
            </dl>
            <p className="text-body-small text-on-surface-variant">These times apply to every room in this hotel.</p>
          </DetailSection>
        </PaneBody>
        <PaneFooter note={terisi + menunggu > 0 ? "A hotel with guests cannot be deleted." : undefined}>
          {terisi + menunggu === 0 ? (
            <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus({ jenis: "hotel", hotel: hotelDipilih })}>Delete</Button>
          ) : null}
          <Button variant="outlined" size="sm" onClick={() => setDialogHotel({ mode: "ubah", hotel: hotelDipilih })}>Edit</Button>
          <Button simpan size="sm" onClick={() => setDialogKamar({ mode: "baru", hotelId: hotelDipilih.id })}>Add room</Button>
        </PaneFooter>
      </Pane>
    );
  }

  // ---- Dialog tambah penghuni ------------------------------------------------
  const isiDipilih = kamarDipilih ? masalah(kamarDipilih) : null;
  const penghuniSekarang = isiDipilih?.isi ?? [];
  const genderKamar = kunciGender(penghuniSekarang.find((orang) => orang.gender)?.gender);

  return (
    <>
      <ListDetail list={daftar} detail={detail} />

      {kamarDipilih ? (
        <PilihPeserta
          open={tambahPenghuni}
          onClose={() => setTambahPenghuni(false)}
          title={`Add occupants to ${judulKamar(kamarDipilih, "room")}`}
          description={wajibSama && kunciField
            ? `Only participants of the same gender can be chosen${genderKamar ? "" : "; an empty room follows the first person chosen"}.`
            : undefined}
          peserta={data.participants}
          utama={(orang) => {
            const stays = stayPeserta.get(orang.id) ?? [];
            const diSini = stays.find((s) => s.hotel_id === kamarDipilih.hotel_id);
            return diSini ? diSini.room_id === null : stays.every((s) => s.room_id === null);
          }}
          labelUtama="Participants without a room."
          keterangan={(orang) => {
            // Stay di hotel kamar ini diisi kamarnya; tanpa stay di sini, semua
            // stay orang itu diganti (assign_room), jadi hotel lamanya disebut.
            const stays = stayPeserta.get(orang.id) ?? [];
            const diSini = stays.find((s) => s.hotel_id === kamarDipilih.hotel_id);
            const lama = diSini?.room_id != null ? kamarById.get(diSini.room_id) : undefined;
            const status = diSini
              ? lama ? `Now in ${judulKamar(lama, "room")}` : "Waiting for a room here"
              : stays.length > 0 ? `Moves from ${stays.map((s) => hotelById.get(s.hotel_id)?.name ?? "another hotel").join(", ")}` : null;
            return [kunciField ? orang.gender ?? "No gender" : null, status].filter(Boolean).join(" · ") || null;
          }}
          alasanTolak={(orang) => {
            if ((stayPeserta.get(orang.id) ?? []).some((s) => s.room_id === kamarDipilih.id)) return "Already in this room";
            if (!wajibSama || !kunciField) return null;
            if (!orang.gender) return "Gender not filled in";
            if (genderKamar && kunciGender(orang.gender) !== genderKamar) return "Different gender";
            return null;
          }}
          batas={Math.max(kamarDipilih.capacity - (isiDipilih?.puncak ?? 0), 0)}
          tombol="Add to room"
          busy={busy}
          onSubmit={async (ids) => Boolean(await kirim("/api/admin/logistik/penghuni", "POST", { room_id: kamarDipilih.id, participant_ids: ids }))}
        />
      ) : null}

      <DialogAturan
        open={aturan}
        onClose={() => setAturan(false)}
        busy={busy}
        data={data}
        simpan={async (nilai) => Boolean(await kirim("/api/admin/logistik/pengaturan", "PATCH", nilai))}
      />

      <FormKamar
        state={baru ? { mode: "baru", hotelId: pilihan?.jenis === "hotel" ? pilihan.id : kamarDipilih?.hotel_id } : dialogKamar}
        hotels={data.hotels}
        busy={busy}
        onClose={() => { setDialogKamar(null); tutupBaru(); }}
        simpan={async (nilai, id) => {
          const hasil = await kirim("/api/admin/logistik/data/kamar", id ? "PATCH" : "POST", id ? { id, ...nilai } : nilai);
          if (hasil && !id) setPilihan({ jenis: "kamar", id: (hasil as Kamar).id });
          return Boolean(hasil);
        }}
      />

      <FormHotel
        state={hotelBaru ? { mode: "baru" } : dialogHotel}
        busy={busy}
        zone={zone}
        onClose={() => { setDialogHotel(null); tutupHotelBaru(); }}
        simpan={async (nilai, id) => {
          const hasil = await kirim("/api/admin/logistik/data/hotel", id ? "PATCH" : "POST", id ? { id, ...nilai } : nilai);
          if (hasil && !id) setPilihan({ jenis: "hotel", id: (hasil as Hotel).id });
          return Boolean(hasil);
        }}
      />

      <Dialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        dismissible={!busy}
        tone="danger"
        title={hapus?.jenis === "kamar" ? `Delete ${judulKamar(hapus.kamar, "room")}?` : `Delete hotel ${hapus?.jenis === "hotel" ? hapus.hotel.name : ""}?`}
        description={hapus?.jenis === "hotel"
          ? "Every empty room in this hotel is deleted too. This cannot be undone."
          : "This room is empty, so no assignments are lost. This cannot be undone."}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Cancel</Button>
            <Button simpan variant="danger" loading={busy} onClick={() => void hapusSekarang()}>Delete</Button>
          </>
        }
      />
    </>
  );
}

/* ------------------------------------------------------------ Dialog */

function DialogAturan({ open, onClose, busy, data, simpan }: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  data: TabProps["data"];
  simpan: (nilai: { gender_field_key: string | null; enforce_same_gender: boolean }) => Promise<boolean>;
}) {
  // Draf dibaca dari data setiap kali dialog dibuka, bukan sekali saat mount.
  const [draf, setDraf] = useState<{ key: string; wajib: boolean } | null>(null);
  const nilai = draf ?? { key: data.settings.gender_field_key ?? "", wajib: data.settings.enforce_same_gender };
  function tutup() { setDraf(null); onClose(); }

  const field = data.fields.find((f) => f.key === nilai.key);
  return (
    <Dialog
      open={open}
      onClose={tutup}
      dismissible={!busy}
      title="Room rules"
      description="Gender is read from each participant's form answer or import column. The rule is checked every time someone is added to a room."
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan loading={busy} onClick={async () => { if (await simpan({ gender_field_key: nilai.key || null, enforce_same_gender: nilai.wajib })) tutup(); }}>Save rules</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SelectField
          label="Gender field"
          value={nilai.key}
          onChange={(event) => setDraf({ ...nilai, key: event.target.value })}
          hint={data.fields.length === 0
            ? "Participant data has no fields yet. Add a Gender field in Registration, or import participants with that column."
            : field ? `${field.filled.toLocaleString("en-GB")} of ${plural(data.participants.length, "participant")} have an answer.` : undefined}
        >
          <option value="">Not chosen</option>
          {data.fields.map((f) => (
            <option key={f.key} value={f.key}>{f.label}{f.source === "data" ? " (from import)" : ""}</option>
          ))}
        </SelectField>
        <Switch
          checked={nilai.wajib}
          onChange={(wajib) => setDraf({ ...nilai, wajib })}
          label="Same-gender rooms only"
          description="Rejects assignments that would make a room mixed, and participants with no gender answer."
        />
      </div>
    </Dialog>
  );
}

type NilaiKamar = { hotel_id: number; room_number: string | null; label: string | null; bed_type: string | null; room_type: string | null; capacity: number; floor: string | null; notes: string | null };

function FormKamar({ state, hotels, busy, onClose, simpan }: {
  state: DialogKamar;
  hotels: Hotel[];
  busy: boolean;
  onClose: () => void;
  simpan: (nilai: NilaiKamar, id?: number) => Promise<boolean>;
}) {
  const awal = state?.mode === "ubah"
    ? {
      hotel_id: String(state.kamar.hotel_id), room_number: state.kamar.room_number ?? "", label: state.kamar.label ?? "",
      bed_type: state.kamar.bed_type ?? "", room_type: state.kamar.room_type ?? "",
      capacity: String(state.kamar.capacity), floor: state.kamar.floor ?? "", notes: state.kamar.notes ?? "",
    }
    : { hotel_id: String(state?.hotelId ?? hotels[0]?.id ?? ""), room_number: "", label: "", bed_type: "", room_type: "", capacity: "2", floor: "", notes: "" };
  const [draf, setDraf] = useState<typeof awal | null>(null);
  const nilai = draf ?? awal;
  const ubah = (kolom: keyof typeof awal, isi: string) => setDraf({ ...nilai, [kolom]: isi });
  function tutup() { setDraf(null); onClose(); }

  const kapasitas = angkaAtauNull(nilai.capacity);
  const galatKapasitas = kapasitas === null || kapasitas < 1 || kapasitas > 20 ? "Enter 1 to 20." : undefined;
  // Nomor kamar boleh menyusul selama labelnya ada.
  const sah = Boolean(nilai.hotel_id && (nilai.room_number.trim() || nilai.label.trim())) && !galatKapasitas;

  async function kirimForm() {
    if (!sah || kapasitas === null) return;
    const ok = await simpan({
      hotel_id: Number(nilai.hotel_id), room_number: nilai.room_number.trim() || null, label: nilai.label.trim() || null,
      bed_type: nilai.bed_type.trim() || null, room_type: nilai.room_type.trim() || null,
      capacity: kapasitas, floor: nilai.floor.trim() || null, notes: nilai.notes.trim() || null,
    }, state?.mode === "ubah" ? state.kamar.id : undefined);
    if (ok) tutup();
  }

  return (
    <Dialog
      open={state !== null}
      onClose={tutup}
      dismissible={!busy}
      title={state?.mode === "ubah" ? `Edit ${judulKamar(state.kamar, "room")}` : "New room"}
      icon={<Bed size={20} />}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan type="submit" form="form-kamar" loading={busy} disabled={!sah}>{state?.mode === "ubah" ? "Save room" : "Add room"}</Button>
        </>
      }
    >
      <form id="form-kamar" className="grid grid-cols-2 gap-4" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        <SelectField label="Hotel" className="col-span-2" value={nilai.hotel_id} onChange={(event) => ubah("hotel_id", event.target.value)}>
          {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
        </SelectField>
        <TextField label="Room number" placeholder="e.g. 1208" hint="Leave empty if the hotel has not given it yet." autoFocus value={nilai.room_number} onChange={(event) => ubah("room_number", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Label" optional placeholder="e.g. Kamar 01" hint="Your own code from the rooming list. Not shown to participants." value={nilai.label} onChange={(event) => ubah("label", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Bed" optional placeholder="e.g. Twin, King" value={nilai.bed_type} onChange={(event) => ubah("bed_type", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Room type" optional placeholder="e.g. Deluxe" value={nilai.room_type} onChange={(event) => ubah("room_type", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Capacity" type="number" inputMode="numeric" min={1} max={20} value={nilai.capacity} error={nilai.capacity ? galatKapasitas : undefined} onChange={(event) => ubah("capacity", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Floor" optional value={nilai.floor} onChange={(event) => ubah("floor", event.target.value)} className="max-sm:col-span-2" />
        <TextArea label="Staff notes" optional rows={2} hint="Not shown to participants." value={nilai.notes} onChange={(event) => ubah("notes", event.target.value)} className="col-span-2" />
      </form>
    </Dialog>
  );
}

type NilaiHotel = { name: string; address: string | null; map_url: string | null; check_in_at: string | null; check_out_at: string | null };

function FormHotel({ state, busy, zone, onClose, simpan }: {
  state: DialogHotel;
  busy: boolean;
  zone: ReturnType<typeof useEventTimeZone>["zone"];
  onClose: () => void;
  simpan: (nilai: NilaiHotel, id?: number) => Promise<boolean>;
}) {
  const awal = state?.mode === "ubah"
    ? {
      name: state.hotel.name, address: state.hotel.address ?? "", map_url: state.hotel.map_url ?? "",
      check_in_at: keInputWaktu(state.hotel.check_in_at, zone), check_out_at: keInputWaktu(state.hotel.check_out_at, zone),
    }
    : { name: "", address: "", map_url: "", check_in_at: "", check_out_at: "" };
  const [draf, setDraf] = useState<typeof awal | null>(null);
  const nilai = draf ?? awal;
  const ubah = (kolom: keyof typeof awal, isi: string) => setDraf({ ...nilai, [kolom]: isi });
  function tutup() { setDraf(null); onClose(); }

  const galatTanggal = nilai.check_in_at && nilai.check_out_at && nilai.check_out_at <= nilai.check_in_at
    ? "Hotel check-out must be after hotel check-in." : undefined;
  const sah = Boolean(nilai.name.trim()) && !galatTanggal;

  async function kirimForm() {
    if (!sah) return;
    const ok = await simpan({
      name: nilai.name.trim(), address: nilai.address.trim() || null, map_url: nilai.map_url.trim() || null,
      check_in_at: dariInputWaktu(nilai.check_in_at, zone), check_out_at: dariInputWaktu(nilai.check_out_at, zone),
    }, state?.mode === "ubah" ? state.hotel.id : undefined);
    if (ok) tutup();
  }

  return (
    <Dialog
      open={state !== null}
      onClose={tutup}
      dismissible={!busy}
      title={state?.mode === "ubah" ? `Edit ${state.hotel.name}` : "New hotel"}
      icon={<Buildings size={20} />}
      description="The address, map and hotel check-in time appear in the participant area."
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Cancel</Button>
          <Button simpan type="submit" form="form-hotel" loading={busy} disabled={!sah}>{state?.mode === "ubah" ? "Save hotel" : "Add hotel"}</Button>
        </>
      }
    >
      <form id="form-hotel" className="grid grid-cols-2 gap-4" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        <TextField label="Hotel name" autoFocus value={nilai.name} onChange={(event) => ubah("name", event.target.value)} className="col-span-2" />
        <TextArea label="Address" optional rows={2} value={nilai.address} onChange={(event) => ubah("address", event.target.value)} className="col-span-2" />
        <TextField label="Map link" optional type="url" placeholder="https://maps.app.goo.gl/..." value={nilai.map_url} onChange={(event) => ubah("map_url", event.target.value)} className="col-span-2" />
        <TextField label="Hotel check-in" optional type="datetime-local" value={nilai.check_in_at} onChange={(event) => ubah("check_in_at", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Hotel check-out" optional type="datetime-local" value={nilai.check_out_at} error={galatTanggal} onChange={(event) => ubah("check_out_at", event.target.value)} className="max-sm:col-span-2" />
      </form>
    </Dialog>
  );
}
