"use client";

import { Bed, Buildings, SignOut, Warning } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Banner, Button, ChipMenu, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, Pane, PaneBody, PaneFooter,
  SelectField, StatusChip, StatusDot, Switch, TextArea, TextField, EMPTY_VALUE,
} from "@/components/m3";
import { bertabrakan, labelRentang, labelTanggal, puncakHuni, rentangStay, tanggalStay, tanggalZona, type Stay } from "@/lib/logistik/stay";
import { judulKamar } from "@/lib/logistik/nama-kamar";
import { kunciGender, type Hotel, type Kamar, type LogistikData, type LogistikPeserta } from "@/lib/logistik/types";
import { timeZoneOffset } from "@/lib/timezone";
import { cx } from "@/lib/m3/cx";
import { plural } from "@/lib/plural";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import {
  angkaAtauNull, BarisKelompok, BarisOrang, dariInputWaktu, formatWaktu, keInputWaktu, KepalaDetail, PilihPeserta, type TabProps,
} from "./bersama";
import { TabelLogistik, type GrupTabel, type KolomTabel } from "./tabel-logistik";

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

export function TabKamar({ data, kirim, busy, baru, tutupBaru, hotelBaru, tutupHotelBaru, atas }: TabProps & { hotelBaru: boolean; tutupHotelBaru: () => void; atas?: ReactNode }) {
  const { zone, abbr } = useEventTimeZone();
  const offset = timeZoneOffset(zone);
  const [pilihan, setPilihan] = useState<Pilihan>(null);
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

  /**
   * Penghuni kamar per periode (malam yang bertumpuk digabung). Dipakai dialog
   * Edit room: nomor kamar berlaku untuk semua periode, jadi panitia perlu
   * melihat siapa saja yang ikut menerimanya sebelum menyimpan.
   */
  function periodeKamar(kamar: Kamar): PeriodeKamar[] {
    const hotel = hotelById.get(kamar.hotel_id);
    const semua = [...(penghuniKamar.get(kamar.id) ?? [])].sort((a, b) => (a.r?.[0] ?? -Infinity) - (b.r?.[0] ?? -Infinity));
    const hasil: Array<{ awal: number; akhir: number; masuk: string | null; keluar: string | null; orang: LogistikPeserta[] }> = [];
    for (const { orang, stay, r } of semua) {
      const [a, b] = r ?? [-Infinity, Infinity];
      const { masuk, keluar } = tanggalStay(stay, hotel);
      const akhir = hasil.at(-1);
      if (akhir && a < akhir.akhir) {
        if (!akhir.orang.some((x) => x.id === orang.id)) akhir.orang.push(orang);
        if (b > akhir.akhir) { akhir.akhir = b; akhir.keluar = keluar; }
      } else hasil.push({ awal: a, akhir: b, masuk, keluar, orang: [orang] });
    }
    return hasil.map((p) => ({ rentang: labelRentang(p.masuk, p.keluar, offset), nama: p.orang.map((o) => o.name).sort((x, y) => x.localeCompare(y, "id")), ids: p.orang.map((o) => o.id) }));
  }

  function keadaan(kamar: Kamar): Keadaan {
    const { isi, puncak, lebih, campuran } = masalah(kamar);
    if (lebih || campuran) return "perlu-dicek";
    if (isi.length === 0) return "kosong";
    return puncak >= kamar.capacity ? "penuh" : "ada-tempat";
  }

  const kamarTampil = data.rooms.filter((kamar) => {
    if (saringHotel.length > 0 && !saringHotel.includes(String(kamar.hotel_id))) return false;
    if (saringKeadaan.length > 0 && !saringKeadaan.some((s) => (s === "menyusul" ? kamar.room_number === null : s === keadaan(kamar)))) return false;
    return true;
  });
  // Kolom Label hanya ada bila salah satu kamar mengisinya: acara lama tidak berubah.
  const adaLabel = data.rooms.some((kamar) => kamar.label);
  const perluDicek = data.rooms.filter((kamar) => keadaan(kamar) === "perlu-dicek").length;
  const menyaringLuar = saringHotel.length > 0 || saringKeadaan.length > 0;

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
    <Button variant="text" size="sm" icon={<StatusDot tone={aturanTerpasang ? "success" : "warning"} />} onClick={() => setAturan(true)}>
      {!wajibSama ? "Rule: mixed rooms allowed" : kunciField ? `Rule: same ${namaField}` : "Room rules incomplete"}
    </Button>
  );

  /** Tanggal masuk/keluar per penghuni, "Fri 6 Nov" tanpa hari supaya kolomnya sempit. */
  const tanggalPenghuni = (kamar: Kamar, sisi: "masuk" | "keluar") => masalah(kamar).semua.map(({ stay }) => {
    const t = tanggalStay(stay, hotelById.get(kamar.hotel_id));
    const v = sisi === "masuk" ? t.masuk : t.keluar;
    return v ? labelTanggal(tanggalZona(v, offset)).slice(4) : "";
  });
  const kunciTanggal = (kamar: Kamar, sisi: "masuk" | "keluar") => {
    const s = masalah(kamar).semua[0]?.stay;
    if (!s) return "";
    const t = tanggalStay(s, hotelById.get(kamar.hotel_id));
    return (sisi === "masuk" ? t.masuk : t.keluar) ?? "";
  };
  const nomorAtauLabel: KolomTabel<Kamar> = {
    key: "room",
    label: "Room",
    lebar: 112,
    kunci: !adaLabel,
    nilai: (kamar) => (kamar.room_number ? [kamar.room_number] : []),
    sel: (kamar) => {
      const { lebih, campuran } = masalah(kamar);
      return (
        <span className="flex flex-col items-start">
          {kamar.room_number
            ? <span className="block h-7 truncate font-medium leading-7 tabular-nums text-on-surface">{kamar.room_number}</span>
            : <span className="flex h-7 items-center"><StatusChip dot tone="warning">To follow</StatusChip></span>}
          {lebih ? <span className="flex h-7 items-center"><StatusChip dot tone="error">Over capacity</StatusChip></span> : null}
          {campuran ? <span className="flex h-7 items-center"><StatusChip dot tone="warning">Mixed gender</StatusChip></span> : null}
        </span>
      );
    },
  };
  const kolomKamar: KolomTabel<Kamar>[] = [
    ...(adaLabel ? [{
      key: "label", label: "Label", lebar: 96, kunci: true, saring: "teks" as const,
      nilai: (kamar: Kamar) => (kamar.label ? [kamar.label] : []),
      sel: (kamar: Kamar) => <span title={kamar.label ?? undefined} className="block h-7 truncate font-medium leading-7 text-on-surface">{kamar.label ?? EMPTY_VALUE}</span>,
    }] : []),
    nomorAtauLabel,
    { key: "hotel", label: "Hotel", lebar: 200, tersembunyi: true, nilai: (kamar) => [hotelById.get(kamar.hotel_id)?.name ?? ""] },
    { key: "occupant", label: "Occupant", lebar: 220, saring: "teks", nilai: (kamar) => masalah(kamar).isi.map((orang) => orang.name) },
    { key: "organisation", label: "Organisation", lebar: 160, nilai: (kamar) => masalah(kamar).isi.map((orang) => orang.company ?? "") },
    ...(kunciField ? [{ key: "gender", label: namaField ?? "Gender", lebar: 96, tersembunyi: !wajibSama, nilai: (kamar: Kamar) => masalah(kamar).isi.map((orang) => orang.gender ?? "") }] : []),
    { key: "masuk", label: "Check-in", lebar: 96, urut: "waktu", nilai: (kamar) => tanggalPenghuni(kamar, "masuk"), kunciUrut: (kamar) => kunciTanggal(kamar, "masuk") },
    { key: "keluar", label: "Check-out", lebar: 104, urut: "waktu", nilai: (kamar) => tanggalPenghuni(kamar, "keluar"), kunciUrut: (kamar) => kunciTanggal(kamar, "keluar") },
    { key: "bed", label: "Bed", lebar: 88, nilai: (kamar) => (kamar.bed_type ? [kamar.bed_type] : []) },
    { key: "type", label: "Room type", lebar: 112, nilai: (kamar) => (kamar.room_type ? [kamar.room_type] : []) },
    { key: "floor", label: "Floor", lebar: 72, rata: "kanan", urut: "angka", tersembunyi: true, nilai: (kamar) => (kamar.floor ? [kamar.floor] : []) },
    { key: "notes", label: "Staff notes", lebar: 200, saring: "teks", tersembunyi: true, nilai: (kamar) => (kamar.notes ? [kamar.notes] : []) },
    {
      key: "filled", label: "Filled", lebar: 80, rata: "kanan", urut: "angka",
      nilai: (kamar) => [`${masalah(kamar).puncak}/${kamar.capacity}`],
      kunciUrut: (kamar) => String(masalah(kamar).puncak).padStart(3, "0"),
      sel: (kamar) => { const { puncak, lebih } = masalah(kamar); return <span className={cx("block h-7 leading-7 tabular-nums", lebih ? "text-error" : puncak === 0 ? "text-on-surface-variant" : "text-on-surface")}>{puncak}/{kamar.capacity}</span>; },
    },
  ];
  const kolomPertama = kolomKamar[0].key;

  const grupHotel: GrupTabel[] = data.hotels.filter((hotel) => saringHotel.length === 0 || saringHotel.includes(String(hotel.id))).map((hotel) => {
    const menunggu = menungguHotel.get(hotel.id) ?? [];
    const semuaKamar = data.rooms.filter((kamar) => kamar.hotel_id === hotel.id);
    const terisi = semuaKamar.reduce((jumlah, kamar) => jumlah + masalah(kamar).puncak, 0);
    const tempat = semuaKamar.reduce((jumlah, kamar) => jumlah + kamar.capacity, 0);
    const nama = [...new Set(menunggu.map(({ orang }) => orang.name))];
    return {
      key: String(hotel.id),
      kepala: (
        <BarisKelompok label={`Hotel ${hotel.name}`} selected={pilihan?.jenis === "hotel" && pilihan.id === hotel.id} onSelect={() => setPilihan({ jenis: "hotel", id: hotel.id })}>
          <Buildings size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
          <span className="min-w-0 truncate font-medium text-on-surface">{hotel.name}</span>
          {menunggu.length > 0 ? <StatusChip dot tone="warning">{jumlahOrang(menunggu).toLocaleString("en-GB")} waiting for a room</StatusChip> : null}
          <span className="shrink-0 tabular-nums text-on-surface-variant"><span className="max-sm:hidden">{plural(semuaKamar.length, "room")} · </span>{terisi}/{tempat} places</span>
        </BarisKelompok>
      ),
      // Tamu hotel tanpa kamar: satu baris "To follow". Status tidak berlaku
      // untuknya (itu keadaan kamar), cari mencocokkan nama tamu.
      sebelum: (q, saring) => {
        if (menunggu.length === 0 || saring) return null;
        const kataCari = q.toLocaleLowerCase("en").split(/\s+/).filter(Boolean);
        if (kataCari.length && !nama.some((n) => kataCari.every((k) => n.toLocaleLowerCase("en").includes(k)))) return null;
        return {
          key: `tunggu-${hotel.id}`,
          label: `${hotel.name}: ${jumlahOrang(menunggu)} waiting for a room`,
          dipilih: pilihan?.jenis === "tunggu" && pilihan.id === hotel.id,
          onPilih: () => setPilihan({ jenis: "tunggu", id: hotel.id }),
          sel: {
            [kolomPertama]: <span className="block h-7 leading-7 text-on-surface">To follow</span>,
            occupant: <span className="block h-7 max-w-[220px] truncate leading-7 text-on-surface-variant" title={nama.join(", ")}>{nama.join(", ")}</span>,
            filled: <span className="block h-7 leading-7 tabular-nums text-on-surface">{jumlahOrang(menunggu).toLocaleString("en-GB")}</span>,
          },
        };
      },
      kosong: semuaKamar.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-body-medium text-on-surface-variant">
          <span className="min-w-0 flex-1">No rooms in this hotel yet.</span>
          <Button variant="outlined" size="sm" onClick={() => setDialogKamar({ mode: "baru", hotelId: hotel.id })}>Add room</Button>
        </div>
      ) : undefined,
    };
  });

  const daftar = (
    <TabelLogistik<Kamar>
      label="Rooms"
      tabel="rooms"
      baris={kamarTampil}
      kunciBaris={(kamar) => String(kamar.id)}
      kolom={kolomKamar}
      cariLabel="Search rooms"
      cariPlaceholder={adaLabel ? "Search label, room or name…" : "Search room or name…"}
      menyaringLuar={menyaringLuar}
      hapusSaringanLuar={() => { setSaringHotel([]); setSaringKeadaan([]); }}
      awal={atas}
      chip={data.rooms.length > 0 ? (
        <>
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
              { value: "menyusul", label: "Room number to follow", count: data.rooms.filter((kamar) => kamar.room_number === null).length },
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
      ujung={tombolAturan}
      grup={data.hotels.length > 0 ? grupHotel : undefined}
      grupBaris={(kamar) => String(kamar.hotel_id)}
      dipilih={pilihan?.jenis === "kamar" ? String(pilihan.id) : null}
      onPilih={(kamar) => setPilihan({ jenis: "kamar", id: kamar.id })}
      labelBaris={(kamar) => judulKamar(kamar)}
      namaFile="rooms"
      kaki={(tampil) => tampil.length === 0 ? null : `${plural(tampil.length, "room")} · ${tampil.reduce((t, k) => t + masalah(k).puncak, 0).toLocaleString("en-GB")} of ${tampil.reduce((t, k) => t + k.capacity, 0).toLocaleString("en-GB")} places filled${tampil.some((k) => k.room_number === null) ? ` · ${tampil.filter((k) => k.room_number === null).length.toLocaleString("en-GB")} room numbers to follow` : ""}`}
      kosong={data.hotels.length === 0 ? (
        <EmptyState
          plain
          icon={<Buildings size={40} />}
          title="No hotels yet"
          description="Every room belongs to a hotel. Start with Add hotel at the top right, then add its rooms."
        />
      ) : undefined}
    />
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
    // Tamu dengan tanggal stay sendiri (malam tambahan, pindah kamar): jam hotel
    // bukan lagi jam semua orang, dan kalimatnya harus berkata begitu.
    const tanggalSendiri = new Set(data.lodging.filter((stay) => stay.hotel_id === hotelDipilih.id && orangById.has(stay.participant_id) &&
      (stay.check_in_at !== null || stay.check_out_at !== null)).map((stay) => stay.participant_id)).size;
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
            <p className="text-body-small text-on-surface-variant">
              {tanggalSendiri > 0
                ? `Default for guests without their own dates. ${plural(tanggalSendiri, "guest has", "guests have")} their own dates; see Rooms > By date.`
                : "These times apply to every room in this hotel."}
            </p>
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
        periode={!baru && dialogKamar?.mode === "ubah" ? periodeKamar(dialogKamar.kamar) : []}
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

type PeriodeKamar = { rentang: string | null; nama: string[]; ids: string[] };

function FormKamar({ state, hotels, periode, busy, onClose, simpan }: {
  state: DialogKamar;
  hotels: Hotel[];
  /** Penghuni kamar yang diedit, per periode. Kosong untuk kamar baru. */
  periode: PeriodeKamar[];
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
        {periode.length > 0 ? <PenghuniPeriode periode={periode} /> : null}
        <TextField label="Bed" optional placeholder="e.g. Twin, King" value={nilai.bed_type} onChange={(event) => ubah("bed_type", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Room type" optional placeholder="e.g. Deluxe" value={nilai.room_type} onChange={(event) => ubah("room_type", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Capacity" type="number" inputMode="numeric" min={1} max={20} value={nilai.capacity} error={nilai.capacity ? galatKapasitas : undefined} onChange={(event) => ubah("capacity", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Floor" optional value={nilai.floor} onChange={(event) => ubah("floor", event.target.value)} className="max-sm:col-span-2" />
        <TextArea label="Staff notes" optional rows={2} hint="Not shown to participants." value={nilai.notes} onChange={(event) => ubah("notes", event.target.value)} className="col-span-2" />
      </form>
    </Dialog>
  );
}

/**
 * Siapa yang ikut menerima nomor kamar ini. Satu label yang dipakai dua
 * kelompok di malam berbeda (GH20 untuk 5–6 Nov dan 6–8 Nov) membuat nomor
 * untuk satu kelompok sampai juga ke kelompok lain; peringatannya muncul di
 * sini, sebelum disimpan.
 */
function PenghuniPeriode({ periode }: { periode: PeriodeKamar[] }) {
  const orang = new Set(periode.flatMap((p) => p.ids)).size;
  const berbeda = periode.length > 1 && new Set(periode.map((p) => [...p.ids].sort().join(","))).size > 1;
  return (
    <div className="col-span-2 flex flex-col gap-2">
      <p className="text-label-large text-on-surface">
        Applies to {plural(orang, "person", "people")}{periode.length > 1 ? ` on ${periode.length} periods` : ""}
      </p>
      <ul className="overflow-hidden rounded-md border border-outline-variant">
        {periode.map((p, i) => (
          <li key={i} className={cx("flex items-baseline gap-3 px-3 py-2 text-body-medium", i > 0 && "border-t border-outline-variant")}>
            {/* Kolom tanggal selebar tetap, supaya nama selalu sejajar di sebelahnya, juga saat terbungkus. */}
            {p.rentang ? <span className="w-[5.5rem] shrink-0 font-medium tabular-nums text-on-surface">{p.rentang}</span> : null}
            <span className="min-w-0 flex-1 break-words text-on-surface-variant">{p.nama.join(", ")}</span>
          </li>
        ))}
      </ul>
      {berbeda ? (
        <Banner tone="warning" icon={<Warning size={18} />}>
          Different people on different nights share this room, so a room number reaches all of them. If the hotel gave a number for one period only, add a separate room for the other group and move them with Change room first.
        </Banner>
      ) : null}
    </div>
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
