"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Layar panggung yang lebih besar dari 1920x1080 (LED 4608x1536, TV 4K):
 * diperbesar otomatis, tanpa setelan di CMS.
 *
 * Ukuran huruf panggung memakai `clamp(min, vw, max)`. Di layar raksasa
 * semuanya mentok di batas `max`, jadi nama pemenang tampak kecil di tengah
 * dinding LED. Membesarkan halaman dengan CSS `zoom` tidak bisa: Chrome ikut
 * mengalikan `vw`/`vh`, dan isi meluber keluar layar.
 *
 * Jadi panggung digambar di dalam iframe seukuran layar dibagi faktor skala,
 * lalu iframe itu diperbesar dengan `transform`. Di dalam iframe, `vw`/`vh`
 * mengikuti ukuran iframe, persis seperti layar 1080p yang lebar. Faktornya
 * `min(lebar / 1920, tinggi / 1080)`: layar 1920x1080 ke bawah tidak berubah
 * sama sekali, 4K menjadi tampilan 1080p, LED 4608x1536 menjadi 3245x1081.
 *
 * Halaman di dalam iframe membawa `scaled=1` sehingga tidak membuat iframe
 * lagi. Panggung luar dilepas (bukan disembunyikan) supaya polling dan suara
 * tidak berjalan dua kali.
 */
const BASE_W = 1920;
const BASE_H = 1080;


export function StageScaler({ children }: { children: ReactNode }) {
  // Ukuran jendela disimpan utuh, bukan hanya skalanya: lebar bisa berubah
  // sementara skala tetap (dibatasi tinggi), dan iframe harus ikut melebar.
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("scaled") === "1") return;
    url.searchParams.set("scaled", "1");
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const timer = window.setTimeout(() => {
      setSrc(url.toString());
      update();
    }, 0);
    window.addEventListener("resize", update);
    return () => { window.clearTimeout(timer); window.removeEventListener("resize", update); };
  }, []);

  // Sedikit di atas 1080p tetap digambar langsung: membesar 3% tidak terlihat,
  // sedangkan iframe menambah satu halaman yang dimuat.
  const scale = size.w ? Math.min(size.w / BASE_W, size.h / BASE_H) : 1;
  if (!src || scale <= 1.05) return children;

  return <iframe
    src={src}
    title="Lucky draw stage"
    allow="fullscreen; autoplay"
    style={{
      position: "fixed", top: 0, left: 0, border: 0,
      width: `${size.w / scale}px`,
      height: `${size.h / scale}px`,
      transform: `scale(${scale})`,
      transformOrigin: "0 0",
    }}
  />;
}
