"use client";

import { useEffect, useRef } from "react";

/** Menggulir daftar hari (bukan halaman) sampai hari terpilih terlihat saat daftar lebih tinggi dari layar. */
export function GulirHariAktif() {
  const penanda = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const daftar = penanda.current?.parentElement;
    const aktif = daftar?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!daftar || !aktif || daftar.scrollHeight <= daftar.clientHeight) return;
    const atas = aktif.getBoundingClientRect().top - daftar.getBoundingClientRect().top + daftar.scrollTop;
    const bawah = atas + aktif.offsetHeight;
    if (atas < daftar.scrollTop || bawah > daftar.scrollTop + daftar.clientHeight) {
      daftar.scrollTop = bawah - daftar.clientHeight + 4;
    }
  }, []);

  return <span ref={penanda} hidden />;
}
