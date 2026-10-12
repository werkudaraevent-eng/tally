"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { IconButton, SegmentedButton, SelectField, TextArea, TextField } from "@/components/m3";
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
} from "@/lib/domain";
import { eventApiPath } from "@/lib/event-url";
import { PilihIkonKartu, type WarnaUbin } from "./pilih-ikon";

const UBIN: WarnaUbin = { button: { latar: "#E6F2EC", teks: "#00603C" }, brand: { latar: "#E8ECF4", teks: "#1B2D57" }, accent: { latar: "#FBF3DF", teks: "#7A5A00" } };

type Hotel = { id: number; name: string; address: string | null };

/** Halaman tempat blok tampil. Hanya untuk jenis di LANDING_BLOCK_MEMBER_TYPES. */
export function TampilDi({ block, ubah }: { block: LandingBlock; ubah: (patch: Partial<LandingBlock>) => void }) {
  const nilai = block.show_on ?? "public";
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-body-medium font-medium text-on-surface">Show on</p>
      <SegmentedButton<LandingBlockShowOn>
        label="Show on"
        value={nilai}
        onChange={(show_on) => ubah({ show_on: show_on === "public" ? undefined : show_on })}
        options={LANDING_BLOCK_SHOW_ON.map((value) => ({ value, label: LANDING_BLOCK_SHOW_ON_LABELS[value] }))}
      />
      <p className="text-body-small text-on-surface-variant">
        {nilai === "public"
          ? "Everyone who opens the Event page sees it."
          : nilai === "member"
            ? "Only signed-in participants see it, on their own page, above today\u2019s schedule."
            : "On the Event page and on the participant's own page."}
      </p>
    </div>
  );
}

function Titik({ label, stop, hotels, onChange }: { label: string; stop: LandingRouteStop | undefined; hotels: Hotel[]; onChange: (stop: LandingRouteStop) => void }) {
  const pilihan = stop?.hotel_id ? String(stop.hotel_id) : stop?.name !== undefined ? "lain" : "";
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-outline-variant p-3">
      <SelectField
        label={label}
        value={pilihan}
        hint={hotels.length ? "Hotels come from Logistics; the address stays in sync." : "No hotels in Logistics yet. Type a place below."}
        onChange={(event) => onChange(event.target.value === "lain" ? { name: "" } : { hotel_id: Number(event.target.value) })}
      >
        <option value="" disabled>Choose a place</option>
        {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
        <option value="lain">Another place…</option>
      </SelectField>
      {pilihan === "lain" ? (
        <>
          <TextField label="Place name" placeholder="e.g. Stasiun Tugu" value={stop?.name ?? ""} onChange={(event) => onChange({ ...stop, name: event.target.value })} />
          <TextField label="Address" optional hint="Used for the Maps link." value={stop?.address ?? ""} onChange={(event) => onChange({ ...stop, address: event.target.value })} />
        </>
      ) : pilihan ? (
        <p className="text-body-small text-on-surface-variant">{hotels.find((h) => String(h.id) === pilihan)?.address}</p>
      ) : null}
    </div>
  );
}

export function EditorRute({ block, ubah, judul, alis, semuaBlok }: { block: LandingBlock; ubah: (patch: Partial<LandingBlock>) => void; judul: React.ReactNode; alis: React.ReactNode; semuaBlok: LandingBlock[] }) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  useEffect(() => {
    void fetch(eventApiPath("/api/admin/logistik"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { hotels?: Hotel[] } | null) => setHotels(data?.hotels ?? []))
      .catch(() => {});
  }, []);
  const items = block.items ?? [];
  const ubahItem = (index: number, patch: Partial<LandingBlockItem>) => ubah({ items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  // Saran = nama cara yang sudah ditulis di blok Rute acara ini (bukan daftar di kode).
  const saran = [...new Set((semuaBlok).filter((b) => b.type === "route").flatMap((b) => (b.items ?? []).map((i) => i.label?.trim() ?? "")).filter(Boolean))];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Titik label="From" stop={block.route_from} hotels={hotels} onChange={(route_from) => ubah({ route_from })} />
        <Titik label="To" stop={block.route_to} hotels={hotels} onChange={(route_to) => ubah({ route_to })} />
      </div>
      {alis}
      {judul}
      <div className="flex flex-col gap-2">
        <p className="text-body-medium font-medium text-on-surface">Ways to get there</p>
        <datalist id={`saran-${block.id}`}>{saran.map((s) => <option key={s} value={s} />)}</datalist>
        {items.map((item, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_112px] gap-x-2 gap-y-3 rounded-lg border border-outline-variant p-3">
            <div className="flex items-start justify-between gap-2 col-span-2">
              <PilihIkonKartu
                nomor={index + 1}
                ikon={item.icon ?? "Car"}
                nada="brand"
                bawaan={!item.icon}
                warna={UBIN}
                gambar={null}
                onChange={(x) => ubahItem(index, { icon: x?.icon })}
              />
              <IconButton label="Remove" onClick={() => ubah({ items: items.filter((_, i) => i !== index) })}><Trash size={16} /></IconButton>
            </div>
            <TextField label="Name" list={`saran-${block.id}`} placeholder="e.g. Jalan kaki lewat jembatan" value={item.label ?? ""} onChange={(event) => ubahItem(index, { label: event.target.value })} />
            <TextField label="Time" optional placeholder="± 5 menit" value={item.value ?? ""} onChange={(event) => ubahItem(index, { value: event.target.value })} />
            <TextArea className="col-span-2" rows={2} label="Note" optional value={item.body ?? ""} onChange={(event) => ubahItem(index, { body: event.target.value })} />
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
          <button type="button" onClick={() => ubah({ items: [...items, {}] })} className="m3-state inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-2 text-label-large font-semibold text-primary">
            <Plus size={16} aria-hidden /> Add a way
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-body-medium font-medium text-on-surface">Route in Google Maps</p>
        <SegmentedButton<LandingRouteMapsMode>
          label="Route in Google Maps"
          value={block.maps_mode ?? "driving"}
          onChange={(maps_mode) => ubah({ maps_mode })}
          options={LANDING_ROUTE_MAPS_MODES.map((value) => ({ value, label: LANDING_ROUTE_MAPS_MODE_LABELS[value] }))}
        />
        <p className="text-body-small text-on-surface-variant">How Google Maps draws the route when a participant taps the button.</p>
      </div>
      <TextArea label="Steps" optional rows={4} hint="One step per line. Shown numbered." value={block.body ?? ""} onChange={(event) => ubah({ body: event.target.value })} />
      <p className="text-body-small text-on-surface-variant">The &ldquo;Open route in Google Maps&rdquo; button is built from the two addresses.</p>
    </div>
  );
}
