"use client";

import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { useId, useState, type KeyboardEvent } from "react";
import { Button, IconButton, Popover, POPOVER_ITEM, usePopoverAnchor } from "@/components/m3";
import { EVENT_STATUS_LABEL } from "@/lib/domain";
import { cx } from "@/lib/m3/cx";

export type EventRole = "admin" | "booth" | "cashier" | "scanner";
export type AksesBaris = { event_id: string; booth_id: number | null };
export type AcaraPilihan = { id: string; slug: string; name: string; status: string };
export type BoothPilihan = { id: number; code: string; name: string };
export type DaftarBooth = Record<string, BoothPilihan[] | "loading" | "error">;

const SELECT =
  "h-9 min-w-0 rounded-md border border-outline bg-surface px-2 text-body-medium text-on-surface focus:border-primary";

/**
 * Akses per acara sebagai BARIS, satu baris per acara: nama acara, dan untuk
 * Booth staff booth-nya di acara itu. Perannya satu untuk seluruh akun (dipilih
 * di atas daftar ini), karena peran global juga menentukan layar tujuan setelah
 * masuk; peran berbeda per acara membuat keduanya bisa tidak sejalan.
 *
 * Pola penugasan seperti "Assign projects" di Vercel dan "Add to team" di
 * GitHub: yang ditambahkan adalah acara tempat orang ini bekerja, lewat menu
 * bercari, bukan centang di daftar SEMUA acara milik semua klien.
 *
 * Acara ditambahkan lewat menu bercari, yang hanya menawarkan acara yang belum
 * punya baris; satu acara tidak bisa muncul dua kali karena kunci tabelnya
 * (user_id, event_id).
 */
