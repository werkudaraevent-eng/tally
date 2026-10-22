"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowsOut } from "@phosphor-icons/react";
import { DialogGambar, usePenampilGambar } from "./penampil-gambar";

/**
 * Denah blok Rute: gambar utuh (tidak dipotong) selebar kolom, ketuk untuk
 * layar penuh (DialogGambar: tutup di kiri atas, ketuk untuk 2x, Kembali di
 * ponsel menutupnya).
 * Gambar yang gagal dimuat menandai `data-denah-gagal`, jadi bagian Denah
 * di induknya disembunyikan (`has-[[data-denah-gagal]]:hidden`).
 */
export function GambarDenah({ src, alt, judul, buka, tutup }: {
  src: string;
  alt: string;
  /** Judul bilah atas layar penuh, mis. "Denah". */
  judul: string;
  /** Label tombol pembuka untuk pembaca layar. */
  buka: string;
  tutup: string;
}) {
  const penampil = usePenampilGambar();
  const [gagal, setGagal] = useState(false);
  const gambar = useRef<HTMLImageElement | null>(null);

  // Galat yang terjadi sebelum hidrasi tidak sampai ke onError.
  useEffect(() => {
    const img = gambar.current;
    if (img?.complete && img.naturalWidth === 0) setGagal(true);
  }, []);

  return (
    <>
      <div className="relative" data-denah-gagal={gagal || undefined}>
        <button
          type="button"
          onClick={penampil.buka}
          aria-label={buka}
          aria-haspopup="dialog"
          className="block min-h-12 w-full cursor-zoom-in overflow-hidden rounded-[16px] border border-[#E6E9EE] bg-[#F4F6F8]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- URL bebas dari unggahan admin, sama seperti gambar blok lain */}
          <img ref={gambar} src={src} alt={alt} onError={() => setGagal(true)} loading="lazy" decoding="async" className="mx-auto block h-auto max-h-[560px] w-full object-contain" />
        </button>
        <span aria-hidden className="pointer-events-none absolute right-2 top-2 flex size-12 items-center justify-center rounded-full bg-white/90 text-[#1A2333] shadow-[0_1px_3px_rgb(16_24_40/0.18)]">
          <ArrowsOut size={24} />
        </span>
      </div>
      <DialogGambar penampil={penampil} src={src} alt={alt} judul={judul} tutupLabel={tutup} />
    </>
  );
}

/**
 * Foto patokan satu langkah Rute: gambar kecil di kanan teks langkah, ketuk
 * untuk layar penuh dengan teks langkahnya sebagai keterangan. Gagal dimuat =
 * hilang, langkahnya tetap terbaca.
 */
export function FotoLangkah({ src, alt, judul, buka, tutup, keterangan }: {
  src: string;
  alt: string;
  /** Judul bilah atas layar penuh, mis. "Langkah 2". */
  judul: string;
  buka: string;
  tutup: string;
  keterangan: string;
}) {
  const penampil = usePenampilGambar();
  const [gagal, setGagal] = useState(false);
  const gambar = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = gambar.current;
    if (img?.complete && img.naturalWidth === 0) setGagal(true);
  }, []);

  if (gagal) return null;
  return (
    <>
      <button
        type="button"
        onClick={penampil.buka}
        aria-label={buka}
        aria-haspopup="dialog"
        className="m3-state h-[54px] w-[72px] shrink-0 cursor-zoom-in overflow-hidden rounded-[10px] bg-[#E6E9EE]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- URL bebas dari unggahan admin, sama seperti gambar blok lain */}
        <img ref={gambar} src={src} alt={alt} onError={() => setGagal(true)} loading="lazy" decoding="async" className="size-full object-cover" />
      </button>
      <DialogGambar penampil={penampil} src={src} alt={alt} judul={judul} tutupLabel={tutup} keterangan={<p className="text-[17px] font-semibold leading-6 [overflow-wrap:anywhere]">{keterangan}</p>} />
    </>
  );
}
