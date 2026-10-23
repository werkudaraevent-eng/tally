"use client";

import type { ReactNode } from "react";
import { ArrowsOut } from "@phosphor-icons/react";
import { DialogGambar, usePenampilGambar } from "@/components/landing/modern/penampil-gambar";

/**
 * Kartu outfit yang punya foto contoh. Foto (dan tombol "Lihat gambar penuh"
 * di layar lebar) membuka penampil layar penuh yang sama dengan denah Rute,
 * dengan keterangan outfit di bawah gambar (pola penampil foto Airbnb dan
 * Google Photos), jadi gambar dan catatannya terbaca tanpa keluar portal.
 * `children` = kolom teks kartu (waktu, judul, catatan) dari KartuOutfitHorizon.
 */
export function KartuFotoOutfit({ kelas, warna, foto, kapan, apa, catatan, judul, teks, children }: {
  kelas: string;
  warna: string;
  foto: string;
  kapan: string | null;
  apa: string;
  catatan: string | null;
  /** Judul bilah atas penampil: label halaman per acara (bawaan "Outfit"). */
  judul: string;
  teks: { buka: string; lihat: string; perbesar: string; tutup: string };
  children: ReactNode;
}) {
  const penampil = usePenampilGambar();
  return (
    <article className={kelas} style={{ color: warna }}>
      <button
        type="button"
        onClick={penampil.buka}
        aria-label={teks.buka}
        aria-haspopup="dialog"
        className="m3-state relative block w-full shrink-0 cursor-zoom-in overflow-hidden rounded-[16px] bg-[#EEF1F6] lg:w-80"
      >
        {/* Foto dari unggahan admin, ukuran asli tidak diketahui. Ponsel dan tablet: rasio
            asli, utuh (papan dress code tidak terpotong), paling tinggi 560 px. Layar lebar:
            dipotong 4:5 di kolom 320 px. Hiasan: isi kartu sudah menyebut pakaiannya. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto} alt="" loading="lazy" decoding="async" className="mx-auto block h-auto max-h-[560px] w-auto max-w-full object-contain lg:aspect-[4/5] lg:max-h-none lg:w-full lg:object-cover" />
        <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-2.5 flex h-9 items-center gap-1.5 rounded-full bg-white/90 pl-2.5 pr-3 text-[13px] font-semibold text-[#1A2333] shadow-[0_1px_3px_rgb(16_24_40/0.18)] lg:bottom-3 lg:right-3 lg:size-10 lg:justify-center lg:p-0">
          <ArrowsOut size={18} className="shrink-0 lg:size-5" />
          <span className="lg:hidden">{teks.perbesar}</span>
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:pt-2">
        {children}
        {/* Layar lebar: tombol teks juga, karena foto besar tidak selalu terbaca sebagai bisa diklik. */}
        <button
          type="button"
          onClick={penampil.buka}
          aria-haspopup="dialog"
          className="m3-state mt-3 hidden h-10 items-center gap-2 self-start rounded-full border border-[#C9CED8] px-4 text-[14px] font-semibold text-[#274FC0] lg:inline-flex"
        >
          <ArrowsOut size={18} aria-hidden />
          {teks.lihat}
        </button>
      </div>
      <DialogGambar
        penampil={penampil}
        src={foto}
        alt={apa}
        judul={judul}
        tutupLabel={teks.tutup}
        keterangan={
          <>
            {kapan ? <p className="text-[13px] font-semibold leading-5 text-[#E8C968] [overflow-wrap:anywhere]">{kapan}</p> : null}
            <p className="mt-0.5 text-[17px] font-semibold leading-6 [overflow-wrap:anywhere]">{apa}</p>
            {catatan ? <p className="mt-1 text-[14px] leading-5 text-[#C9CED8] [overflow-wrap:anywhere]">{catatan}</p> : null}
          </>
        }
      />
    </article>
  );
}
