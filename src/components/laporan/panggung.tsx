"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GAYA_LAPORAN } from "./gaya";

/**
 * Bingkai 16:9 yang mengecilkan kanvas 1280×720 sebagai satu gambar. Teks di
 * dalamnya tidak pernah mengalir ulang, jadi tidak ada yang bertumpuk di HP.
 */
export function Panggung({ children }: { children: ReactNode }) {
  const bingkai = useRef<HTMLDivElement>(null);
  const [skala, setSkala] = useState(0);
  useLayoutEffect(() => {
    const el = bingkai.current;
    if (!el) return;
    const ukur = () => setSkala(el.clientWidth / 1280);
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={bingkai} className="lp-bingkai relative w-full overflow-hidden rounded-[6px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_8px_24px_rgb(20_30_60/0.10)]" style={{ aspectRatio: "16 / 9" }}>
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${skala})`, visibility: skala ? "visible" : "hidden" }}>{children}</div>
    </div>
  );
}

/** Satu tag <style> untuk semua slide di halaman. */
export function GayaLaporan() {
  return <style dangerouslySetInnerHTML={{ __html: GAYA_LAPORAN }} />;
}
