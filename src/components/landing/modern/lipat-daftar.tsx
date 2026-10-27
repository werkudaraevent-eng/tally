"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useId, useState, type ReactNode } from "react";

/**
 * Butir Lakukan di atas batas tampilan Daftar ringkas. Butirnya sudah
 * dirender server (ikon SVG tanpa JS); komponen ini hanya membuka dan
 * menutupnya, seperti "Tampilkan semua fasilitas" di Airbnb.
 */
export function LipatDaftar({ children, tombolBuka, tombolTutup, className }: { children: ReactNode; tombolBuka: string; tombolTutup: string; className: string }) {
  const [buka, setBuka] = useState(false);
  const id = useId();
  return (
    <>
      <ul id={id} hidden={!buka} className={className}>{children}</ul>
      <button
        type="button"
        aria-expanded={buka}
        aria-controls={id}
        onClick={() => setBuka((nilai) => !nilai)}
        className="m3-state inline-flex min-h-12 items-center gap-2 self-start rounded-md border border-[color-mix(in_srgb,currentColor_35%,transparent)] px-5 text-title-medium font-semibold"
      >
        {buka ? tombolTutup : tombolBuka}
        <CaretDown size={16} aria-hidden className={buka ? "rotate-180" : undefined} />
      </button>
    </>
  );
}
