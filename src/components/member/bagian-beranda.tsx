import type { ReactNode } from "react";

/**
 * Satu isi Beranda halaman peserta. Di halaman sungguhan isinya dirender apa
 * adanya, tanpa pembungkus. Di pratinjau Participant area diberi penanda
 * `data-beranda` (display: contents, jadi tata letaknya tidak berubah) supaya
 * klik baris di daftar Participant home menggulir pratinjau ke isinya.
 */
export function BagianBeranda({ id, pratinjau, children }: { id: string; pratinjau: boolean; children: ReactNode }) {
  if (!pratinjau || children === null || children === undefined || children === false) return <>{children}</>;
  return (
    <div data-beranda={id} className="contents">
      {children}
    </div>
  );
}
