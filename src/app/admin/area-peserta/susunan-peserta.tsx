"use client";

import { DotsSixVertical, Eye, EyeSlash } from "@phosphor-icons/react";
import { useState } from "react";
import { cx } from "@/lib/m3/cx";

// PROTOTYPE (mockup): susunan Beranda halaman peserta, pola yang sama dengan Page sections.
type Baris = { id: string; judul: string; sub: string; tampil: boolean; blok?: boolean };

const AWAL: Baris[] = [
  { id: "announcements", judul: "Announcements", sub: "Built-in · latest announcement", tampil: true },
  { id: "next", judul: "Next up", sub: "Built-in · from the Agenda", tampil: true },
  { id: "logistics", judul: "Bus and room", sub: "Built-in · from Logistics", tampil: true },
  { id: "roommates", judul: "Roommates", sub: "Built-in · from Logistics", tampil: true },
  { id: "blk_rute", judul: "Directions", sub: "Block · Tentrem → Hyatt · also on the Event page", tampil: true, blok: true },
  { id: "agenda", judul: "Today's agenda", sub: "Built-in · from the Agenda", tampil: true },
  { id: "quick", judul: "Quick links", sub: "Built-in · ticket, map, staff", tampil: true },
];

export function SusunanPeserta() {
  const [baris, setBaris] = useState(AWAL);
  return (
    <div className="flex flex-col gap-2">
      <ol className="overflow-hidden rounded-lg border border-outline-variant">
        {baris.map((b, index) => (
          <li key={b.id} className={cx("flex min-h-14 items-center gap-3 border-b border-outline-variant px-2 last:border-b-0", b.blok && "bg-primary-soft")}>
            <DotsSixVertical size={18} aria-hidden className="shrink-0 cursor-grab text-on-surface-variant" />
            <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-md text-label-large font-semibold tabular-nums", b.tampil ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant")}>{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className={cx("block text-body-medium font-medium", b.tampil ? "text-on-surface" : "text-on-surface-variant")}>{b.judul}</span>
              <span className="block truncate text-body-small text-on-surface-variant">{b.sub}{b.tampil ? "" : " · hidden"}</span>
            </span>
            <button type="button" aria-label={b.tampil ? `Hide ${b.judul}` : `Show ${b.judul}`} onClick={() => setBaris((all) => all.map((x) => (x.id === b.id ? { ...x, tampil: !x.tampil } : x)))} className="m3-state flex size-9 items-center justify-center rounded-md text-on-surface-variant">
              {b.tampil ? <Eye size={18} /> : <EyeSlash size={18} />}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-body-small text-on-surface-variant">Phones show this order top to bottom. Wide screens keep the same order, with Bus and room, Roommates and Quick links in the right column.</p>
    </div>
  );
}
