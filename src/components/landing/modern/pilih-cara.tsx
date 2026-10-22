"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * Pilihan cara di kartu Rute Perjalanan (Horizon): tab bersegmen seperti
 * pilihan moda di Google Maps, satu perjalanan tampil sekali waktu. Semua
 * panel ikut dirender server; yang tidak dipilih hanya `hidden`.
 */
export function PilihCara({ label, pilihan, panel }: {
  /** Nama grup tab untuk pembaca layar, mis. "Cara ke sana". */
  label: string;
  pilihan: { judul: string; waktu: string | null }[];
  panel: ReactNode[];
}) {
  const [aktif, setAktif] = useState(0);
  const id = useId();
  const tab = useRef<(HTMLButtonElement | null)[]>([]);
  if (pilihan.length < 2) return <>{panel[0]}</>;
  const geser = (event: KeyboardEvent, index: number) => {
    const arah = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!arah) return;
    event.preventDefault();
    const tujuan = (index + arah + pilihan.length) % pilihan.length;
    setAktif(tujuan);
    tab.current[tujuan]?.focus();
  };
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-[14px] bg-[#F1F3F8] p-1">
        {pilihan.map(({ judul, waktu }, index) => {
          const pilih = index === aktif;
          return (
            <button
              key={index}
              ref={(el) => {
                tab.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              aria-selected={pilih}
              aria-controls={`${id}-panel-${index}`}
              tabIndex={pilih ? 0 : -1}
              onClick={() => setAktif(index)}
              onKeyDown={(event) => geser(event, index)}
              className={`m3-state flex min-h-12 min-w-[120px] flex-1 flex-col items-center justify-center rounded-[10px] px-3 py-1.5 text-center ${pilih ? "bg-white text-[#1A2333] shadow-[0_1px_3px_rgb(16_24_40/0.12)]" : "text-[#5F6B7F]"}`}
            >
              <span className="text-title-small font-bold [overflow-wrap:anywhere]">{judul}</span>
              {waktu ? <span className="text-body-small tabular-nums">{waktu}</span> : null}
            </button>
          );
        })}
      </div>
      {panel.map((isi, index) => (
        <div key={index} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={index !== aktif}>
          {isi}
        </div>
      ))}
    </div>
  );
}
