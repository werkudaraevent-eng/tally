"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Gambar ikon sendiri pada kartu Tentang acara (gaya gathering), atau
 * `children` (ubin ikon) bila tidak ada gambar atau gambarnya gagal dimuat
 * (berkas dihapus, alamat salah). Tanpa ini tamu melihat bingkai gambar rusak.
 *
 * Tanpa ubin dan sedikit lebih besar (64px), karena ikon 3D sudah membawa warna
 * dan bayangannya sendiri. Margin negatif: tingginya tetap 52px seperti ubin,
 * jadi judul sejajar dengan kartu lain.
 */
export function GambarIkonKartu({ src, children }: { src: string | null; children: ReactNode }) {
  const [gagal, setGagal] = useState<string | null>(null);
  const gambar = useRef<HTMLImageElement>(null);

  // Gambar yang gagal sebelum React terpasang tidak memicu onError lagi.
  useEffect(() => {
    const el = gambar.current;
    if (src && el?.complete && el.naturalWidth === 0) setGagal(src);
  }, [src]);

  if (!src || gagal === src) return <>{children}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={gambar}
      src={src}
      alt=""
      aria-hidden
      width={64}
      height={64}
      loading="lazy"
      decoding="async"
      onError={() => setGagal(src)}
      className="-my-1.5 size-16 object-contain"
    />
  );
}
