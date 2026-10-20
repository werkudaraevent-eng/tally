"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowsOut, X } from "@phosphor-icons/react";

/**
 * Denah blok Rute: gambar utuh (tidak dipotong) selebar kolom, ketuk untuk
 * layar penuh. Layar penuhnya dialog layar penuh M3: latar hitam, tombol tutup
 * di KIRI bilah atas, judul di sebelahnya, gambar dipaskan ke layar. Ketuk
 * gambar untuk memperbesar 2x dan menggesernya; cubit tetap bisa karena
 * viewport tidak mengunci skala. Kembali di ponsel menutup denah (lihat efek
 * di bawah).
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
  const dialog = useRef<HTMLDialogElement | null>(null);
  const wadah = useRef<HTMLDivElement | null>(null);
  const pemicu = useRef<HTMLButtonElement | null>(null);
  const [terbuka, setTerbuka] = useState(false);
  const [besar, setBesar] = useState(false);
  const [gagal, setGagal] = useState(false);
  const gambar = useRef<HTMLImageElement | null>(null);
  const entriDenah = useRef(false);
  const stateAsli = useRef<unknown>(null);

  const bukaDialog = () => {
    // Kembali menutup denah: satu entri riwayat beralamat sama. Router Next
    // mendaftarkan popstate lebih dulu, jadi tidak bisa dihentikan; ia
    // mengabaikan entri ber-state null, jadi entri bawah dan entri denah
    // sama-sama null selama denah terbuka, lalu state Next dikembalikan.
    // Metode prototipe dipakai karena versi tambalan Next selalu menyalin
    // state-nya.
    stateAsli.current = window.history.state;
    History.prototype.replaceState.call(window.history, null, "");
    History.prototype.pushState.call(window.history, null, "");
    entriDenah.current = true;
    setTerbuka(true);
  };

  // Galat yang terjadi sebelum hidrasi tidak sampai ke onError.
  useEffect(() => {
    const img = gambar.current;
    if (img?.complete && img.naturalWidth === 0) setGagal(true);
  }, []);

  useEffect(() => {
    if (!terbuka) return;
    const el = dialog.current;
    const tombol = pemicu.current;
    if (el && !el.open) el.showModal();
    document.documentElement.style.overflow = "hidden";
    const y = window.scrollY;
    const kembali = () => {
      entriDenah.current = false;
      History.prototype.replaceState.call(window.history, stateAsli.current, "");
      setTerbuka(false);
      // Alamat dengan `#id` rute: peramban menggulir ke sana dan melepas fokus
      // saat kembali ke entri itu. Posisi dan fokus dikembalikan sesudahnya.
      requestAnimationFrame(() => {
        window.scrollTo(0, y);
        if (tombol?.isConnected) tombol.focus({ preventScroll: true });
      });
    };
    window.addEventListener("popstate", kembali);
    return () => {
      window.removeEventListener("popstate", kembali);
      document.documentElement.style.overflow = "";
      if (el?.open) el.close();
      setBesar(false);
      if (tombol?.isConnected) tombol.focus({ preventScroll: true });
    };
  }, [terbuka]);

  // X dan Esc lewat riwayat juga, supaya entri denah tidak tertinggal.
  const tutupDialog = () => {
    if (entriDenah.current) window.history.back();
    else setTerbuka(false);
  };

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
      <div className="relative" data-denah-gagal={gagal || undefined}>
        <button
          ref={pemicu}
          type="button"
          onClick={bukaDialog}
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
      </dialog>
    </>
  );
}
