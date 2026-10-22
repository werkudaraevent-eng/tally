"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * Pilihan cara di kartu Rute Perjalanan (Horizon): tab bersegmen seperti
 * pilihan moda di Google Maps, satu perjalanan tampil sekali waktu. Semua
 * panel ikut dirender server; yang tidak dipilih hanya `hidden`. Bukan `Tabs`
 * M3: itu memakai token warna admin, satu baris label tanpa waktu, dan
 * menggulir ke samping; di sini tab turun ke baris baru di ponsel.
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
    const n = pilihan.length;
    const tujuan = event.key === "ArrowRight" ? (index + 1) % n : event.key === "ArrowLeft" ? (index - 1 + n) % n : event.key === "Home" ? 0 : event.key === "End" ? n - 1 : -1;
    if (tujuan < 0) return;
    event.preventDefault();
    setAktif(tujuan);
    tab.current[tujuan]?.focus();
  };
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-[14px] bg-[#F1F3F8] p-1">
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
              className={`m3-state flex min-h-12 min-w-[88px] flex-1 flex-col items-center justify-center rounded-[10px] px-3 py-1.5 text-center ${pilih ? "bg-white text-[#1A2333] shadow-[0_1px_3px_rgb(16_24_40/0.12)]" : "text-[#5F6B7F]"}`}
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
