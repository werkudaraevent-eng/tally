"use client";

import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, IconButton, Popover, POPOVER_ITEM, usePopoverAnchor } from "@/components/m3";
import { EVENT_STATUS_LABEL, ROLE_LABEL } from "@/lib/domain";
import { cx } from "@/lib/m3/cx";

export type EventRole = "admin" | "booth" | "cashier" | "scanner";
export type AksesBaris = { event_id: string; role: EventRole; booth_id: number | null };
export type AcaraPilihan = { id: string; slug: string; name: string; status: string };
export type BoothPilihan = { id: number; code: string; name: string };
export type DaftarBooth = Record<string, BoothPilihan[] | "loading" | "error">;

const PERAN_ACARA: EventRole[] = ["admin", "booth", "cashier", "scanner"];

const SELECT =
  "h-9 min-w-0 rounded-md border border-outline bg-surface px-2 text-body-medium text-on-surface focus:border-primary";

/**
 * Akses per acara sebagai BARIS, satu baris per acara: nama acara, lalu peran
 * dan (untuk Booth staff) booth di acara itu.
 *
 * Pola yang sama dengan "Assign project roles" di Vercel dan baris peran IAM di
 * Google Cloud: yang ditambahkan adalah penugasan, bukan centang di daftar semua
 * acara. Daftar centang membuat orang memindai SEMUA acara milik semua klien
 * untuk memberi akses ke satu acara, dan memisahkan peran dari acaranya.
 *
 * Acara ditambahkan lewat menu bercari, yang hanya menawarkan acara yang belum
 * punya baris; satu acara tidak bisa muncul dua kali karena kunci tabelnya
 * (user_id, event_id).
 */
export function AksesAcaraEditor({
  rows,
  onChange,
  events,
  booths,
  onNeedBooths,
}: {
  rows: AksesBaris[];
  onChange: (rows: AksesBaris[]) => void;
  events: AcaraPilihan[];
  booths: DaftarBooth;
  onNeedBooths: (event: AcaraPilihan) => void;
}) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const [cari, setCari] = useState("");

  const sudah = new Set(rows.map((row) => row.event_id));
  const tersisa = events.filter((event) => !sudah.has(event.id));
  const kata = cari.trim().toLowerCase();
  const tawaran = kata ? tersisa.filter((event) => event.name.toLowerCase().includes(kata)) : tersisa;

  function ubah(index: number, patch: Partial<AksesBaris>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    const row = next[index];
    if (patch.role && patch.role !== "booth") row.booth_id = null;
    if (patch.role === "booth") {
      const event = events.find((item) => item.id === row.event_id);
      if (event) onNeedBooths(event);
    }
    onChange(next);
  }

  function tambah(event: AcaraPilihan) {
    // Peran baris baru mengikuti baris terakhir: akun yang sama hampir selalu
    // memegang peran yang sama di acara berikutnya.
    const role = rows.at(-1)?.role ?? "admin";
    if (role === "booth") onNeedBooths(event);
    onChange([...rows, { event_id: event.id, role, booth_id: null }]);
    setCari("");
    menu.tutup();
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
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <select
                    aria-label={`Role at ${event?.name ?? "this event"}`}
                    className={SELECT}
                    value={row.role}
                    onChange={(change) => ubah(index, { role: change.target.value as EventRole })}
                  >
                    {PERAN_ACARA.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                  </select>
                  {row.role === "booth" ? (
                    daftar === "loading" || daftar === undefined ? (
                      <span className="self-center text-body-small text-on-surface-variant">Loading booths…</span>
                    ) : daftar === "error" ? (
                      <span className="self-center text-body-small text-error">Booths could not be loaded.</span>
                    ) : daftar.length === 0 ? (
                      <span className="self-center text-body-small text-error">No booths at this event yet.</span>
                    ) : (
                      <select
                        aria-label={`Booth at ${event?.name ?? "this event"}`}
                        className={cx(SELECT, !row.booth_id && "border-error text-on-surface-variant")}
                        value={row.booth_id ?? ""}
                        onChange={(change) => ubah(index, { booth_id: change.target.value ? Number(change.target.value) : null })}
                      >
                        <option value="">Choose a booth</option>
                        {daftar.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
                      </select>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <Button
          ref={setPemicu}
          type="button"
          variant="outlined"
          size="sm"
          icon={<Plus size={16} weight="bold" />}
          disabled={tersisa.length === 0}
          onClick={() => menu.toggle()}
          aria-expanded={menu.open}
          aria-haspopup="dialog"
        >
          Add event
        </Button>
      </div>
      {menu.open ? (
        <Popover anchor={menu} label="Add event" role="dialog" align="start" width={340}>
          <div className="p-2">
            <label className="flex h-9 items-center gap-2 rounded-md border border-outline px-2 focus-within:border-primary">
              <MagnifyingGlass size={16} className="shrink-0 text-on-surface-variant" />
              <input
                autoFocus
                value={cari}
                onChange={(change) => setCari(change.target.value)}
                placeholder="Search events"
                aria-label="Search events"
                className="min-w-0 flex-1 bg-transparent text-body-medium outline-none"
              />
            </label>
          </div>
          <div className="max-h-64 overflow-y-auto pb-1">
            {tawaran.length === 0 ? (
              <p className="px-4 py-3 text-body-medium text-on-surface-variant">No matching events.</p>
            ) : tawaran.map((event) => (
              <button key={event.id} type="button" className={POPOVER_ITEM} onClick={() => tambah(event)}>
                <span className="min-w-0 flex-1 truncate text-left">{event.name}</span>
                <span className="shrink-0 text-body-small text-on-surface-variant">
                  {EVENT_STATUS_LABEL[event.status as keyof typeof EVENT_STATUS_LABEL] ?? event.status}
                </span>
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
