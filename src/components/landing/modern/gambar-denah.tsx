"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowsOut, X } from "@phosphor-icons/react";

/**
 * Denah blok Rute: gambar utuh (tidak dipotong) selebar kolom, ketuk untuk
 * layar penuh. Layar penuhnya dialog layar penuh M3: latar hitam, tombol tutup
 * di KIRI bilah atas, judul di sebelahnya, gambar dipaskan ke layar. Ketuk
 * gambar untuk memperbesar 2x dan menggesernya; cubit tetap bisa karena
 * viewport tidak mengunci skala. Tidak menambah entri riwayat: Kembali ke
 * alamat yang sama membuat router Next menggulir ke `#id` rute dan
 * melepas fokus, jadi halaman melompat saat denah ditutup.
 */
export function GambarDenah({ src, alt, judul, buka, tutup, perbesar }: {
  src: string;
  alt: string;
  /** Judul bilah atas layar penuh, mis. "Denah". */
  judul: string;
  /** Label tombol pembuka untuk pembaca layar. */
  buka: string;
  tutup: string;
  /** Petunjuk di bawah gambar layar penuh. */
  perbesar: string;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const wadah = useRef<HTMLDivElement | null>(null);
  const pemicu = useRef<HTMLButtonElement | null>(null);
  const [terbuka, setTerbuka] = useState(false);
  const [besar, setBesar] = useState(false);

  useEffect(() => {
    if (!terbuka) return;
    const el = dialog.current;
    const tombol = pemicu.current;
    if (el && !el.open) el.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      if (el?.open) el.close();
      setBesar(false);
      if (tombol?.isConnected) tombol.focus({ preventScroll: true });
    };
  }, [terbuka]);

  const tutupDialog = () => setTerbuka(false);

  const ketukGambar = (event: MouseEvent<HTMLImageElement>) => {
    const w = wadah.current;
    if (!w) return;
    const kotak = event.currentTarget.getBoundingClientRect();
    // Titik yang diketuk tetap di bawah jari sesudah diperbesar.
    const fx = (event.clientX - kotak.left) / kotak.width;
    const fy = (event.clientY - kotak.top) / kotak.height;
    setBesar((x) => {
      if (!x) {
        requestAnimationFrame(() => {
          w.scrollLeft = fx * w.scrollWidth - w.clientWidth / 2;
          w.scrollTop = fy * w.scrollHeight - w.clientHeight / 2;
        });
      }
      return !x;
    });
  };

  return (
    <>
      <div className="relative">
        <button
          ref={pemicu}
          type="button"
          onClick={() => setTerbuka(true)}
          aria-label={buka}
          aria-haspopup="dialog"
          className="block w-full cursor-zoom-in overflow-hidden rounded-[16px] border border-[#E6E9EE] bg-[#F4F6F8]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- URL bebas dari unggahan admin, sama seperti gambar blok lain */}
          <img src={src} alt={alt} loading="lazy" decoding="async" className="mx-auto block h-auto max-h-[560px] w-full object-contain" />
        </button>
        <span aria-hidden className="pointer-events-none absolute right-2 top-2 flex size-12 items-center justify-center rounded-full bg-white/90 text-[#1A2333] shadow-[0_1px_3px_rgb(16_24_40/0.18)]">
          <ArrowsOut size={24} />
        </span>
      </div>
      <dialog
        ref={dialog}
        aria-label={judul}
        onCancel={(event) => {
          event.preventDefault();
          tutupDialog();
        }}
        className="m-0 hidden h-dvh max-h-none w-full max-w-none flex-col bg-black p-0 text-white backdrop:bg-black open:flex"
      >
        <div className="flex min-h-16 shrink-0 items-center gap-1 px-1 pt-[env(safe-area-inset-top)]">
          <button type="button" onClick={tutupDialog} aria-label={tutup} className="m3-state flex size-12 shrink-0 items-center justify-center rounded-full">
            <X size={24} aria-hidden />
          </button>
          <h2 className="min-w-0 truncate text-[22px] font-medium leading-7">{judul}</h2>
        </div>
        <div ref={wadah} className={`min-h-0 flex-1 overflow-auto ${besar ? "" : "flex items-center justify-center p-2"}`}>
          {terbuka ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL bebas dari unggahan admin
            <img
              src={src}
              alt={alt}
              onClick={ketukGambar}
              className={besar ? "block w-[200%] max-w-none cursor-zoom-out" : "block max-h-full max-w-full cursor-zoom-in object-contain"}
            />
          ) : null}
        </div>
        <p className="shrink-0 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 text-center text-body-small text-white/70">{perbesar}</p>
      </dialog>
    </>
  );
}
