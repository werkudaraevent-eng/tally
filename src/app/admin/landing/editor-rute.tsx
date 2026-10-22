"use client";

import { ArrowDown, ArrowSquareOut, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import Link from "@/components/event-link";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { Button, FilterChip, IconButton, SegmentedButton, SelectField, SelectMenu, Switch, TextArea, TextField } from "@/components/m3";
import { PilihBarisAgenda, useAgendaTrip } from "@/components/admin/logistik/pilih-baris-agenda";
import {
  LANDING_BLOCK_SHOW_ON,
  LANDING_BLOCK_SHOW_ON_LABELS,
  LANDING_ROUTE_MAPS_MODES,
  LANDING_ROUTE_MAPS_MODE_LABELS,
  type LandingBlock,
  type LandingBlockItem,
  type LandingBlockShowOn,
  type LandingRouteMapsMode,
  type LandingRouteStop,
  landingBlockLimits,
} from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import type { KolomSasaran } from "@/lib/sasaran-bagian";
import { bacaSasaranBlok, bacaTautanAgenda, KOLOM_HOTEL, samaJawaban, TAUTAN_AGENDA_MAX } from "@/lib/sasaran-blok";
import { PilihIkonKartu, type WarnaUbin } from "./pilih-ikon";

/** Cadangan bila editor tidak diberi warna tema (mis. sebelum tema dimuat). */
const UBIN_CADANGAN: WarnaUbin = { button: { latar: "#E6F2EC", teks: "#00603C" }, brand: { latar: "#E8ECF4", teks: "#1B2D57" }, accent: { latar: "#FBF3DF", teks: "#7A5A00" } };

type Hotel = { id: number; name: string; address: string | null };

/** Halaman tempat blok tampil, untuk semua jenis di LANDING_BLOCK_MEMBER_TYPES. */
export function TampilDi({ block, ubah }: { block: LandingBlock; ubah: (patch: Partial<LandingBlock>) => void }) {
  const nilai = block.show_on ?? "public";
  // Halaman acara tidak punya peserta yang masuk: kelompok dan tautan Agenda
  // dilepas saat pindah ke sana, supaya blok tidak hilang dari semua halaman.
  const [dilepas, setDilepas] = useState(false);
  const lepas = { audience: undefined, agenda_item_ids: undefined };
  // Blok lama yang tersimpan publik dengan kelompok: tidak tampil di mana pun.
  const sisaKelompok = nilai === "public" && block.audience !== undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-body-medium font-medium text-on-surface">Show on</p>
      <SegmentedButton<LandingBlockShowOn>
        label="Show on"
        value={nilai}
        onChange={(show_on) => {
          const keLepas = show_on === "public" && (block.audience !== undefined || block.agenda_item_ids !== undefined);
          setDilepas(keLepas);
          ubah(show_on === "public" ? { show_on: undefined, ...(keLepas ? lepas : {}) } : { show_on });
        }}
        options={LANDING_BLOCK_SHOW_ON.map((value) => ({ value, label: LANDING_BLOCK_SHOW_ON_LABELS[value] }))}
      />
      {sisaKelompok ? (
        <div role="status" className="flex flex-col items-start gap-2 rounded-md bg-error-container px-3 py-2 text-body-medium text-on-error-container">
          <p>Shown nowhere: it still has a participant group, and the Event page has no signed-in participants. Remove the group so everyone sees it, or choose Participant page.</p>
          <Button variant="outlined" size="sm" onClick={() => { setDilepas(true); ubah(lepas); }}>Remove group</Button>
        </div>
      ) : null}
      <p className="text-body-small text-on-surface-variant">
        {nilai === "public" ? (
          sisaKelompok ? null : dilepas ? "Everyone who opens the Event page sees it. Its group and linked agenda rows were removed, because the Event page has no signed-in participants." : "Everyone who opens the Event page sees it."
        ) : (
          <>
            {nilai === "member" ? "Only signed-in participants see it, on their own page. Move or hide it in " : "On the Event page and on the participant\u2019s own page. Its place there is set in "}
            <Link href="/admin/area-peserta" className="rounded-sm font-medium text-primary hover:underline">Participant area › Participant home</Link>.
          </>
        )}
      </p>
    </div>
  );
}

