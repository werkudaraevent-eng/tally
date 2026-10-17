"use client";

import { useEffect, useRef } from "react";

/** Menggulir daftar hari (bukan halaman) sampai hari terpilih terlihat di layar saat daftar lebih tinggi dari layar. */
export function GulirHariAktif() {
  const penanda = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const daftar = penanda.current?.parentElement;
    const aktif = daftar?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!daftar || !aktif || daftar.scrollHeight <= daftar.clientHeight) return;
    const kotak = daftar.getBoundingClientRect();
    const hari = aktif.getBoundingClientRect();
    // Batas bawah yang benar-benar terlihat: ujung daftar atau ujung layar, mana yang lebih dulu.
    const bawahTerlihat = Math.min(kotak.bottom, window.innerHeight);
    const lebih = hari.bottom + 4 - bawahTerlihat;
    if (lebih > 0) daftar.scrollTop += Math.min(lebih, hari.top - kotak.top);
  }, []);

  return <span ref={penanda} hidden />;
}

/** Menggulir deret chip hari (mendatar) sampai chip terpilih di tengah, hanya bila deretnya lebih lebar dari layar (U-06). */
export function GulirChipAktif() {
  const penanda = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const deret = penanda.current?.parentElement;
    const aktif = deret?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!deret || !aktif || deret.scrollWidth <= deret.clientWidth) return;
    const kotak = deret.getBoundingClientRect();
    const chip = aktif.getBoundingClientRect();
    deret.scrollLeft += chip.left - kotak.left - (kotak.width - chip.width) / 2;
  }, []);

  return <span ref={penanda} hidden />;
}