export function AksesAcaraEditor({
  rows,
  role,
  onChange,
  events,
  booths,
  onNeedBooths,
}: {
  rows: AksesBaris[];
  role: EventRole;
  onChange: (rows: AksesBaris[]) => void;
  events: AcaraPilihan[];
  booths: DaftarBooth;
  onNeedBooths: (event: AcaraPilihan) => void;
}) {
  const [pemicu, setPemicu] = useState<HTMLSpanElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const [cari, setCari] = useState("");
  const [sorot, setSorot] = useState(0);
  const idDaftar = useId();

  const sudah = new Set(rows.map((row) => row.event_id));
  const tersisa = events.filter((event) => !sudah.has(event.id));
  const kata = cari.trim().toLowerCase();
  const tawaran = kata ? tersisa.filter((event) => event.name.toLowerCase().includes(kata)) : tersisa;

  function setBooth(index: number, booth_id: number | null) {
    onChange(rows.map((row, i) => (i === index ? { ...row, booth_id } : row)));
  }

  function tambah(event: AcaraPilihan) {
    if (role === "booth") onNeedBooths(event);
    onChange([...rows, { event_id: event.id, booth_id: null }]);
    setCari("");
    setSorot(0);
    menu.tutup();
    menu.fokus();
  }

  // Combobox ARIA 1.2: fokus tetap di kolom cari, panah memindah sorotan di
  // daftar, Enter memilih yang disorot, Esc menutup (ditangani Popover).
  function tombol(peristiwa: KeyboardEvent<HTMLInputElement>) {
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      peristiwa.preventDefault();
      if (tawaran.length === 0) return;
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((sekarang) => (sekarang + arah + tawaran.length) % tawaran.length);
    } else if (peristiwa.key === "Enter") {
      peristiwa.preventDefault();
      const pilihan = tawaran[Math.min(sorot, tawaran.length - 1)];
      if (pilihan) tambah(pilihan);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-outline-variant px-3 py-3 text-body-medium text-on-surface-variant">
          No events yet. Add the events this person works at.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const event = events.find((item) => item.id === row.event_id);
            const daftar = booths[row.event_id];
            return (
              <li key={row.event_id} className="rounded-lg border border-outline-variant px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-body-medium font-medium text-on-surface">{event?.name ?? "Archived event"}</span>
                  {event ? (
                    <span className="shrink-0 text-body-small text-on-surface-variant">
                      {EVENT_STATUS_LABEL[event.status as keyof typeof EVENT_STATUS_LABEL] ?? event.status}
                    </span>
                  ) : null}
                  <IconButton size="sm" label={`Remove ${event?.name ?? "event"}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                    <X size={16} />
                  </IconButton>
                </div>
                {role === "booth" ? (
                  <div className="mt-1.5">
                    {daftar === "loading" || daftar === undefined ? (
                      <span className="text-body-small text-on-surface-variant">Loading booths…</span>
                    ) : daftar === "error" ? (
                      <span className="text-body-small text-error">Booths could not be loaded.</span>
                    ) : daftar.length === 0 ? (
                      <span className="text-body-small text-error">No booths at this event yet. Add one in Booths &amp; items first.</span>
                    ) : (
                      <select
                        aria-label={`Booth at ${event?.name ?? "this event"}`}
                        aria-invalid={!row.booth_id}
                        aria-describedby={!row.booth_id ? `${idDaftar}-booth-${index}` : undefined}
                        className={cx(SELECT, "w-full", !row.booth_id && "border-error text-on-surface-variant")}
                        value={row.booth_id ?? ""}
                        onChange={(change) => setBooth(index, change.target.value ? Number(change.target.value) : null)}
                      >
                        <option value="">Choose a booth</option>
                        {daftar.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
                      </select>
                    )}
                    {row.booth_id || !Array.isArray(daftar) || daftar.length === 0 ? null : (
                      <p id={`${idDaftar}-booth-${index}`} className="mt-1 text-body-small text-error">Choose their booth at this event.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span ref={setPemicu} className="inline-flex">
          <Button
            type="button"
            variant="outlined"
            size="sm"
            icon={<Plus size={16} weight="bold" />}
            disabled={tersisa.length === 0}
            onClick={() => { setSorot(0); menu.toggle(); }}
            aria-expanded={menu.open}
            aria-haspopup="dialog"
          >
            Add event
          </Button>
        </span>
        {tersisa.length === 0 && events.length > 0 ? (
          <span className="text-body-small text-on-surface-variant">Every event is already added.</span>
        ) : null}
      </div>
      {menu.open ? (
        <Popover anchor={menu} label="Add event" role="dialog" align="start" width={340}>
          <div className="p-2">
            <label className="flex h-9 items-center gap-2 rounded-md border border-outline px-2 focus-within:border-primary">
              <MagnifyingGlass size={16} className="shrink-0 text-on-surface-variant" />
              <input
                autoFocus
                role="combobox"
                aria-expanded
                aria-controls={idDaftar}
                aria-autocomplete="list"
                aria-activedescendant={tawaran.length > 0 ? `${idDaftar}-${Math.min(sorot, tawaran.length - 1)}` : undefined}
                value={cari}
                onChange={(change) => { setCari(change.target.value); setSorot(0); }}
                onKeyDown={tombol}
                placeholder="Search events"
                aria-label="Search events"
                className="min-w-0 flex-1 bg-transparent text-body-medium outline-none"
              />
            </label>
          </div>
          <p role="status" className="sr-only">{tawaran.length === 1 ? "1 event" : `${tawaran.length} events`}</p>
          <ul id={idDaftar} role="listbox" aria-label="Events" className="max-h-64 overflow-y-auto pb-1">
            {tawaran.length === 0 ? (
              <li role="presentation" className="px-4 py-3 text-body-medium text-on-surface-variant">No matching events.</li>
            ) : tawaran.map((event, index) => {
              const aktif = index === Math.min(sorot, tawaran.length - 1);
              return (
                <li
                  key={event.id}
                  id={`${idDaftar}-${index}`}
                  role="option"
                  aria-selected={aktif}
                  onMouseDown={(klik) => klik.preventDefault()}
                  onMouseEnter={() => setSorot(index)}
                  onClick={() => tambah(event)}
                  className={cx(POPOVER_ITEM, "cursor-pointer", aktif && "bg-primary-soft")}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{event.name}</span>
                  <span className="shrink-0 text-body-small text-on-surface-variant">
                    {EVENT_STATUS_LABEL[event.status as keyof typeof EVENT_STATUS_LABEL] ?? event.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </Popover>
      ) : null}
    </div>
  );
}
