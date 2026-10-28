"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";

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

/**
 * Beberapa gambar dalam satu penampil (pilihan gaya outfit): penanda "2 / 4"
 * di bilah atas, geser di layar sentuh, panah kiri/kanan dan tombol panah di
 * layar lebar (pola penampil Airbnb dan Google Photos). `ke` mengganti gambar;
 * pemanggil memegang indeksnya supaya keterangannya ikut berganti.
 */
export type GaleriGambar = { indeks: number; jumlah: number; ke: (indeks: number) => void; label: { sebelumnya: string; berikutnya: string } };

export function DialogGambar({ penampil, src, alt, judul, tutupLabel, keterangan, galeri }: {
  penampil: ReturnType<typeof usePenampilGambar>;
  src: string;
  alt: string;
  /** Judul bilah atas, mis. "Denah" atau label halaman Outfit. */
  judul: string;
  tutupLabel: string;
  /** Panel keterangan di bawah gambar (pola penampil foto Airbnb/Google Photos), atau tanpa panel. */
  keterangan?: ReactNode;
  galeri?: GaleriGambar;
}) {
  const { dialog, terbuka, besar, setBesar, tutup } = penampil;
  const wadah = useRef<HTMLDivElement | null>(null);
  const sentuh = useRef<{ x: number; y: number } | null>(null);
  const adaGaleri = galeri !== undefined && galeri.jumlah > 1;

  // Panah kiri/kanan di seluruh jendela selama terbuka: tombol panah di ujung
  // daftar dinonaktifkan dan melepas fokus dari dialog.
  const geserRef = useRef<(arah: -1 | 1) => void>(() => {});
  useEffect(() => {
    if (!terbuka || !adaGaleri) return;
    const tekan = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      geserRef.current(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [terbuka, adaGaleri]);

  const geser = (arah: -1 | 1) => {
    if (!galeri) return;
    const tujuan = galeri.indeks + arah;
    if (tujuan < 0 || tujuan >= galeri.jumlah) return;
    // Gambar berikutnya mulai lagi dari ukuran pas layar.
    setBesar(false);
    galeri.ke(tujuan);
  };
  useEffect(() => {
    geserRef.current = geser;
  });

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
        {adaGaleri ? (
          <p className="ml-auto shrink-0 pr-4 text-[16px] tabular-nums leading-6 text-[#C9CED8]" aria-live="polite">
            {galeri.indeks + 1} / {galeri.jumlah}
          </p>
        ) : null}
      </div>
      <div
        ref={wadah}
        // Geser mendatar berganti gambar, kecuali saat diperbesar (geser = menggulir gambar).
        onTouchStart={(event) => {
          const titik = event.touches[0];
          sentuh.current = adaGaleri && !besar && event.touches.length === 1 ? { x: titik.clientX, y: titik.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const awal = sentuh.current;
          sentuh.current = null;
          const titik = event.changedTouches[0];
          if (!awal || !titik) return;
          const dx = titik.clientX - awal.x;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(titik.clientY - awal.y)) geser(dx < 0 ? 1 : -1);
        }}
        className={`relative min-h-0 flex-1 overflow-auto ${besar ? "" : "flex items-center justify-center p-2"}`}
      >
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
      {adaGaleri ? (
        <>
          {/* Layar lebar: tombol panah di kedua sisi. Layar sentuh: geser, dengan titik penanda. */}
          <div className="pointer-events-none absolute inset-x-6 top-1/2 hidden -translate-y-1/2 justify-between lg:flex">
            <button type="button" onClick={() => geser(-1)} disabled={galeri.indeks === 0} aria-label={galeri.label.sebelumnya} className="m3-state pointer-events-auto flex size-14 items-center justify-center rounded-full bg-white/15 disabled:invisible">
              <CaretLeft size={28} aria-hidden />
            </button>
            <button type="button" onClick={() => geser(1)} disabled={galeri.indeks === galeri.jumlah - 1} aria-label={galeri.label.berikutnya} className="m3-state pointer-events-auto flex size-14 items-center justify-center rounded-full bg-white/15 disabled:invisible">
              <CaretRight size={28} aria-hidden />
            </button>
          </div>
          <div aria-hidden className="flex shrink-0 justify-center gap-1.5 py-3 lg:hidden">
            {Array.from({ length: galeri.jumlah }, (_, i) => (
              <span key={i} className={`h-1.5 rounded-full ${i === galeri.indeks ? "w-4 bg-white" : "w-1.5 bg-white/40"}`} />
            ))}
          </div>
        </>
      ) : null}
      {keterangan ? (
        <div className="max-h-[40dvh] shrink-0 overflow-y-auto bg-[#14171C] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
          <div className="mx-auto w-full max-w-[720px]">{keterangan}</div>
        </div>
      ) : null}
    </dialog>
  );
}
