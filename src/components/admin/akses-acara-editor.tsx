"use client";

import { CaretDown, Check, X } from "@phosphor-icons/react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Popover, POPOVER_ITEM, usePopoverAnchor } from "@/components/m3";
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
 * "Event access" sebagai SATU kolom pilihan ganda dengan chip, seperti kolom To
 * di Gmail atau Labels di Jira: acara terpilih tampil sebagai chip yang bisa
 * dihapus di dalam kolom, dan klik kolom membuka daftar acara bercari dengan
 * tanda centang. Hanung menolak dua bentuk sebelumnya (daftar centang dan baris
 * per acara) karena tidak terasa seperti kolom formulir biasa.
 *
 * Perannya satu untuk seluruh akun (dipilih di atas kolom ini), karena peran
 * global juga menentukan layar tujuan setelah masuk. Untuk Booth staff, booth
 * adalah milik acara, jadi pilihannya muncul sebagai daftar ringkas "Booth per
 * event" di bawah kolom, satu pilihan per acara terpilih.
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
  const [kolom, setKolom] = useState<HTMLDivElement | null>(null);
  const menu = usePopoverAnchor(kolom);
  const masukan = useRef<HTMLInputElement | null>(null);
  const [cari, setCari] = useState("");
  const [sorot, setSorot] = useState(0);
  const id = useId();
  const idDaftar = `${id}-list`;

  const terpilih = new Set(rows.map((row) => row.event_id));
  const kata = cari.trim().toLowerCase();
  const tawaran = kata ? events.filter((event) => event.name.toLowerCase().includes(kata)) : events;
  const nama = (eventId: string) => events.find((event) => event.id === eventId)?.name ?? "Archived event";

  function buka() {
    if (menu.open) return;
    // Layar 588px: kolom digulir ke atas wadahnya dulu, supaya daftar punya
    // ruang terbuka ke bawah dan tidak menutupi Role di atasnya.
    kolom?.scrollIntoView({ block: "start", behavior: "instant" });
    menu.buka();
  }

  function alih(event: AcaraPilihan) {
    if (terpilih.has(event.id)) {
      onChange(rows.filter((row) => row.event_id !== event.id));
    } else {
      if (role === "booth") onNeedBooths(event);
      onChange([...rows, { event_id: event.id, booth_id: null }]);
    }
    setCari("");
    masukan.current?.focus();
    // Chip baru bisa menambah baris kolom; ukur ulang supaya daftar tetap
    // menempel di bawah kolom, tidak menutupinya.
    window.requestAnimationFrame(() => menu.buka());
  }

  function setBooth(eventId: string, booth_id: number | null) {
    onChange(rows.map((row) => (row.event_id === eventId ? { ...row, booth_id } : row)));
  }

  // Combobox ARIA 1.2: fokus tetap di kolom ketik, panah memindah sorotan,
  // Enter mencentang atau melepas yang disorot, Backspace di kolom kosong
  // melepas chip terakhir, Esc menutup (ditangani Popover).
  function tombol(peristiwa: KeyboardEvent<HTMLInputElement>) {
    if (peristiwa.key === "ArrowDown" || peristiwa.key === "ArrowUp") {
      peristiwa.preventDefault();
      buka();
      if (tawaran.length === 0) return;
      const arah = peristiwa.key === "ArrowDown" ? 1 : -1;
      setSorot((sekarang) => (sekarang + arah + tawaran.length) % tawaran.length);
    } else if (peristiwa.key === "Enter") {
      peristiwa.preventDefault();
      const pilihan = menu.open ? tawaran[Math.min(sorot, tawaran.length - 1)] : undefined;
      if (pilihan) alih(pilihan);
      else buka();
    } else if (peristiwa.key === "Escape" && menu.open) {
      // Esc pertama hanya menutup daftar, bukan dialog di sekelilingnya. Dialog
      // mendengar Esc di document, tempat React juga memasang pendengarnya
      // (akar App Router adalah document), jadi stopPropagation tidak cukup:
      // pendengar lain di simpul yang sama harus dihentikan juga.
      peristiwa.preventDefault();
      peristiwa.nativeEvent.stopImmediatePropagation();
      menu.tutup();
    } else if (peristiwa.key === "Backspace" && cari === "" && rows.length > 0) {
      onChange(rows.slice(0, -1));
      if (menu.open) window.requestAnimationFrame(() => menu.buka());
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor={id} className="m3-field-label flex items-baseline gap-2 text-label-large font-semibold text-on-surface">Event access</label>
        <div
          ref={setKolom}
          onClick={() => { masukan.current?.focus(); buka(); }}
          className={cx(
            "mt-1.5 flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border bg-surface-container-lowest py-[3px] pl-1 pr-8 relative transition-[border-color,box-shadow] duration-150",
            menu.open ? "border-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--md-sys-color-primary)_15%,transparent)]" : "border-outline",
          )}
        >
          {rows.map((row) => (
            <span key={row.event_id} className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-outline-variant bg-surface pl-2 pr-0.5 text-label-large text-on-surface">
              <span className="min-w-0 truncate">{nama(row.event_id)}</span>
              <button
                type="button"
                aria-label={`Remove ${nama(row.event_id)}`}
                onClick={(klik) => { klik.stopPropagation(); onChange(rows.filter((item) => item.event_id !== row.event_id)); }}
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-on-surface/8"
              >
                <X size={14} />
              </button>
            </span>
          ))}
          <input
            ref={masukan}
            id={id}
            role="combobox"
            aria-expanded={menu.open}
            aria-controls={idDaftar}
            aria-autocomplete="list"
            aria-activedescendant={menu.open && tawaran.length > 0 ? `${idDaftar}-${Math.min(sorot, tawaran.length - 1)}` : undefined}
            aria-describedby={`${id}-hint`}
            value={cari}
            onChange={(change) => { setCari(change.target.value); setSorot(0); buka(); }}
            onKeyDown={tombol}
            placeholder={rows.length === 0 ? "Choose events" : ""}
            className="h-7 min-w-[8ch] flex-1 bg-transparent px-2 focus-visible:!shadow-none focus-visible:!outline-none text-body-large text-on-surface outline-none placeholder:text-on-surface-variant/70"
          />
          <CaretDown size={16} aria-hidden className={cx("pointer-events-none absolute right-2.5 top-2.5 text-on-surface-variant transition-transform", menu.open && "rotate-180")} />
        </div>
        <p id={`${id}-hint`} className="mt-2 text-body-small text-on-surface-variant">
          {rows.length === 0 ? "They only see the events chosen here." : `${rows.length} ${rows.length === 1 ? "event" : "events"}. They only see these.`}
        </p>
      </div>

      {menu.open ? (
        <Popover anchor={menu} label="Choose events" role="dialog" align="start" width={menu.rect?.width}>
          <p role="status" className="sr-only">{tawaran.length === 1 ? "1 event" : `${tawaran.length} events`}</p>
          <ul id={idDaftar} role="listbox" aria-label="Events" aria-multiselectable className="max-h-64 overflow-y-auto py-1">
            {tawaran.length === 0 ? (
              <li role="presentation" className="px-4 py-3 text-body-medium text-on-surface-variant">No matching events.</li>
            ) : tawaran.map((event, index) => {
              const aktif = index === Math.min(sorot, tawaran.length - 1);
              const dipilih = terpilih.has(event.id);
              return (
                <li
                  key={event.id}
                  id={`${idDaftar}-${index}`}
                  role="option"
                  aria-selected={dipilih}
                  onMouseDown={(klik) => klik.preventDefault()}
                  onMouseEnter={() => setSorot(index)}
                  onClick={() => alih(event)}
                  className={cx(POPOVER_ITEM, "cursor-pointer gap-3", aktif && "bg-on-surface/8")}
                >
                  <span className={cx("flex size-5 shrink-0 items-center justify-center", dipilih ? "text-primary" : "text-transparent")}>
                    <Check size={18} weight="bold" />
                  </span>
                  <span className={cx("min-w-0 flex-1 truncate text-left", dipilih && "font-medium")}>{event.name}</span>
                  <span className="shrink-0 text-body-small text-on-surface-variant">
                    {EVENT_STATUS_LABEL[event.status as keyof typeof EVENT_STATUS_LABEL] ?? event.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </Popover>
      ) : null}

      {role === "booth" && rows.length > 0 ? (
        <div>
          <p className="text-label-large font-semibold text-on-surface">Booth per event</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {rows.map((row) => {
              const daftar = booths[row.event_id];
              const galat = !row.booth_id && Array.isArray(daftar) && daftar.length > 0;
              return (
                <li key={row.event_id} className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-body-medium text-on-surface">{nama(row.event_id)}</span>
                  {daftar === "loading" || daftar === undefined ? (
                    <span className="text-body-small text-on-surface-variant">Loading booths…</span>
                  ) : daftar === "error" ? (
                    <span className="text-body-small text-error">Booths could not be loaded.</span>
                  ) : daftar.length === 0 ? (
                    <span className="text-body-small text-error">No booths yet</span>
                  ) : (
                    <select
                      aria-label={`Booth at ${nama(row.event_id)}`}
                      aria-invalid={galat || undefined}
                      className={cx(SELECT, "w-44 shrink-0", galat && "border-error text-on-surface-variant")}
                      value={row.booth_id ?? ""}
                      onChange={(change) => setBooth(row.event_id, change.target.value ? Number(change.target.value) : null)}
                    >
                      <option value="">Choose a booth</option>
                      {daftar.map((booth) => <option key={booth.id} value={booth.id}>{booth.code} · {booth.name}</option>)}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
