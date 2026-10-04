"use client";

import { Bed, Buildings, MagnifyingGlass, SignOut, Warning } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  Banner, Button, ChipMenu, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, Pane, PaneBody, PaneFooter,
  PaneHeader, SelectField, StatusChip, StatusDot, Switch, TextArea, TextField, EMPTY_VALUE,
} from "@/components/m3";
import { kunciGender, type Hotel, type Kamar, type LogistikPeserta } from "@/lib/logistik/types";
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
 */

type Pilihan = { jenis: "kamar"; id: number } | { jenis: "hotel"; id: number } | null;
type Keadaan = "kosong" | "ada-tempat" | "penuh" | "perlu-dicek";
type DialogKamar = { mode: "baru"; hotelId?: number } | { mode: "ubah"; kamar: Kamar } | null;
type DialogHotel = { mode: "baru" } | { mode: "ubah"; hotel: Hotel } | null;

const urutKamar = (a: Kamar, b: Kamar) => a.room_number.localeCompare(b.room_number, "id", { numeric: true });

export function TabKamar({ data, kirim, busy, baru, tutupBaru, hotelBaru, tutupHotelBaru }: TabProps & { hotelBaru: boolean; tutupHotelBaru: () => void }) {
  const { zone, abbr } = useEventTimeZone();
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
  const penghuniKamar = useMemo(() => {
    const peta = new Map<number, LogistikPeserta[]>();
    for (const baris of data.lodging) {
      const orang = orangById.get(baris.participant_id);
      // Peserta yang dihapus di sumber tidak ada di daftar dan tidak dihitung,
      // sama seperti `assign_room` tidak menghitungnya.
      if (!orang) continue;
      peta.set(baris.room_id, [...(peta.get(baris.room_id) ?? []), orang]);
    }
    return peta;
  }, [data.lodging, orangById]);
  const kamarPeserta = useMemo(() => new Map(data.lodging.map((baris) => [baris.participant_id, baris.room_id])), [data.lodging]);
  const kamarById = useMemo(() => new Map(data.rooms.map((kamar) => [kamar.id, kamar])), [data.rooms]);
  const hotelById = useMemo(() => new Map(data.hotels.map((hotel) => [hotel.id, hotel])), [data.hotels]);

  function masalah(kamar: Kamar) {
    const isi = penghuniKamar.get(kamar.id) ?? [];
    const lebih = isi.length > kamar.capacity;
    const gender = new Set(isi.map((orang) => kunciGender(orang.gender)).filter(Boolean));
    const campuran = Boolean(kunciField) && gender.size > 1;
    return { isi, lebih, campuran };
  }

  function keadaan(kamar: Kamar): Keadaan {
    const { isi, lebih, campuran } = masalah(kamar);
    if (lebih || campuran) return "perlu-dicek";
    if (isi.length === 0) return "kosong";
    return isi.length >= kamar.capacity ? "penuh" : "ada-tempat";
  }

  const kata = cari.trim().toLowerCase();
  const kamarTampil = data.rooms.filter((kamar) => {
    if (saringHotel.length > 0 && !saringHotel.includes(String(kamar.hotel_id))) return false;
    if (saringKeadaan.length > 0 && !saringKeadaan.includes(keadaan(kamar))) return false;
    if (!kata) return true;
    return kamar.room_number.toLowerCase().includes(kata) ||
      (penghuniKamar.get(kamar.id) ?? []).some((orang) => orang.name.toLowerCase().includes(kata));
  });
  const perluDicek = data.rooms.filter((kamar) => keadaan(kamar) === "perlu-dicek").length;
  const menyaring = Boolean(kata) || saringHotel.length > 0 || saringKeadaan.length > 0;

  // ---- Tulis ---------------------------------------------------------------
  async function keluarkan(orang: LogistikPeserta) {
    await kirim(`/api/admin/logistik/penghuni?participant_id=${orang.id}`, "DELETE");
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
            <KepalaKolom kolom={[["Room", "w-24"], ["Occupants", "min-w-0 flex-1"], ["Type", "w-28 max-sm:hidden"], ["Filled", "w-16 text-right"]]} />
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
              if (menyaring && kamarHotel.length === 0) return null;
              const semuaKamar = data.rooms.filter((kamar) => kamar.hotel_id === hotel.id);
              const terisi = semuaKamar.reduce((jumlah, kamar) => jumlah + (penghuniKamar.get(kamar.id)?.length ?? 0), 0);
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
                    <span className="shrink-0 tabular-nums text-on-surface-variant">{plural(semuaKamar.length, "room")} · {terisi}/{tempat} places</span>
                  </BarisKelompok>
                  {semuaKamar.length === 0 ? (
                    <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant px-4 py-3 text-body-medium text-on-surface-variant">
                      <span className="min-w-0 flex-1">No rooms in this hotel yet.</span>
                      <Button variant="outlined" size="sm" onClick={() => setDialogKamar({ mode: "baru", hotelId: hotel.id })}>Add room</Button>
                    </div>
                  ) : kamarHotel.map((kamar) => {
                    const { isi, lebih, campuran } = masalah(kamar);
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
                        <span className="w-24 shrink-0 truncate tabular-nums text-on-surface">{kamar.room_number}</span>
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          {lebih ? <StatusChip dot tone="error">Over capacity</StatusChip> : null}
                          {campuran ? <StatusChip dot tone="warning">Mixed gender</StatusChip> : null}
                          <span className="min-w-0 truncate text-on-surface-variant">
                            {isi.length > 0 ? isi.map((orang) => orang.name).join(", ") : "Empty"}
                          </span>
                        </span>
                        <span className="w-28 shrink-0 truncate text-on-surface-variant max-sm:hidden">{kamar.room_type ?? EMPTY_VALUE}</span>
                        <span className={cx("w-16 shrink-0 text-right tabular-nums", lebih ? "text-error" : "text-on-surface")}>
                          {isi.length}/{kamar.capacity}
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

  if (kamarDipilih) {
    const { isi, lebih, campuran } = masalah(kamarDipilih);
    const hotel = hotelById.get(kamarDipilih.hotel_id);
    const sisa = kamarDipilih.capacity - isi.length;
    detail = (
      <Pane as="aside" aria-label={`Room ${kamarDipilih.room_number} details`}>
        <KepalaDetail
          nama={`Room ${kamarDipilih.room_number}`}
          chip={lebih ? { tone: "error", teks: "Over capacity" } : campuran ? { tone: "warning", teks: "Mixed gender" } : null}
          sub={[hotel?.name, kamarDipilih.room_type, kamarDipilih.floor ? `Floor ${kamarDipilih.floor}` : null].filter(Boolean).join(" · ")}
          angka={`${isi.length}/${kamarDipilih.capacity}`}
          keterangan="places filled"
          onClose={() => setPilihan(null)}
        />
        <PaneBody>
          {lebih || campuran ? (
            <div className="px-5 pt-4">
              <Banner tone={lebih ? "error" : "warning"} icon={<Warning size={18} />}>
                {lebih
                  ? `This room has ${plural(isi.length - kamarDipilih.capacity, "person", "people")} more than its capacity. Remove someone or raise the capacity.`
                  : "The occupants have different genders, usually because an answer changed after they were assigned. Move one of them."}
              </Banner>
            </div>
          ) : null}
          <DetailSection title="Occupants">
            {isi.length === 0 ? (
              <p className="text-body-medium text-on-surface-variant">No occupants yet. Add them with the button below.</p>
            ) : (
              <ul className="flex flex-col">
                {isi.map((orang) => (
                  <BarisOrang
                    key={orang.id}
                    orang={orang}
                    keterangan={kunciField ? orang.gender ?? "No gender" : null}
                    aksi={
                      <IconButton simpan size="sm" label={`Remove ${orang.name} from the room`} disabled={busy} onClick={() => void keluarkan(orang)}>
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
        <PaneFooter note={sisa > 0 ? `${plural(sisa, "place")} left` : "Room full"}>
          {isi.length === 0 ? (
            <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus({ jenis: "kamar", kamar: kamarDipilih })}>Delete</Button>
          ) : null}
          <Button variant="outlined" size="sm" onClick={() => setDialogKamar({ mode: "ubah", kamar: kamarDipilih })}>Edit</Button>
          <Button simpan size="sm" disabled={busy || sisa <= 0} onClick={() => setTambahPenghuni(true)}>Add occupants</Button>
        </PaneFooter>
      </Pane>
    );
  } else if (hotelDipilih) {
    const semuaKamar = data.rooms.filter((kamar) => kamar.hotel_id === hotelDipilih.id);
    const terisi = semuaKamar.reduce((jumlah, kamar) => jumlah + (penghuniKamar.get(kamar.id)?.length ?? 0), 0);
    const tempat = semuaKamar.reduce((jumlah, kamar) => jumlah + kamar.capacity, 0);
    detail = (
      <Pane as="aside" aria-label={`Hotel ${hotelDipilih.name} details`}>
        <KepalaDetail
          nama={hotelDipilih.name}
          sub={plural(semuaKamar.length, "room")}
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
        <PaneFooter note={terisi > 0 ? "A hotel with occupants cannot be deleted." : undefined}>
          {terisi === 0 ? (
            <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus({ jenis: "hotel", hotel: hotelDipilih })}>Delete</Button>
          ) : null}
          <Button variant="outlined" size="sm" onClick={() => setDialogHotel({ mode: "ubah", hotel: hotelDipilih })}>Edit</Button>
          <Button simpan size="sm" onClick={() => setDialogKamar({ mode: "baru", hotelId: hotelDipilih.id })}>Add room</Button>
        </PaneFooter>
      </Pane>
    );
  }

  // ---- Dialog tambah penghuni ------------------------------------------------
  const penghuniSekarang = kamarDipilih ? masalah(kamarDipilih).isi : [];
  const genderKamar = kunciGender(penghuniSekarang.find((orang) => orang.gender)?.gender);

  return (
    <>
      <ListDetail list={daftar} detail={detail} />

      {kamarDipilih ? (
        <PilihPeserta
          open={tambahPenghuni}
          onClose={() => setTambahPenghuni(false)}
          title={`Add occupants to room ${kamarDipilih.room_number}`}
          description={wajibSama && kunciField
            ? `Only participants of the same gender can be chosen${genderKamar ? "" : "; an empty room follows the first person chosen"}.`
            : undefined}
          peserta={data.participants}
          utama={(orang) => !kamarPeserta.has(orang.id)}
          labelUtama="Participants without a room."
          keterangan={(orang) => {
            const kamarLama = kamarPeserta.get(orang.id);
            const lama = kamarLama !== undefined ? kamarById.get(kamarLama) : undefined;
            return [kunciField ? orang.gender ?? "No gender" : null, lama ? `Now in room ${lama.room_number}` : null]
              .filter(Boolean).join(" · ") || null;
          }}
          alasanTolak={(orang) => {
            if (kamarPeserta.get(orang.id) === kamarDipilih.id) return "Already in this room";
            if (!wajibSama || !kunciField) return null;
            if (!orang.gender) return "Gender not filled in";
            if (genderKamar && kunciGender(orang.gender) !== genderKamar) return "Different gender";
            return null;
          }}
          batas={Math.max(kamarDipilih.capacity - penghuniSekarang.length, 0)}
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
        title={hapus?.jenis === "kamar" ? `Delete room ${hapus.kamar.room_number}?` : `Delete hotel ${hapus?.jenis === "hotel" ? hapus.hotel.name : ""}?`}
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

type NilaiKamar = { hotel_id: number; room_number: string; room_type: string | null; capacity: number; floor: string | null; notes: string | null };

function FormKamar({ state, hotels, busy, onClose, simpan }: {
  state: DialogKamar;
  hotels: Hotel[];
  busy: boolean;
  onClose: () => void;
  simpan: (nilai: NilaiKamar, id?: number) => Promise<boolean>;
}) {
  const awal = state?.mode === "ubah"
    ? {
      hotel_id: String(state.kamar.hotel_id), room_number: state.kamar.room_number, room_type: state.kamar.room_type ?? "",
      capacity: String(state.kamar.capacity), floor: state.kamar.floor ?? "", notes: state.kamar.notes ?? "",
    }
    : { hotel_id: String(state?.hotelId ?? hotels[0]?.id ?? ""), room_number: "", room_type: "", capacity: "2", floor: "", notes: "" };
  const [draf, setDraf] = useState<typeof awal | null>(null);
  const nilai = draf ?? awal;
  const ubah = (kolom: keyof typeof awal, isi: string) => setDraf({ ...nilai, [kolom]: isi });
  function tutup() { setDraf(null); onClose(); }

  const kapasitas = angkaAtauNull(nilai.capacity);
  const galatKapasitas = kapasitas === null || kapasitas < 1 || kapasitas > 20 ? "Enter 1 to 20." : undefined;
  const sah = Boolean(nilai.hotel_id && nilai.room_number.trim()) && !galatKapasitas;

  async function kirimForm() {
    if (!sah || kapasitas === null) return;
    const ok = await simpan({
      hotel_id: Number(nilai.hotel_id), room_number: nilai.room_number.trim(), room_type: nilai.room_type.trim() || null,
      capacity: kapasitas, floor: nilai.floor.trim() || null, notes: nilai.notes.trim() || null,
    }, state?.mode === "ubah" ? state.kamar.id : undefined);
    if (ok) tutup();
  }

  return (
    <Dialog
      open={state !== null}
      onClose={tutup}
      dismissible={!busy}
      title={state?.mode === "ubah" ? `Edit room ${state.kamar.room_number}` : "New room"}
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
        <TextField label="Room number" placeholder="e.g. 1208" autoFocus value={nilai.room_number} onChange={(event) => ubah("room_number", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Capacity" type="number" inputMode="numeric" min={1} max={20} value={nilai.capacity} error={nilai.capacity ? galatKapasitas : undefined} onChange={(event) => ubah("capacity", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Room type" optional placeholder="e.g. Twin, Deluxe" value={nilai.room_type} onChange={(event) => ubah("room_type", event.target.value)} className="max-sm:col-span-2" />
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
