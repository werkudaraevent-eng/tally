"use client";

import { ArrowSquareOut, CaretDown, Plus, X } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import Link from "@/components/event-link";
import { IconButton, Popover, POPOVER_ITEM, usePopoverAnchor } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import type { LandingSpeaker } from "@/lib/domain";
import { labelSesi } from "@/lib/landing-speaker-tabs";

/**
 * Agenda > Edit item > Speakers (audit Agenda A3, 1 Nov).
 *
 * Satu sumber dengan halaman Speakers: tautan pembicara ke baris agenda adalah
 * `speaker.session_refs` yang sama. Di sini hanya ditambah atau dilepas, dan
 * disimpan langsung (seperti urutan tab), karena data ini milik daftar
 * pembicara, bukan formulir item. Nama, foto dan peran tetap disunting di Speakers.
 */

/** Pembicara yang menautkan baris ini, dengan indeksnya di daftar. */
export function pembicaraBaris(daftar: LandingSpeaker[], id: number) {
  return daftar.flatMap((orang, indeks) => {
    const ref = orang.session_refs?.find((r) => r.id === id);
    return ref ? [{ orang, indeks, peran: ref.role?.trim() || orang.role?.trim() || "" }] : [];
  });
}

/** Daftar baru dengan pembicara `indeks` ditautkan ke (atau dilepas dari) baris `id`. */
export function tautkan(daftar: LandingSpeaker[], indeks: number, id: number, label: string, pasang: boolean): LandingSpeaker[] {
  return daftar.map((orang, i) => {
    if (i !== indeks) return orang;
    const refs = orang.session_refs ?? [];
    if (pasang) return refs.some((r) => r.id === id) ? orang : { ...orang, session_refs: [...refs, { id, label: labelSesi(label) }] };
    return { ...orang, session_refs: refs.filter((r) => r.id !== id) };
  });
}

function inisial(nama: string) {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  return ((kata[0]?.[0] ?? "") + (kata.length > 1 ? kata[kata.length - 1]![0] : "")).toUpperCase() || "?";
}

export function KelompokPembicara({ daftar, gagal, itemId, judul, menyimpan, onUbah }: {
  /** null = sedang dimuat. */
  daftar: LandingSpeaker[] | null;
  gagal: boolean;
  itemId: number;
  judul: string;
  menyimpan: boolean;
  onUbah: (next: LandingSpeaker[], pesan: string) => void;
}) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();
  const [cari, setCari] = useState("");

  useEffect(() => {
    if (!menu.open) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(`${menuId}-cari`)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [menu.open, menuId]);

  if (gagal) return <p className="text-body-medium text-on-surface-variant">Speakers did not load. Reload the page to link speakers here.</p>;
  if (!daftar) return null;
  const tertaut = pembicaraBaris(daftar, itemId);
  const kata = cari.trim().toLowerCase();
  const pilihan = daftar
    .map((orang, indeks) => ({ orang, indeks }))
    .filter(({ orang }) => !orang.session_refs?.some((r) => r.id === itemId))
    .filter(({ orang }) => !kata || `${orang.name} ${orang.title ?? ""} ${orang.company ?? ""}`.toLowerCase().includes(kata));

  return (
    <div className="flex flex-col gap-1">
      <p className="text-label-large font-semibold text-on-surface">Speakers</p>
      {tertaut.length ? (
        <ul className="divide-y divide-outline-variant">
          {tertaut.map(({ orang, indeks, peran }) => (
            <li key={indeks} className="flex items-center gap-3 py-2">
              {orang.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- foto dari unggahan panitia, ukuran kecil tetap.
                <img src={orang.photo_url} alt="" className="size-8 shrink-0 rounded-full object-cover" />
              ) : (
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-label-medium font-semibold text-on-surface-variant">{inisial(orang.name)}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-medium font-medium text-on-surface">{orang.name}</span>
                <span className="block truncate text-body-small text-on-surface-variant">{[peran, orang.title, orang.company].filter(Boolean).join(" · ") || "No role"}</span>
              </span>
              <IconButton
                size="sm"
                label={`Remove ${orang.name} from this item`}
                disabled={menyimpan}
                onClick={() => onUbah(tautkan(daftar, indeks, itemId, judul, false), `${orang.name} removed from this item`)}
              >
                <X size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <button
          ref={setPemicu}
          type="button"
          disabled={menyimpan || daftar.length === 0}
          onClick={() => { setCari(""); menu.toggle(); }}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          aria-controls={menu.open ? menuId : undefined}
          className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-body-medium font-medium text-primary hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus size={16} aria-hidden />Add speaker<CaretDown size={14} aria-hidden />
        </button>
      </div>
      <p className="text-body-small text-on-surface-variant">
        {daftar.length === 0 ? "No speakers in this event yet. " : "Saved straight away. Names, photos and roles are edited in Speakers. "}
        <Link href="/admin/speakers" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          Open Speakers<ArrowSquareOut size={12} aria-hidden />
        </Link>
      </p>
      {menu.open ? (
        <Popover anchor={menu} id={menuId} label="Add speaker" width={300}>
          <div className="p-2">
            <input
              id={`${menuId}-cari`}
              type="search"
              value={cari}
              onChange={(event) => setCari(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape") { menu.tutup(); menu.fokus(); } }}
              placeholder="Search speakers"
              aria-label="Search speakers"
              className="m3-field h-9 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-medium text-on-surface outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-72 overflow-y-auto pb-1">
            {pilihan.length === 0 ? (
              <p className="px-4 py-2 text-body-medium text-on-surface-variant">{kata ? "No speaker matches." : "Every speaker is already on this item."}</p>
            ) : pilihan.map(({ orang, indeks }) => (
              <button
                key={indeks}
                type="button"
                role="menuitem"
                onClick={() => {
                  menu.tutup();
                  menu.fokus();
                  onUbah(tautkan(daftar, indeks, itemId, judul, true), `${orang.name} added to this item`);
                }}
                className={cx(POPOVER_ITEM, "w-full")}
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate">{orang.name}</span>
                  {orang.title || orang.company ? <span className="block truncate text-body-small text-on-surface-variant">{[orang.title, orang.company].filter(Boolean).join(" · ")}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
