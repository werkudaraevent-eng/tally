"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ChipHariDressCode = { atas: string; bawah: string | null };

/**
 * Pilihan hari blok Dress code: chip tanggal seperti halaman Outfit peserta
 * (ChipTanggalHorizon), satu hari tampil. Semua panel tetap dirender server
 * (tersembunyi dengan `hidden`), jadi isinya ada tanpa JavaScript dan untuk
 * mesin pencari. Tombol panah kiri/kanan pindah hari (pola tab WAI-ARIA).
 */
export function TabHariDressCode({ chip, panel, awal, label }: { chip: ChipHariDressCode[]; panel: ReactNode[]; awal: number; label: string }) {
  const [aktif, setAktif] = useState(awal);
  const id = useId();
  const tombol = useRef<(HTMLButtonElement | null)[]>([]);
  const pindah = (event: KeyboardEvent<HTMLButtonElement>, indeks: number) => {
    const arah = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const tujuan = event.key === "Home" ? 0 : event.key === "End" ? chip.length - 1 : arah ? (indeks + arah + chip.length) % chip.length : -1;
    if (tujuan < 0) return;
    event.preventDefault();
    setAktif(tujuan);
    tombol.current[tujuan]?.focus();
  };
  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label={label} className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chip.map((isi, indeks) => {
          const pilih = indeks === aktif;
          return (
            <button
              key={indeks}
              ref={(el) => {
                tombol.current[indeks] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${indeks}`}
              aria-selected={pilih}
              aria-controls={`${id}-panel-${indeks}`}
              tabIndex={pilih ? 0 : -1}
              onClick={() => setAktif(indeks)}
              onKeyDown={(event) => pindah(event, indeks)}
              className={`m3-state flex min-h-14 min-w-[74px] shrink-0 flex-col items-center justify-center rounded-[16px] px-3 py-1.5 text-center ${
                pilih ? "bg-[var(--blok-tombol)] text-[var(--blok-tombol-ink)] [--m3-state-color:var(--blok-tombol-ink)]" : "bg-[var(--blok-kartu)] text-[var(--reg-on-surface)] shadow-[inset_0_0_0_1px_var(--reg-outline-variant)]"
              }`}
            >
              <span className="whitespace-nowrap text-[12px] font-medium leading-4">{isi.atas}</span>
              {isi.bawah ? <span className="max-w-[240px] truncate text-[16px] font-bold leading-6">{isi.bawah}</span> : null}
            </button>
          );
        })}
      </div>
      {panel.map((isi, indeks) => (
        <div key={indeks} role="tabpanel" id={`${id}-panel-${indeks}`} aria-labelledby={`${id}-tab-${indeks}`} hidden={indeks !== aktif} className="@container flex min-w-0 flex-col gap-4">
          {isi}
        </div>
      ))}
    </div>
  );
}
