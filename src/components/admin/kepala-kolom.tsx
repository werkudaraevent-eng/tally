"use client";

import { ArrowDown, ArrowUp, CaretUpDown, Check, Funnel } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Popover, usePopoverAnchor } from "@/components/m3";
import { cx } from "@/lib/m3/cx";

/*
 * Dipakai Daftar peserta dan tabel Logistics (Rooms, Trains): satu judul kolom
 * yang sama, jadi kebiasaan mengurut dan menyaring terbawa antarlayar.
 */

export type JenisUrutKolom = "teks" | "waktu" | "angka";
type JenisUrut = JenisUrutKolom;
const KATA_URUT: Record<JenisUrut, [string, string]> = {
  teks: ["Sort A → Z", "Sort Z → A"],
  waktu: ["Sort earliest first", "Sort latest first"],
  angka: ["Sort lowest first", "Sort highest first"],
};

/**
 * Judul kolom yang bisa diurutkan: klik membuka menu kecil berisi dua arah
 * urutan dan, bila kolomnya bisa disaring, "Filter this column". Satu tempat
 * yang sama untuk semua kolom, jadi admin tidak perlu tahu kolom mana yang
 * punya chip sendiri dan mana yang ada di "+ Filter".
 */
export function KepalaKolomUrut({ label, aktif, dir, jenis = "teks", align, onUrut, onSaring }: {
  label: string;
  aktif: boolean;
  dir: "asc" | "desc";
  jenis?: JenisUrut;
  align?: "right";
  onUrut: (dir: "asc" | "desc") => void;
  onSaring?: () => void;
}) {
  const [pemicu, setPemicu] = useState<HTMLButtonElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const id = useId();
  const [naik, turun] = KATA_URUT[jenis];
  const butir = "flex min-h-9 w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-body-medium font-normal text-on-surface hover:bg-primary-soft";
  const arah = (nilai: "asc" | "desc", teks: string, Ikon: typeof ArrowUp) => (
    <button type="button" role="menuitemradio" aria-checked={aktif && dir === nilai} onClick={() => { menu.tutup(); onUrut(nilai); }} className={butir}>
      <Ikon size={16} aria-hidden className="shrink-0 text-on-surface-variant" />
      <span className="flex-1">{teks}</span>
      {aktif && dir === nilai ? <Check size={16} aria-hidden className="shrink-0 text-primary" /> : null}
    </button>
  );
  return (
    <>
      <button
        ref={setPemicu}
        type="button"
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? id : undefined}
        // min-h-6: area tekan 24 px; -my-0.5 supaya tinggi kepala tabel tidak berubah.
        className={cx("-my-0.5 inline-flex min-h-6 max-w-full items-center gap-1 whitespace-nowrap hover:text-on-surface", (aktif || menu.open) && "text-on-surface", align === "right" && "ml-auto")}
        title={onSaring ? `Sort or filter by ${label}` : `Sort by ${label}`}
      >
        <span className="truncate">{label}</span>
        {aktif ? (dir === "asc" ? <ArrowUp size={14} className="shrink-0" /> : <ArrowDown size={14} className="shrink-0" />) : <CaretUpDown size={14} className="shrink-0 text-outline" />}
      </button>
      {menu.open ? (
        <Popover anchor={menu} id={id} label={label} align={align === "right" ? "end" : "start"} width={232}>
          {arah("asc", naik, ArrowUp)}
          {arah("desc", turun, ArrowDown)}
          {onSaring ? (
            <>
              <div role="separator" className="my-1 border-t border-outline-variant" />
              <button type="button" role="menuitem" onClick={() => { menu.tutup(); onSaring(); }} className={butir}>
                <Funnel size={16} aria-hidden className="shrink-0 text-on-surface-variant" />
                <span className="flex-1">Filter this column…</span>
              </button>
            </>
          ) : null}
        </Popover>
      ) : null}
    </>
  );
}
