"use client";

import { Plus } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Button, Pane, PaneBody, Popover, POPOVER_ITEM, Switch, usePopoverAnchor } from "@/components/m3";
import { cx } from "@/lib/m3/cx";
import { BATAS } from "@/lib/laporan/config";
import type { DataLaporan } from "./jenis";

/**
 * Daftar slide: nomor, judul, sakelar tampil. "+ Add slide" hanya dua jenis
 * (grafik dari satu pertanyaan, slide teks). Di bawahnya slide bawaan yang
 * tidak ikut karena modulnya tidak dipakai, dengan alasannya.
 */
export function DaftarSlide({ data, pilih, onPilih, onTampil, onTambah, terkunci }: {
  data: DataLaporan;
  pilih: string;
  onPilih: (kunci: string) => void;
  onTampil: (kunci: string, tampil: boolean) => void;
  onTambah: (jenis: "pertanyaan" | "teks") => void;
  terkunci: boolean;
}) {
  const [pemicu, setPemicu] = useState<HTMLElement | null>(null);
  const menu = usePopoverAnchor(pemicu);
  const menuId = useId();
  const penuh = data.config.tambahan.length >= BATAS.tambahan;
  const nomor = new Map(data.daftar.filter((d) => d.tampil).map((d, i) => [d.kunci, i + 1]));

  return (
    <Pane aria-label="Slides">
      <PaneBody className="py-2">
        <ol>
          {data.daftar.map((d) => {
            const dipilih = d.kunci === pilih;
            return (
              <li key={d.kunci} className={cx("flex min-h-12 items-center gap-2 pr-3", dipilih ? "bg-secondary-container" : "hover:bg-primary-soft")}>
                <button type="button" aria-pressed={dipilih} onClick={() => onPilih(d.kunci)} className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left">
                  <span className="w-5 shrink-0 text-right text-body-small tabular-nums text-on-surface-variant">{nomor.get(d.kunci) ?? ""}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate text-body-medium", !d.tampil && "text-on-surface-variant")}>{d.judul}</span>
                    <span className="block truncate text-body-small text-on-surface-variant">{d.kosong ? `${d.nama}, empty until you add content` : d.nama}</span>
                  </span>
                </button>
                {d.kunci === "sampul" ? null : (
                  <Switch labelHidden label={`Show ${d.nama} in the report`} checked={!d.disembunyikan} disabled={terkunci} onChange={(v) => onTampil(d.kunci, v)} className="shrink-0" />
                )}
              </li>
            );
          })}
        </ol>

        <div className="px-3 pt-2">
          <span ref={setPemicu} className="inline-flex">
            <Button variant="text" size="sm" icon={<Plus size={16} aria-hidden />} disabled={terkunci || penuh} aria-haspopup="menu" aria-expanded={menu.open} aria-controls={menu.open ? menuId : undefined} onClick={menu.toggle}>
              Add slide
            </Button>
          </span>
          {penuh ? <p className="px-3 text-body-small text-on-surface-variant">Up to {BATAS.tambahan} added slides.</p> : null}
        </div>
        {menu.open ? (
          <Popover anchor={menu} id={menuId} label="Add slide" width={300} align="start">
            <button type="button" role="menuitem" disabled={data.pilihan.pertanyaan.length === 0} className={cx(POPOVER_ITEM, "flex-col !items-start gap-0.5 disabled:text-on-surface-variant")} onClick={() => { menu.tutup(); onTambah("pertanyaan"); }}>
              <span className="text-body-medium">Chart from a question</span>
              <span className="text-body-small text-on-surface-variant">
                {data.pilihan.pertanyaan.length ? "Pick a choice question from Registration or Feedback" : "No choice questions in Registration or Feedback yet"}
              </span>
            </button>
            <button type="button" role="menuitem" className={cx(POPOVER_ITEM, "flex-col !items-start gap-0.5")} onClick={() => { menu.tutup(); onTambah("teks"); }}>
              <span className="text-body-medium">Text slide</span>
              <span className="text-body-small text-on-surface-variant">A title and up to {BATAS.poin} points</span>
            </button>
          </Popover>
        ) : null}

        {data.absen.length ? (
          <div className="mt-4 border-t border-outline-variant px-4 pb-2 pt-3">
            <p className="text-body-small font-medium text-on-surface-variant">Not in this report</p>
            <ul className="mt-1 flex flex-col gap-1.5">
              {data.absen.map((a) => (
                <li key={a.kunci} className="text-body-small text-on-surface-variant">
                  <span className="font-medium text-on-surface">{a.nama}</span>: {a.alasan.charAt(0).toLowerCase() + a.alasan.slice(1)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </PaneBody>
    </Pane>
  );
}
