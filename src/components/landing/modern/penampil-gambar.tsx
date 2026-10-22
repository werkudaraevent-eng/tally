"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

/**
 * Penampil gambar layar penuh (dialog layar penuh M3): latar hitam, tombol
 * tutup di KIRI bilah atas, judul di sebelahnya, gambar dipaskan ke layar.
 * Ketuk gambar untuk memperbesar 2x dan menggesernya; cubit tetap bisa karena
 * viewport tidak mengunci skala. Kembali di ponsel menutupnya (lihat efek di
 * usePenampilGambar). Dipakai denah blok Rute dan foto outfit.
 */
export function usePenampilGambar() {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const pemicu = useRef<HTMLElement | null>(null);
  const [terbuka, setTerbuka] = useState(false);
  const [besar, setBesar] = useState(false);
  const entri = useRef(false);

  const buka = (event: MouseEvent<HTMLElement>) => {
    // Fokus kembali ke tombol yang membukanya (bisa lebih dari satu pemicu).
    pemicu.current = event.currentTarget;
    // Kembali menutup penampil: satu entri riwayat beralamat sama, dengan state
    // Next disalin supaya entri itu tetap sah bagi router (maju, muat ulang).
    // Metode prototipe dipakai supaya tambalan Next tidak ikut campur.
    History.prototype.pushState.call(window.history, { ...window.history.state, denah: true }, "");
    entri.current = true;
    setTerbuka(true);
  };

  useEffect(() => {
    if (!terbuka) return;
    const el = dialog.current;
    const tombol = pemicu.current;
    if (el && !el.open) el.showModal();
    document.documentElement.style.overflow = "hidden";
    const y = window.scrollY;
    const kembali = () => {
      entri.current = false;
      setTerbuka(false);
      // Kembali ke entri bawah menjalankan router Next; pada alamat `#id` rute
      // ia menggulir ke sana dan melepas fokus. Posisi dan fokus dikembalikan.
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
      // Setiap kali dibuka lagi, mulai dari ukuran pas layar.
      setBesar(false);
      if (tombol?.isConnected) tombol.focus({ preventScroll: true });
    };
  }, [terbuka]);

  // X dan Esc lewat riwayat juga, supaya entri penampil tidak tertinggal.
  const tutup = () => {
    if (entri.current) window.history.back();
    else setTerbuka(false);
  };

  return { dialog, terbuka, besar, setBesar, buka, tutup };
}

export function DialogGambar({ penampil, src, alt, judul, tutupLabel, keterangan }: {
  penampil: ReturnType<typeof usePenampilGambar>;
  src: string;
  alt: string;
  /** Judul bilah atas, mis. "Denah" atau label halaman Outfit. */
  judul: string;
  tutupLabel: string;
  /** Panel keterangan di bawah gambar (pola penampil foto Airbnb/Google Photos), atau tanpa panel. */
  keterangan?: ReactNode;
}) {
  const { dialog, terbuka, besar, setBesar, tutup } = penampil;
  const wadah = useRef<HTMLDivElement | null>(null);

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
    <dialog
      ref={dialog}
      aria-label={judul}
      onCancel={(event) => {
        event.preventDefault();
        tutup();
      }}
      className="m-0 hidden h-dvh max-h-none w-full max-w-none flex-col bg-black p-0 text-white backdrop:bg-black open:flex"
    >
      <div className="flex min-h-16 shrink-0 items-center gap-1 px-1 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={tutup} aria-label={tutupLabel} className="m3-state flex size-12 shrink-0 items-center justify-center rounded-full">
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
      {keterangan ? (
        <div className="max-h-[40dvh] shrink-0 overflow-y-auto bg-[#14171C] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
          <div className="mx-auto w-full max-w-[720px]">{keterangan}</div>
        </div>
      ) : null}
    </dialog>
  );
}
