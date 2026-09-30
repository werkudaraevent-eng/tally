"use client";

import { Bed, Buildings, MagnifyingGlass, SignOut, Warning } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  Banner, Button, ChipMenu, DetailSection, Dialog, EmptyState, IconButton, KeyValue, ListDetail, Pane, PaneBody, PaneFooter,
  PaneHeader, SelectField, StatusChip, StatusDot, Switch, TextArea, TextField, EMPTY_VALUE,
} from "@/components/m3";
import { formatEventDateTime } from "@/lib/datetime";
import { kunciGender, type Hotel, type Kamar, type LogistikPeserta } from "@/lib/logistik/types";
import { cx } from "@/lib/m3/cx";
import { useEventTimeZone } from "@/lib/use-event-timezone";
import {
  angkaAtauNull, BarisKelompok, BarisOrang, dariInputWaktu, keInputWaktu, KepalaDetail, KepalaKolom, KolomCari, PilihPeserta, type TabProps,
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
      {!wajibSama ? "Aturan: boleh campuran" : kunciField ? `Aturan: sesama ${namaField}` : "Aturan belum lengkap"}
    </Button>
  );

  const saringan = (
    <PaneHeader className="flex-wrap gap-2 px-3 py-2.5">
      {data.rooms.length > 0 ? (
        <>
          <KolomCari className="max-w-80" label="Cari kamar atau penghuni" placeholder="Cari nomor kamar atau nama penghuni" value={cari} onChange={setCari} />
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
            label="Keadaan"
            multiple
            options={[
              { value: "kosong", label: "Kosong" },
              { value: "ada-tempat", label: "Masih ada tempat" },
              { value: "penuh", label: "Penuh" },
              { value: "perlu-dicek", label: "Perlu dicek", count: perluDicek },
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
    <Pane aria-label="Daftar kamar">
      {saringan}
      <PaneBody>
        {data.hotels.length === 0 ? (
          <EmptyState
            plain
            icon={<Buildings size={40} />}
            title="Belum ada hotel"
            description="Kamar selalu milik satu hotel. Mulai dari Hotel baru di kanan atas, lalu tambahkan kamar-kamarnya."
          />
        ) : (
          <>
            <KepalaKolom kolom={[["Kamar", "w-24"], ["Penghuni", "min-w-0 flex-1"], ["Tipe", "w-28 max-sm:hidden"], ["Isi", "w-16 text-right"]]} />
            {menyaring && kamarTampil.length === 0 ? (
              <EmptyState
                plain
                icon={<MagnifyingGlass size={40} />}
                title="Tidak ada kamar yang cocok"
                description="Ubah kata pencarian atau lepaskan saringan untuk melihat semua kamar."
                action={<Button variant="outlined" onClick={() => { setCari(""); setSaringHotel([]); setSaringKeadaan([]); }}>Lepas saringan</Button>}
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
                    <span className="shrink-0 tabular-nums text-on-surface-variant">{semuaKamar.length} kamar · {terisi}/{tempat} tempat</span>
                  </BarisKelompok>
                  {semuaKamar.length === 0 ? (
                    <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant px-4 py-3 text-body-medium text-on-surface-variant">
                      <span className="min-w-0 flex-1">Belum ada kamar di hotel ini.</span>
                      <Button variant="outlined" size="sm" onClick={() => setDialogKamar({ mode: "baru", hotelId: hotel.id })}>Tambah kamar</Button>
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
                          {lebih ? <StatusChip dot tone="error">Melebihi kapasitas</StatusChip> : null}
                          {campuran ? <StatusChip dot tone="warning">Jenis kelamin campuran</StatusChip> : null}
                          <span className="min-w-0 truncate text-on-surface-variant">
                            {isi.length > 0 ? isi.map((orang) => orang.name).join(", ") : "Kosong"}
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
      <Pane as="aside" aria-label={`Detail kamar ${kamarDipilih.room_number}`}>
        <KepalaDetail
          nama={`Kamar ${kamarDipilih.room_number}`}
          chip={lebih ? { tone: "error", teks: "Melebihi kapasitas" } : campuran ? { tone: "warning", teks: "Campuran" } : null}
          sub={[hotel?.name, kamarDipilih.room_type, kamarDipilih.floor ? `Lantai ${kamarDipilih.floor}` : null].filter(Boolean).join(" · ")}
          angka={`${isi.length}/${kamarDipilih.capacity}`}
          keterangan="tempat terisi"
          onClose={() => setPilihan(null)}
        />
        <PaneBody>
          {lebih || campuran ? (
            <div className="px-5 pt-4">
              <Banner tone={lebih ? "error" : "warning"} icon={<Warning size={18} />}>
                {lebih
                  ? `Penghuninya ${isi.length - kamarDipilih.capacity} orang lebih banyak dari kapasitas. Keluarkan seseorang atau naikkan kapasitasnya.`
                  : "Penghuninya berbeda jenis kelamin, biasanya karena jawabannya diubah setelah ditempatkan. Pindahkan salah satunya."}
              </Banner>
            </div>
          ) : null}
          <DetailSection title="Penghuni">
            {isi.length === 0 ? (
              <p className="text-body-medium text-on-surface-variant">Belum ada penghuni. Tambahkan lewat tombol di bawah.</p>
            ) : (
              <ul className="flex flex-col">
                {isi.map((orang) => (
                  <BarisOrang
                    key={orang.id}
                    orang={orang}
                    keterangan={kunciField ? orang.gender ?? "Jenis kelamin kosong" : null}
                    aksi={
                      <IconButton simpan size="sm" label={`Keluarkan ${orang.name} dari kamar`} disabled={busy} onClick={() => void keluarkan(orang)}>
                        <SignOut size={16} />
                      </IconButton>
                    }
                  />
                ))}
              </ul>
            )}
          </DetailSection>
          {kamarDipilih.notes ? (
            <DetailSection title="Catatan panitia">
              <p className="whitespace-pre-line text-body-medium text-on-surface">{kamarDipilih.notes}</p>
              <p className="text-body-small text-on-surface-variant">Tidak pernah tampil ke peserta.</p>
            </DetailSection>
          ) : null}
        </PaneBody>
        <PaneFooter note={sisa > 0 ? `${sisa} tempat tersisa` : "Kamar penuh"}>
          {isi.length === 0 ? (
            <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus({ jenis: "kamar", kamar: kamarDipilih })}>Hapus</Button>
          ) : null}
          <Button variant="outlined" size="sm" onClick={() => setDialogKamar({ mode: "ubah", kamar: kamarDipilih })}>Ubah</Button>
          <Button simpan size="sm" disabled={busy || sisa <= 0} onClick={() => setTambahPenghuni(true)}>Tambah penghuni</Button>
        </PaneFooter>
      </Pane>
    );
  } else if (hotelDipilih) {
    const semuaKamar = data.rooms.filter((kamar) => kamar.hotel_id === hotelDipilih.id);
    const terisi = semuaKamar.reduce((jumlah, kamar) => jumlah + (penghuniKamar.get(kamar.id)?.length ?? 0), 0);
    const tempat = semuaKamar.reduce((jumlah, kamar) => jumlah + kamar.capacity, 0);
    detail = (
      <Pane as="aside" aria-label={`Detail hotel ${hotelDipilih.name}`}>
        <KepalaDetail
          nama={hotelDipilih.name}
          sub={`${semuaKamar.length} kamar`}
          angka={`${terisi}/${tempat}`}
          keterangan="tempat terisi"
          onClose={() => setPilihan(null)}
        />
        <PaneBody>
          <DetailSection title="Yang dilihat peserta">
            <dl className="flex flex-col gap-2">
              <KeyValue label="Alamat">{hotelDipilih.address ?? EMPTY_VALUE}</KeyValue>
              <KeyValue label="Peta">
                {hotelDipilih.map_url ? <a href={hotelDipilih.map_url} target="_blank" rel="noreferrer" className="text-primary underline">Buka peta</a> : EMPTY_VALUE}
              </KeyValue>
              <KeyValue label="Check-in">{hotelDipilih.check_in_at ? `${formatEventDateTime(hotelDipilih.check_in_at, zone)} ${abbr}` : EMPTY_VALUE}</KeyValue>
              <KeyValue label="Check-out">{hotelDipilih.check_out_at ? `${formatEventDateTime(hotelDipilih.check_out_at, zone)} ${abbr}` : EMPTY_VALUE}</KeyValue>
            </dl>
            <p className="text-body-small text-on-surface-variant">Tanggal di sini berlaku untuk semua kamar hotel ini.</p>
          </DetailSection>
        </PaneBody>
        <PaneFooter note={terisi > 0 ? "Hotel berpenghuni tidak bisa dihapus." : undefined}>
          {terisi === 0 ? (
            <Button simpan variant="outlined" size="sm" className="text-error" disabled={busy} onClick={() => setHapus({ jenis: "hotel", hotel: hotelDipilih })}>Hapus</Button>
          ) : null}
          <Button variant="outlined" size="sm" onClick={() => setDialogHotel({ mode: "ubah", hotel: hotelDipilih })}>Ubah</Button>
          <Button simpan size="sm" onClick={() => setDialogKamar({ mode: "baru", hotelId: hotelDipilih.id })}>Tambah kamar</Button>
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
          title={`Tambah penghuni kamar ${kamarDipilih.room_number}`}
          description={wajibSama && kunciField
            ? `Hanya peserta dengan jenis kelamin yang sama yang bisa dipilih${genderKamar ? "" : "; kamar kosong mengikuti orang pertama yang dipilih"}.`
            : undefined}
          peserta={data.participants}
          utama={(orang) => !kamarPeserta.has(orang.id)}
          labelUtama="Peserta yang belum dapat kamar."
          keterangan={(orang) => {
            const kamarLama = kamarPeserta.get(orang.id);
            const lama = kamarLama !== undefined ? kamarById.get(kamarLama) : undefined;
            return [kunciField ? orang.gender ?? "Jenis kelamin kosong" : null, lama ? `Sekarang di kamar ${lama.room_number}` : null]
              .filter(Boolean).join(" · ") || null;
          }}
          alasanTolak={(orang) => {
            if (kamarPeserta.get(orang.id) === kamarDipilih.id) return "Sudah di kamar ini";
            if (!wajibSama || !kunciField) return null;
            if (!orang.gender) return "Jenis kelamin belum diisi";
            if (genderKamar && kunciGender(orang.gender) !== genderKamar) return "Jenis kelamin berbeda";
            return null;
          }}
          batas={Math.max(kamarDipilih.capacity - penghuniSekarang.length, 0)}
          tombol="Masukkan ke kamar"
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
        title={hapus?.jenis === "kamar" ? `Hapus kamar ${hapus.kamar.room_number}?` : `Hapus hotel ${hapus?.jenis === "hotel" ? hapus.hotel.name : ""}?`}
        description={hapus?.jenis === "hotel"
          ? "Semua kamar kosong di hotel ini ikut terhapus. Penghapusan tidak bisa dibatalkan."
          : "Kamar ini kosong, jadi tidak ada penempatan yang hilang. Penghapusan tidak bisa dibatalkan."}
        actions={
          <>
            <Button variant="outlined" disabled={busy} onClick={() => setHapus(null)}>Batal</Button>
            <Button simpan variant="danger" loading={busy} onClick={() => void hapusSekarang()}>Hapus</Button>
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
      title="Aturan kamar"
      description="Jenis kelamin dibaca dari jawaban formulir atau kolom impor peserta. Aturannya diperiksa setiap kali seseorang dimasukkan ke kamar."
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Batal</Button>
          <Button simpan loading={busy} onClick={async () => { if (await simpan({ gender_field_key: nilai.key || null, enforce_same_gender: nilai.wajib })) tutup(); }}>Simpan aturan</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SelectField
          label="Field jenis kelamin"
          value={nilai.key}
          onChange={(event) => setDraf({ ...nilai, key: event.target.value })}
          hint={data.fields.length === 0
            ? "Belum ada field di data peserta. Tambahkan field Jenis kelamin di Pendaftaran publik, atau impor peserta dengan kolom itu."
            : field ? `${field.filled} dari ${data.participants.length} peserta sudah punya jawaban.` : undefined}
        >
          <option value="">Belum dipilih</option>
          {data.fields.map((f) => (
            <option key={f.key} value={f.key}>{f.label}{f.source === "data" ? " (dari impor)" : ""}</option>
          ))}
        </SelectField>
        <Switch
          checked={nilai.wajib}
          onChange={(wajib) => setDraf({ ...nilai, wajib })}
          label="Wajib sesama jenis kelamin"
          description="Menolak penempatan yang membuat kamar campuran, dan peserta yang belum punya jawaban jenis kelamin."
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
  const galatKapasitas = kapasitas === null || kapasitas < 1 || kapasitas > 20 ? "Isi 1 sampai 20." : undefined;
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
      title={state?.mode === "ubah" ? `Ubah kamar ${state.kamar.room_number}` : "Kamar baru"}
      icon={<Bed size={20} />}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Batal</Button>
          <Button simpan type="submit" form="form-kamar" loading={busy} disabled={!sah}>{state?.mode === "ubah" ? "Simpan kamar" : "Tambah kamar"}</Button>
        </>
      }
    >
      <form id="form-kamar" className="grid grid-cols-2 gap-4" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        <SelectField label="Hotel" className="col-span-2" value={nilai.hotel_id} onChange={(event) => ubah("hotel_id", event.target.value)}>
          {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
        </SelectField>
        <TextField label="Nomor kamar" placeholder="mis. 1208" autoFocus value={nilai.room_number} onChange={(event) => ubah("room_number", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Kapasitas" type="number" inputMode="numeric" min={1} max={20} value={nilai.capacity} error={nilai.capacity ? galatKapasitas : undefined} onChange={(event) => ubah("capacity", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Tipe kamar" optional placeholder="mis. Twin, Deluxe" value={nilai.room_type} onChange={(event) => ubah("room_type", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Lantai" optional value={nilai.floor} onChange={(event) => ubah("floor", event.target.value)} className="max-sm:col-span-2" />
        <TextArea label="Catatan panitia" optional rows={2} hint="Tidak tampil ke peserta." value={nilai.notes} onChange={(event) => ubah("notes", event.target.value)} className="col-span-2" />
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
    ? "Check-out harus setelah check-in." : undefined;
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
      title={state?.mode === "ubah" ? `Ubah ${state.hotel.name}` : "Hotel baru"}
      icon={<Buildings size={20} />}
      description="Alamat, peta, dan jam check-in tampil di area peserta."
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={tutup}>Batal</Button>
          <Button simpan type="submit" form="form-hotel" loading={busy} disabled={!sah}>{state?.mode === "ubah" ? "Simpan hotel" : "Tambah hotel"}</Button>
        </>
      }
    >
      <form id="form-hotel" className="grid grid-cols-2 gap-4" onSubmit={(event) => { event.preventDefault(); void kirimForm(); }}>
        <TextField label="Nama hotel" autoFocus value={nilai.name} onChange={(event) => ubah("name", event.target.value)} className="col-span-2" />
        <TextArea label="Alamat" optional rows={2} value={nilai.address} onChange={(event) => ubah("address", event.target.value)} className="col-span-2" />
        <TextField label="Tautan peta" optional type="url" placeholder="https://maps.app.goo.gl/..." value={nilai.map_url} onChange={(event) => ubah("map_url", event.target.value)} className="col-span-2" />
        <TextField label="Check-in" optional type="datetime-local" value={nilai.check_in_at} onChange={(event) => ubah("check_in_at", event.target.value)} className="max-sm:col-span-2" />
        <TextField label="Check-out" optional type="datetime-local" value={nilai.check_out_at} error={galatTanggal} onChange={(event) => ubah("check_out_at", event.target.value)} className="max-sm:col-span-2" />
      </form>
    </Dialog>
  );
}