function Titik({ label, stop, hotels, onChange }: { label: string; stop: LandingRouteStop | undefined; hotels: Hotel[] | null; onChange: (stop: LandingRouteStop) => void }) {
  // Hotel yang sudah dihapus dari Logistik: blok tidak tampil sampai tempatnya dipilih lagi.
  const hilang = Boolean(stop?.hotel_id && hotels && !hotels.some((hotel) => hotel.id === stop.hotel_id));
  const pilihan = stop?.hotel_id ? (hilang ? "" : String(stop.hotel_id)) : stop?.name !== undefined ? "lain" : "";
  const daftar = hotels ?? [];
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-outline-variant p-3">
      <SelectField
        label={label}
        value={pilihan}
        error={hilang ? "This hotel was removed from Logistics. Choose a place again; the block is hidden until you do." : undefined}
        hint={hilang ? undefined : daftar.length ? "Hotels come from Logistics; the address stays in sync." : "No hotels in Logistics yet. Choose Another place."}
        onChange={(event) => onChange(event.target.value === "lain" ? { name: "" } : { hotel_id: Number(event.target.value) })}
      >
        <option value="" disabled>Choose a place</option>
        {daftar.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
        <option value="lain">Another place…</option>
      </SelectField>
      {pilihan === "lain" ? (
        <>
          <TextField label="Place name" placeholder="e.g. Stasiun Tugu" value={stop?.name ?? ""} onChange={(event) => onChange({ ...stop, name: event.target.value })} />
          <TextField label="Address" optional hint="Used for the Maps link." value={stop?.address ?? ""} onChange={(event) => onChange({ ...stop, address: event.target.value })} />
        </>
      ) : pilihan ? (
        <p className="text-body-small text-on-surface-variant">{daftar.find((h) => String(h.id) === pilihan)?.address}</p>
      ) : null}
    </div>
  );
}

