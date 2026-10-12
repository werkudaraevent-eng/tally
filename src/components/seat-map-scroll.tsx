"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { computeSeatMapGeometry, normalizeSeatLabel, type SeatMapConfig } from "@/lib/seat-map";

// Wadah gulir denah publik di /denah.
//
// Denah sengaja tetap selebar `minWidth` di HP, bukan dikecilkan sampai muat:
// pada denah theater 26 kursi per baris, versi yang dipaskan ke layar 390px
// menyisakan kursi selebar 8px yang nomornya tak terbaca. Akibatnya denah
// terpotong di tepi layar, jadi wadah ini menambahkan tiga hal supaya potongan
// itu tidak terbaca sebagai denah yang rusak:
// 1. Tepi yang masih punya isi di baliknya dipudarkan, tanda bisa digeser.
// 2. Huruf baris (theater) menempel di tepi kiri saat denah digeser, supaya
//    tamu tetap tahu sedang melihat baris mana.
// 3. Setelah tamu mencari namanya, denah bergeser sendiri sampai kursinya di
//    tengah layar.

type Props = {
  config: Partial<SeatMapConfig> | null | undefined;
  highlightedSeatLabels: string[];
  textColor: string;
  /** Warna di belakang huruf baris yang menempel, supaya tidak menimpa kursi. */
  backgroundColor: string;
  minWidth?: number;
  children: ReactNode;
};

const FADE = 40;

export function SeatMapScroll({ config, highlightedSeatLabels, textColor, backgroundColor, minWidth = 820, children }: Props) {
  const geometry = useMemo(() => computeSeatMapGeometry(config), [config]);
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ left: 0, max: 0, width: 0 });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setView({ left: el.scrollLeft, max: el.scrollWidth - el.clientWidth, width: el.scrollWidth });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const scale = geometry.width > 0 ? view.width / geometry.width : 0;

  // Geser ke kursi yang dicari. Hanya kursi pertama yang dipakai: tamu dengan
  // dua kursi di sesi yang sama hampir selalu duduk bersebelahan.
  useEffect(() => {
    const el = scroller.current;
    if (!el || highlightedSeatLabels.length === 0 || el.scrollWidth <= el.clientWidth) return;
    const target = normalizeSeatLabel(highlightedSeatLabels[0]);
    const seat = geometry.tables.flatMap((table) => table.seats).find((item) => normalizeSeatLabel(item.label) === target);
    if (!seat) return;
    const s = el.scrollWidth / geometry.width;
    el.scrollTo({ left: seat.x * s - el.clientWidth / 2, behavior: "smooth" });
  }, [highlightedSeatLabels, geometry]);

  const fadeLeft = view.left > 1;
  const fadeRight = view.max - view.left > 1;
  const mask = `linear-gradient(to right, ${fadeLeft ? "transparent" : "#000"} 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${fadeRight ? "transparent" : "#000"} 100%)`;

  // Huruf baris hanya ada pada theater (baris tanpa meja). Huruf tempel muncul
  // begitu huruf aslinya sudah tergeser keluar layar.
  const rows = geometry.tables.filter((table) => table.shape === "none");
  const rowLetterX = rows.length > 0 ? Math.max(...rows.map((table) => table.x)) * scale : 0;
  const showStickyRows = rows.length > 0 && scale > 0 && view.left > rowLetterX - 12;

  return (
    <div className="relative">
      <div
        ref={scroller}
        className="overflow-x-auto"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        <div style={{ minWidth }}>{children}</div>
      </div>

      {showStickyRows ? (
        <div className="pointer-events-none absolute inset-y-0 left-0" aria-hidden="true">
          {rows.map((table) => (
            <span
              key={table.number}
              className="absolute left-1 flex -translate-y-1/2 items-center justify-center rounded-sm px-1.5 font-semibold"
              style={{
                top: table.y * scale,
                fontSize: Math.max(12, 19 * scale),
                lineHeight: 1.4,
                color: textColor,
                background: backgroundColor,
              }}
            >
              {table.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
