"use client";

import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { AgendaPreview } from "@/lib/landing-agenda";
import { rentangAkhir } from "@/lib/landing-agenda-range";

/**
 * Susunan acara tata letak Modern: tab pil per bagian rundown di atas daftar
 * sesi, jam besar di kiri tiap baris.
 *
 * Perilakunya sama dengan AgendaTabs (Editorial): satu bagian tampil utuh,
 * papan ketik mengikuti pola tab WAI-ARIA, dan tanpa tab bila rundown hanya
 * punya satu bagian. Berkas terpisah karena bentuk tab dan barisnya berbeda
 * seluruhnya; satu komponen dengan dua gaya akan membuat keduanya sulit diubah.
 */
export function AgendaPills({ agenda }: { agenda: AgendaPreview[] }) {
  const [aktif, setAktif] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dasar = useId();
  const multi = agenda.length > 1;
  const blok = agenda[aktif] ?? agenda[0];

  function pindah(event: KeyboardEvent<HTMLDivElement>) {
    const maju = event.key === "ArrowRight" || event.key === "ArrowDown";
    const mundur = event.key === "ArrowLeft" || event.key === "ArrowUp";
    let tujuan: number | null = null;
    if (maju) tujuan = (aktif + 1) % agenda.length;
    if (mundur) tujuan = (aktif - 1 + agenda.length) % agenda.length;
    if (event.key === "Home") tujuan = 0;
    if (event.key === "End") tujuan = agenda.length - 1;
    if (tujuan === null) return;
    event.preventDefault();
    setAktif(tujuan);
    tabRefs.current[tujuan]?.focus();
  }

  return (
    <div>
      {multi ? (
        <div
          role="tablist"
          aria-label="Bagian acara"
          onKeyDown={pindah}
          // Menggulir menyamping di ponsel, bukan terlipat: dua baris pil
          // terbaca seperti dua kelompok pilihan yang berbeda.
          className="-mx-5 mb-10 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {agenda.map((bagian, index) => {
            const pilih = index === aktif;
            const awal = bagian.items[0]?.time;
            const akhir = rentangAkhir(bagian);
            const rentang = awal ? (akhir && akhir !== awal ? `${awal} – ${akhir}` : awal) : null;
            return (
              <button
                key={bagian.sectionTitle ?? index}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                id={`${dasar}-tab-${index}`}
                type="button"
                role="tab"
                aria-selected={pilih}
                aria-controls={`${dasar}-panel`}
                tabIndex={pilih ? 0 : -1}
                onClick={() => setAktif(index)}
                className={`m3-state inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-[18px] text-label-large font-medium tabular-nums ${
                  pilih
                    ? "border-[var(--reg-primary)] bg-[var(--reg-primary)] text-[var(--reg-on-primary)]"
                    : "border-[var(--reg-outline-variant)] text-[var(--reg-on-surface)]"
                }`}
                style={pilih ? ({ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties) : undefined}
              >
                {bagian.sectionTitle || `Bagian ${index + 1}`}
                {rentang ? <span aria-hidden> · </span> : null}
                {rentang ? <span>{rentang}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <ol
        id={`${dasar}-panel`}
        role={multi ? "tabpanel" : undefined}
        aria-labelledby={multi ? `${dasar}-tab-${aktif}` : undefined}
        className="border-b border-[var(--reg-outline-variant)]"
      >
        {blok?.items.map((item, index) => (
          <li
            key={`${item.time}-${item.title}-${index}`}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-5 border-t border-[var(--reg-outline-variant)] py-5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-x-8 sm:py-6"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] tabular-nums [font-family:var(--landing-heading)] sm:text-[26px]">
                {item.time}
              </span>
              {item.end && item.end !== item.time ? (
                <span className="text-body-small tabular-nums text-[var(--reg-on-surface-variant)]">s.d. {item.end}</span>
              ) : null}
            </span>
            <div className="min-w-0 sm:pt-0.5">
              <p className="text-title-medium font-semibold leading-[1.4] sm:text-title-large">{item.title}</p>
              {item.subtitle ? (
                <p className="mt-1.5 text-body-large text-[var(--reg-on-surface-variant)]">{item.subtitle}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
