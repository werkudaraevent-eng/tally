"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

/**
 * Kode booking kereta dengan tombol salin (tema Gathering Trip). Bila browser
 * menolak clipboard, kodenya tetap terlihat dan bisa dipilih manual.
 */
export function SalinKodeTrip({ kode, label, tersalin }: { kode: string; label: string; tersalin: string }) {
  const [sudah, setSudah] = useState(false);
  return (
    <span className="-my-3.5 flex min-h-12 items-center gap-1">
      <span className="select-all text-[16px] font-semibold leading-6 tracking-[1px] whitespace-nowrap">{kode}</span>
      <button
        type="button"
        aria-label={sudah ? tersalin : label}
        title={sudah ? tersalin : label}
        className="m3-state -mr-3 flex size-12 shrink-0 items-center justify-center rounded-full"
        style={{ color: "#526078" }}
        onClick={() => {
          navigator.clipboard
            ?.writeText(kode)
            .then(() => {
              setSudah(true);
              window.setTimeout(() => setSudah(false), 2000);
            })
            .catch(() => undefined);
        }}
      >
        {sudah ? <Check size={18} weight="bold" aria-hidden /> : <Copy size={18} aria-hidden />}
      </button>
      <span aria-live="polite" className="sr-only">
        {sudah ? tersalin : ""}
      </span>
    </span>
  );
}
