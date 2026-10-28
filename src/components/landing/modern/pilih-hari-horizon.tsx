"use client";

import { useState, type ReactNode } from "react";

/**
 * Chip tanggal di atas Susunan acara Horizon: satu hari tampil sekaligus,
 * seperti tab Acara di portal peserta (pola agenda Whova dan Web Summit).
 */
export function PilihHariHorizon({ label, children, aria }: { label: { pendek: string; atas: string }[]; children: ReactNode[]; aria: string }) {
  const [pilih, setPilih] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label={aria} className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 md:mx-0 md:px-0 [scrollbar-width:none]">
        {label.map((item, index) => {
          const aktif = index === pilih;
          return (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={aktif}
              onClick={() => setPilih(index)}
              className={`flex min-h-14 shrink-0 flex-col items-center justify-center rounded-[12px] border px-4 text-center ${
                aktif ? "border-transparent bg-[var(--hz-emas)] text-[var(--hz-on-emas)]" : "border-white/20 text-white"
              }`}
            >
              <span className="text-[12px] font-semibold leading-4">{item.atas}</span>
              <span className="text-[16px] font-bold leading-6">{item.pendek}</span>
            </button>
          );
        })}
      </div>
      {children.map((anak, index) => (
        <div key={index} role="tabpanel" hidden={index !== pilih}>
          {anak}
        </div>
      ))}
    </div>
  );
}
