"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useId, useState, type ReactNode } from "react";

/**
 * Daftar checkpoint yang terlipat di ponsel: hanya langkah berikutnya, dengan
 * tombol "Lihat semua N checkpoint". Layar lebar selalu menampilkan semuanya.
 *
 * Bukan <details>: isi <details> yang tertutup disembunyikan peramban apa pun
 * CSS-nya, padahal di layar lebar daftarnya harus selalu terbuka.
 */
const PONSEL = { lg: "lg:hidden", md: "md:hidden" } as const;
const LEBAR = { lg: "hidden lg:block", md: "hidden md:block" } as const;

export function CheckpointLipat({
  ringkas,
  lengkap,
  bukaLabel,
  tutupLabel,
  titik = "lg",
  tombolKelas,
}: {
  ringkas: ReactNode;
  lengkap: ReactNode;
  bukaLabel: string;
  tutupLabel: string;
  titik?: "lg" | "md";
  tombolKelas: string;
}) {
  const [buka, setBuka] = useState(false);
  const id = useId();
  return (
    <>
      <div className={PONSEL[titik]}>
        <div id={id}>{buka ? lengkap : ringkas}</div>
        <button type="button" aria-expanded={buka} aria-controls={id} onClick={() => setBuka(!buka)} className={tombolKelas}>
          {buka ? tutupLabel : bukaLabel}
          <CaretDown size={16} weight="bold" aria-hidden className={buka ? "rotate-180" : undefined} />
        </button>
      </div>
      <div className={LEBAR[titik]}>{lengkap}</div>
    </>
  );
}
