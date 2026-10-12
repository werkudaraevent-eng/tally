"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
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
// 3. Baris petunjuk di bawah denah dengan dua tombol panah (48px) untuk
//    tamu yang tidak terpikir menggeser. Pudar saja terlalu halus: di layar gelap ia terbaca sebagai
//    kursi yang redup, bukan sebagai tanda geser.
// 4. Setelah tamu mencari namanya, denah bergeser sendiri sampai kursinya di
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

const FADE = 56;

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

  // Satu ketukan menggeser hampir selebar layar, menyisakan sedikit kursi lama
  // supaya tamu tidak kehilangan jejak posisinya.
  const nudge = (direction: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.75, behavior: "smooth" });
  };

  const fadeLeft = view.left > 2;
  const fadeRight = view.max - view.left > 2;
  const mask = `linear-gradient(to right, ${fadeLeft ? "transparent" : "#000"} 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${fadeRight ? "transparent" : "#000"} 100%)`;

  // Huruf baris hanya ada pada theater (baris tanpa meja). Huruf tempel muncul
  // begitu huruf aslinya sudah tergeser keluar layar.
  const rows = geometry.tables.filter((table) => table.shape === "none");
  const rowLetterX = rows.length > 0 ? Math.max(...rows.map((table) => table.x)) * scale : 0;
  const showStickyRows = rows.length > 0 && scale > 0 && view.left > rowLetterX - 12;

  return (
    <div>
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

      {view.max > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-3" style={{ color: textColor }}>
          <EdgeButton side="left" disabled={!fadeLeft} textColor={textColor} backgroundColor={backgroundColor} onClick={() => nudge(-1)} />
          <p className="text-center text-body-medium font-semibold">Geser untuk lihat semua kursi</p>
          <EdgeButton side="right" disabled={!fadeRight} textColor={textColor} backgroundColor={backgroundColor} onClick={() => nudge(1)} />
        </div>
      ) : null}
    </div>
  );
}

function EdgeButton({ side, disabled, textColor, backgroundColor, onClick }: { side: "left" | "right"; disabled: boolean; textColor: string; backgroundColor: string; onClick: () => void }) {
  const Icon = side === "left" ? CaretLeft : CaretRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Geser denah ke kiri" : "Geser denah ke kanan"}
      className="flex size-12 shrink-0 items-center justify-center rounded-full disabled:invisible"
      style={{ background: textColor, color: backgroundColor }}
    >
      <Icon size={22} weight="bold" aria-hidden />
    </button>
  );
}