export function EditorRute({
  block,
  ubah,
  judul,
  alis,
  semuaBlok,
  ubin,
}: {
  block: LandingBlock;
  ubah: (patch: Partial<LandingBlock>) => void;
  judul: React.ReactNode;
  alis: React.ReactNode;
  semuaBlok: LandingBlock[];
  /** Warna ubin dari tema acara, sama dengan halaman publik. */
  ubin?: { warna: WarnaUbin; tanpaWarna: boolean };
}) {
  // null = belum dimuat: jangan tandai hotel sebagai terhapus sebelum daftarnya ada.
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  // Gagal memuat: pemilih Who sees it tetap jalan tanpa kolom Hotel, bukan "Loading" selamanya.
  const [hotelGagal, setHotelGagal] = useState(false);
  useEffect(() => {
    void fetch(eventApiPath("/api/admin/logistik"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { hotels?: Hotel[] } | null) => { if (data?.hotels) setHotels(data.hotels); else setHotelGagal(true); })
      .catch(() => setHotelGagal(true));
  }, []);
  const items = block.items ?? [];
  // Kunci tetap per cara (hanya di layar ini, tidak disimpan): fokus dan unggahan
  // foto yang sedang berjalan ikut cara yang dipindah, bukan tertinggal di nomornya.
  const nomorKunci = useRef(0);
  const [kunci, setKunci] = useState<string[]>(() => items.map((_, index) => `cara-${index}`));
  const kunciCara = items.map((_, index) => kunci[index] ?? `cara-lebih-${index}`);
  const ubahItem = (index: number, patch: Partial<LandingBlockItem>) => ubah({ items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const geser = (index: number, ke: number, tombol: "naik" | "turun") => {
    const next = [...items];
    [next[index], next[ke]] = [next[ke], next[index]];
    const kunciBaru = [...kunciCara];
    [kunciBaru[index], kunciBaru[ke]] = [kunciBaru[ke], kunciBaru[index]];
    setKunci(kunciBaru);
    ubah({ items: next });
    // Fokus ikut caranya; di ujung daftar tombol yang sama nonaktif, jadi pakai arah sebaliknya.
    const ujung = tombol === "naik" ? ke === 0 : ke === items.length - 1;
    const arah = ujung ? (tombol === "naik" ? "turun" : "naik") : tombol;
    window.requestAnimationFrame(() => document.getElementById(`${block.id}-${kunciBaru[ke]}-${arah}`)?.focus());
  };
  const hapus = (index: number) => {
    setKunci(kunciCara.filter((_, i) => i !== index));
    ubah({ items: items.filter((_, i) => i !== index) });
  };
  const tambah = () => {
    nomorKunci.current += 1;
    setKunci([...kunciCara, `cara-baru-${nomorKunci.current}`]);
    ubah({ items: [...items, {}] });
  };
  // Saran = nama cara yang sudah ditulis di blok Rute acara ini (bukan daftar di kode).
  const batasLangkah = landingBlockLimits(block).item?.body?.max;
  const saran = [...new Set(semuaBlok.filter((b) => b.type === "route").flatMap((b) => (b.items ?? []).map((i) => i.label?.trim() ?? "")).filter(Boolean))];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Titik label="From" stop={block.route_from} hotels={hotels} onChange={(route_from) => ubah({ route_from })} />
        <Titik label="To" stop={block.route_to} hotels={hotels} onChange={(route_to) => ubah({ route_to })} />
      </div>
      <DiHalamanPeserta block={block} ubah={ubah} hotels={hotels} hotelGagal={hotelGagal} />
      {alis}
      {judul}
      <div className="flex flex-col gap-2">
        <p className="text-body-medium font-medium text-on-surface">Ways to get there</p>
        <datalist id={`saran-${block.id}`}>{saran.map((s) => <option key={s} value={s} />)}</datalist>
        {items.map((item, index) => (
          <div key={kunciCara[index]} className="grid grid-cols-[minmax(0,1fr)_112px] gap-x-2 gap-y-3 rounded-lg border border-outline-variant p-3">
            <div className="flex items-start justify-between gap-2 col-span-2">
              <PilihIkonKartu
                nomor={index + 1}
                ikon={item.icon ?? "Car"}
                nada={item.tone ?? "brand"}
                bawaan={!item.icon && !item.tone && !item.icon_url}
                warna={ubin?.warna ?? UBIN_CADANGAN}
                tanpaWarna={ubin?.tanpaWarna ?? false}
                gambar={item.icon_url?.trim() || null}
                // Picker mengirim sebagian (ikon, warna ubin, atau gambar sendiri); null = kembali ke bawaan.
                onChange={(x) => ubahItem(index, x ?? { icon: undefined, tone: undefined, icon_url: undefined })}
              />
              <div className="flex items-center gap-1">
                <IconButton id={`${block.id}-${kunciCara[index]}-naik`} label={`Move way ${index + 1} up`} disabled={index === 0} onClick={() => geser(index, index - 1, "naik")}><ArrowUp size={16} /></IconButton>
                <IconButton id={`${block.id}-${kunciCara[index]}-turun`} label={`Move way ${index + 1} down`} disabled={index === items.length - 1} onClick={() => geser(index, index + 1, "turun")}><ArrowDown size={16} /></IconButton>
                <IconButton label={`Remove way ${index + 1}`} onClick={() => hapus(index)}><Trash size={16} /></IconButton>
              </div>
            </div>
            <TextField label="Name" list={`saran-${block.id}`} placeholder="e.g. Jalan kaki lewat jembatan" value={item.label ?? ""} onChange={(event) => ubahItem(index, { label: event.target.value })} />
            <TextField label="Time" optional placeholder="± 5 menit" value={item.value ?? ""} onChange={(event) => ubahItem(index, { value: event.target.value })} />
            <TextArea
              className="col-span-2"
              rows={4}
              label="Steps"
              optional
              placeholder={"Lift di samping resepsionis ke Lt. 2\nKeluar lift, belok kiri\nBallroom di ujung lorong"}
              hint="One step per line, shown numbered under this way. A single line shows as a short note."
              maxLength={batasLangkah}
              counter
              value={item.body ?? ""}
              onChange={(event) => ubahItem(index, { body: event.target.value })}
            />
            <div className="col-span-2">
              <ImageUploadField
                label="Landmark photo"
                hint="Optional. A photo of what to look for, e.g. the bridge entrance. Landscape works best."
                kind="landing"
                value={item.image_url ?? null}
                onChange={(url) => ubahItem(index, { image_url: url })}
              />
            </div>
          </div>
        ))}
        {items.length < 4 ? (
          <button type="button" onClick={tambah} className="m3-state inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-2 text-label-large font-semibold text-primary">
            <Plus size={16} aria-hidden /> Add a way
          </button>
        ) : null}
      </div>
      {/* Bentuk lama: satu daftar langkah untuk semua cara. Hanya tampil selama masih terisi. */}
      {block.body ? (
        <TextArea
          label="Steps for every way"
          optional
          rows={4}
          hint="From the older layout, shown under all ways. Put steps in each way above instead, then empty this field to remove it."
          value={block.body}
          onChange={(event) => ubah({ body: event.target.value })}
        />
      ) : null}
      <ImageUploadField
        label="Map or floor plan"
        hint="Optional. Shown uncropped under the ways; participants tap it to open full screen. For a route inside a building, a floor plan helps most."
        kind="landing"
        value={block.map_image_url ?? null}
        onChange={(url) => ubah({ map_image_url: url })}
      />
      <div className="flex flex-col gap-3 rounded-lg border border-outline-variant p-3">
        <Switch
          label="Google Maps button"
          description="Opens the route between the two addresses. Turn it off for a route inside one building, e.g. lobby to ballroom."
          checked={block.maps_button !== false}
          onChange={(nyala) => ubah({ maps_button: nyala ? undefined : false })}
        />
        {block.maps_button !== false ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-body-medium font-medium text-on-surface">Travel mode in Google Maps</p>
            <SegmentedButton<LandingRouteMapsMode>
              label="Travel mode in Google Maps"
              value={block.maps_mode ?? "driving"}
              onChange={(maps_mode) => ubah({ maps_mode })}
              options={LANDING_ROUTE_MAPS_MODES.map((value) => ({ value, label: LANDING_ROUTE_MAPS_MODE_LABELS[value] }))}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const TAUTAN = "inline-flex items-center gap-1 self-start rounded-sm text-body-medium font-medium text-primary hover:underline";

/**
 * On the participant page: siapa yang melihat rute ini (src/lib/sasaran-blok.ts)
 * dan baris Agenda yang menautkannya. Pemilihnya sama dengan Agenda > Who it's
 * for: Everyone, atau satu kelompok = satu kolom + jawabannya. Kolomnya
 * pertanyaan pilihan peserta, ditambah Hotel bila Logistics punya hotel. Tempat
 * rute di portal diturunkan dari isian ini, ditulis di "Where it appears".
 */
function DiHalamanPeserta({ block, ubah, hotels, hotelGagal }: { block: LandingBlock; ubah: (patch: Partial<LandingBlock>) => void; hotels: Hotel[] | null; hotelGagal: boolean }) {
  // null = belum dimuat. Kolom dan sakelar Horizon dari endpoint Who it's for milik Agenda.
  const [info, setInfo] = useState<{ fields: KolomSasaran[]; horizon: boolean } | null>(null);
  useEffect(() => {
    void fetch(eventApiPath("/api/admin/rundown/sections/sasaran"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { fields?: KolomSasaran[]; horizon?: boolean } | null) => setInfo({ fields: data?.fields ?? [], horizon: data?.horizon === true }))
      .catch(() => setInfo({ fields: [], horizon: false }));
  }, []);
  const horizon = info?.horizon === true;
  const agendaTrip = useAgendaTrip(horizon);
  const sasaran = bacaSasaranBlok(block.audience);
  // Kolom yang dipilih sebelum ada jawaban: hanya di layar ini. Tanpa jawaban,
  // blok tetap untuk semua dan tidak pernah tersimpan setengah jadi.
  const [draf, setDraf] = useState<{ kelompok: boolean; field: string }>({ kelompok: false, field: "" });
  // Show on baru saja dipindah dari Both oleh pilihan One group: disebut sekali di Where it appears.
  const [pindahShowOn, setPindahShowOn] = useState(false);
  const kelompok = Boolean(sasaran) || draf.kelompok;
  const field = sasaran?.field ?? draf.field;
  const daftarHotel = hotels ?? [];
  // `menu` untuk daftar pilihan, `label` untuk kalimat Where it appears (tanpa penanda staf).
  const kolom: Array<{ key: string; label: string; menu: string; options: Array<{ value: string; label: string }> }> = [
    ...(daftarHotel.length ? [{ key: KOLOM_HOTEL, label: "hotel", menu: "Hotel (from Logistics)", options: daftarHotel.map((h) => ({ value: String(h.id), label: h.name })) }] : []),
    ...(info?.fields ?? []).map((isi) => ({ key: isi.key, label: isi.label, menu: isi.staff ? `${isi.label} (staff only)` : isi.label, options: isi.options.map((o) => ({ value: o, label: o })) })),
  ];
  const dimuat = info !== null && (hotels !== null || hotelGagal);
  const kolomAktif = kolom.find((isi) => isi.key === field) ?? null;
  // Hotel tidak bisa dimuat: kelompok hotel yang tersimpan belum tentu salah, jadi tidak disebut hilang.
  const hotelHilangKarenaGagal = hotelGagal && field === KOLOM_HOTEL;
  // Kolom tersimpan yang sudah dihapus dari formulir atau hotelnya dari Logistics: blok tersembunyi.
  const hilang = Boolean(sasaran && dimuat && !hotelHilangKarenaGagal && (!kolomAktif || !sasaran.values.some((v) => kolomAktif.options.some((o) => samaJawaban(o.value, v)))));
  const nilai = sasaran?.values ?? [];
  const setNilai = (values: string[]) => {
    if (values.length) { ubah({ audience: { field, values } }); return; }
    setDraf({ kelompok: true, field });
    ubah({ audience: undefined });
  };
  const baris = bacaTautanAgenda(block.agenda_item_ids);
  const lokasi = baris.map((id) => agendaTrip.agenda?.peta.baris.get(id)).filter((isi): isi is NonNullable<typeof isi> => Boolean(isi));
  // Hanya jawaban yang masih ada di pilihan kolomnya, sama dengan portal (blokUntukPeserta).
  const labelNilai = sasaran && kolomAktif ? kolomAktif.options.filter((o) => sasaran.values.some((v) => samaJawaban(o.value, v))).map((o) => o.label) : [];
  const siapa = sasaran && kolomAktif ? `participants whose ${kolomAktif.label} is ${labelNilai.join(" or ")}` : "every signed-in participant";
  // Kelompok butuh peserta yang masuk: tidak pernah di halaman acara publik (landingBlockShownOn).
  const keBoth = Boolean(sasaran) && block.show_on === "both";
  // Horizon: setiap rute menjadi baris di Perjalanan (DaftarRuteRingkas).
  const pindah = horizon;
  const ringkas = (keBoth ? "Not on the Event page, because a group needs a signed-in participant. " : "") + (hotelHilangKarenaGagal && sasaran
    ? "Couldn\u2019t load hotels from Logistics, so this hotel group can\u2019t be shown here. It still applies on the participant page. Reload to try again."
    : hilang
    ? "Nowhere for now: the chosen field or answer no longer exists. Choose again or pick Everyone."
    : `${pindah ? "In Travel, as a row under the hotel, bus and train cards" : "On Home"}, for ${siapa}.${horizon && lokasi.length ? ` ${lokasi.length === 1 ? "The linked agenda row shows" : "The linked agenda rows show"} \u201cCara ke sana\u201d in the schedule.` : ""}${pindah && sasaran?.field !== KOLOM_HOTEL ? " Participants without a hotel, bus or train see it on Home." : ""}`);
  if ((block.show_on ?? "public") === "public") return null;
  return (
    <section aria-labelledby={`${block.id}-peserta`} className="flex flex-col gap-4 rounded-lg border border-outline-variant p-3">
      <div>
        <p id={`${block.id}-peserta`} className="text-title-small font-semibold text-on-surface">On the participant page</p>
        <p className="mt-0.5 text-body-small text-on-surface-variant">Who sees it, and which agenda rows link to it. Tally places it from these.</p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-body-medium font-medium text-on-surface">Who sees it</p>
        <SegmentedButton<"semua" | "kelompok">
          label="Who sees it"
          value={kelompok ? "kelompok" : "semua"}
          onChange={(isi) => {
            setDraf({ kelompok: isi === "kelompok", field: isi === "kelompok" ? field : "" });
            if (isi === "semua") ubah({ audience: undefined });
            // Satu kelompok hanya terlihat oleh peserta yang masuk, jadi Show on ikut menjadi Participant page.
            else if (block.show_on === "both") { setPindahShowOn(true); ubah({ show_on: "member" }); }
          }}
          options={[{ value: "semua", label: "Everyone" }, { value: "kelompok", label: "One group" }]}
        />
        {kelompok ? (
          dimuat && kolom.length === 0 && !hotelHilangKarenaGagal ? (
            <div className="flex flex-col gap-2">
              <p className="text-body-medium text-on-surface-variant">Add a hotel in Logistics, or a dropdown or single-choice participant field such as Batch. It can be staff only.</p>
              <Link href="/admin/registrasi" target="_blank" rel="noreferrer" className={TAUTAN}>
                Edit in Registration <ArrowSquareOut size={14} aria-hidden /><span className="sr-only">(new tab)</span>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-body-medium font-medium text-on-surface">Field</p>
                <SelectMenu<string>
                  label="Field"
                  width="100%"
                  value={kolomAktif ? field : ""}
                  onChange={(isi) => { if (isi && isi !== field) { setDraf({ kelompok: true, field: isi }); ubah({ audience: undefined }); } }}
                  options={[...(kolomAktif ? [] : [{ value: "", label: dimuat ? "Choose a field" : "Loading fields\u2026" }]), ...kolom.map((isi) => ({ value: isi.key, label: isi.menu }))]}
                />
                <p className="text-body-small text-on-surface-variant">Hotels come from Logistics. Other fields are dropdown and single-choice participant fields.</p>
              </div>
              {kolomAktif ? (
                <div className="flex flex-col gap-2">
                  <p id={`${block.id}-jawaban`} className="text-body-medium font-medium text-on-surface">{kolomAktif.key === KOLOM_HOTEL ? "Guests of" : "Answers in this group"}</p>
                  <div role="group" aria-labelledby={`${block.id}-jawaban`} className="flex flex-wrap gap-2">
                    {kolomAktif.options.map((opsi) => {
                      const aktif = nilai.some((v) => samaJawaban(v, opsi.value));
                      return (
                        <FilterChip key={opsi.value} selected={aktif} onClick={() => setNilai(aktif ? nilai.filter((v) => !samaJawaban(v, opsi.value)) : [...nilai, opsi.value])}>
                          {opsi.label}
                        </FilterChip>
                      );
                    })}
                  </div>
                  <p className="text-body-small text-on-surface-variant">
                    {nilai.length === 0
                      ? "Choose at least one. Until then, everyone sees it."
                      : kolomAktif.key === KOLOM_HOTEL
                        ? "Guests of other hotels, and participants without a room, don\u2019t see it. Rooms must be shown to participants in Participant area."
                        : "Participants with another or no answer don\u2019t see it."}
                  </p>
                </div>
              ) : null}
            </>
          )
        ) : null}
      </div>
      {horizon ? (
        <div className="grid grid-cols-2 gap-3">
          {[...baris, ...(baris.length < TAUTAN_AGENDA_MAX ? [null] : [])].map((id, urutan) => (
            <PilihBarisAgenda
              key={id ?? "baru"}
              value={id}
              agendaTrip={agendaTrip}
              dipakai={new Map()}
              teks={{
                label: urutan === 0 ? "Linked agenda row" : "Another agenda row",
                kosong: urutan === 0 ? "e.g. Gala dinner. Participants see \u201cCara ke sana\u201d on that row in their schedule." : "e.g. the same activity for Batch 2.",
                terpilih: "Participants who see this route get \u201cCara ke sana\u201d on this row.",
              }}
              onChange={(isi) => ubah({ agenda_item_ids: kosongkan(isi === null ? baris.filter((x) => x !== id) : id === null ? [...baris, isi] : baris.map((x) => (x === id ? isi : x))) })}
            />
          ))}
        </div>
      ) : null}
      <p role="status" className={`rounded-md px-3 py-2 text-body-medium ${hilang ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface"}`}>
        <span className="font-semibold">Where it appears: </span>
        {pindahShowOn && block.show_on === "member" ? "Show on is now Participant page, because a group needs a signed-in participant. " : ""}
        {ringkas}
      </p>
    </section>
  );
}

/** Daftar kosong tidak disimpan, supaya blok lama tetap sama persis. */
function kosongkan(ids: number[]): number[] | undefined {
  const unik = [...new Set(ids)];
  return unik.length ? unik : undefined;
}
