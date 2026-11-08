"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { LANDING_HEADING_FONTS } from "@/lib/domain";
import type { HariHighlight } from "@/lib/laporan/harian/jenis";
import { HalamanHarianView, LEBAR, TINGGI } from "./halaman";

/** Nama huruf ("Plus Jakarta Sans") ke variabel CSS halaman acara, untuk pratinjau di peramban. */
const cssHuruf = (nama: string) => Object.values(LANDING_HEADING_FONTS).find((f) => f.label === nama)?.cssVar ?? "var(--font-sans)";

/** Satu halaman 1080×1920 dikecilkan ke lebar bingkainya, seperti gambar. */
function Bingkai({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [skala, setSkala] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ukur = () => setSkala(el.clientWidth / LEBAR);
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-lg shadow-[0_1px_2px_rgb(0_0_0/0.08),0_8px_24px_rgb(20_30_60/0.10)]" style={{ aspectRatio: `${LEBAR} / ${TINGGI}` }}>
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${skala})`, visibility: skala ? "visible" : "hidden" }}>{children}</div>
    </div>
  );
}

/** Carousel geser seperti di ponsel: tiap halaman selebar 220-260 px. */
export function CarouselHarian({ hari }: { hari: HariHighlight }) {
  const huruf = { judul: cssHuruf(hari.huruf.judul), isi: cssHuruf(hari.huruf.isi) };
  const total = hari.halaman.length;
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3" tabIndex={0} aria-label={`${total} images, scroll sideways`}>
      {hari.halaman.map((p, i) => (
        <figure key={p.kunci} className="m-0 w-[min(200px,62vw)] shrink-0 snap-start" aria-label={`Image ${i + 1} of ${total}`}>
          <Bingkai><HalamanHarianView hari={hari} p={p} nomor={i + 1} total={total} huruf={huruf} /></Bingkai>
        </figure>
      ))}
    </div>
  );
}
