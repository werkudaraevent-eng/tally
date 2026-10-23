"use client";

import { ArrowsOut } from "@phosphor-icons/react";
import { DialogGambar, usePenampilGambar } from "@/components/landing/modern/penampil-gambar";

/**
 * Foto bagasi di kartu Bagasi portal peserta. Diketuk membuka penampil layar
 * penuh yang sama dengan foto outfit dan denah Rute. `src` adalah signed URL
 * berumur pendek dari bucket privat, dibuat server untuk peserta ini saja.
 */
export function FotoBagasi({ src, keterangan, teks }: {
  src: string;
  keterangan: string;
  teks: { buka: string; perbesar: string; tutup: string; judul: string };
}) {
  const penampil = usePenampilGambar();
  return (
    <>
      <button
        type="button"
        onClick={penampil.buka}
        aria-label={teks.buka}
        aria-haspopup="dialog"
        className="m3-state relative block w-full cursor-zoom-in overflow-hidden rounded-[16px] bg-[#EEF1F6] sm:w-80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, bukan aset statis */}
        <img src={src} alt="" decoding="async" className="block aspect-[4/3] w-full object-cover" />
        <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-2.5 flex h-9 items-center gap-1.5 rounded-full bg-white/90 pl-2.5 pr-3 text-[13px] font-semibold text-[#1A2333] shadow-[0_1px_3px_rgb(16_24_40/0.18)]">
          <ArrowsOut size={18} className="shrink-0" />
          {teks.perbesar}
        </span>
      </button>
      <DialogGambar
        penampil={penampil}
        src={src}
        alt={keterangan}
        judul={teks.judul}
        tutupLabel={teks.tutup}
        keterangan={<p className="text-[17px] font-semibold leading-6 [overflow-wrap:anywhere]">{keterangan}</p>}
      />
    </>
  );
}
