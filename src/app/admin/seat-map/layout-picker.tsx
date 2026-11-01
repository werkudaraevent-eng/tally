"use client";

import type { ReactNode } from "react";
import { LAYOUT_INFO, SEAT_MAP_LAYOUTS, type SeatMapLayout } from "@/lib/seat-map";
import { cx } from "@/lib/m3/cx";

// Pemilih tata ruang bergambar. Nama seperti "Hollow square" atau "Cabaret"
// sulit dibayangkan dari daftar teks; pemilih template ruangan di Social
// Tables dan Allseated memakai gambar kecil karena alasan yang sama.

export type PilihanLayout = SeatMapLayout | "mixed";

const titik = (cx0: number, cy0: number, r: number, sudut: number[]) =>
  sudut.map((a) => <circle key={`${cx0}-${a}`} cx={cx0 + r * Math.cos((a * Math.PI) / 180)} cy={cy0 + r * Math.sin((a * Math.PI) / 180)} r={1.8} />);

const GAMBAR: Record<PilihanLayout, ReactNode> = {
  banquet_round: (
    <>
      <g fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={11} cy={15} r={6} /><circle cx={33} cy={15} r={6} /></g>
      <g fill="currentColor">{titik(11, 15, 10, [0, 60, 120, 180, 240, 300])}{titik(33, 15, 10, [0, 60, 120, 180, 240, 300])}</g>
    </>
  ),
  cabaret: (
    <>
      <g fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={11} cy={11} r={6} /><circle cx={33} cy={11} r={6} /></g>
      <g fill="currentColor">{titik(11, 11, 10, [20, 65, 115, 160])}{titik(33, 11, 10, [20, 65, 115, 160])}</g>
    </>
  ),
  theater: <g fill="currentColor">{[6, 13, 20, 27].flatMap((y) => [4, 10, 16, 22, 28, 34, 40].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} />))}</g>,
  classroom: (
    <>
      <g fill="none" stroke="currentColor" strokeWidth={1.5}><rect x={3} y={5} width={16} height={4} /><rect x={25} y={5} width={16} height={4} /><rect x={3} y={18} width={16} height={4} /><rect x={25} y={18} width={16} height={4} /></g>
      <g fill="currentColor">{[13, 26].flatMap((y) => [7, 15, 29, 37].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} />))}</g>
    </>
  ),
  u_shape: <path d="M10 4v20h24V4" fill="none" stroke="currentColor" strokeWidth={3} />,
  hollow_square: <rect x={10} y={4} width={24} height={22} fill="none" stroke="currentColor" strokeWidth={3} />,
  boardroom: (
    <>
      <rect x={8} y={10} width={28} height={10} rx={2} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <g fill="currentColor">{[13, 19, 25, 31].flatMap((x) => [<circle key={`a${x}`} cx={x} cy={6} r={1.8} />, <circle key={`b${x}`} cx={x} cy={24} r={1.8} />])}</g>
    </>
  ),
  head_table: (
    <>
      <rect x={8} y={3} width={28} height={5} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <g fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx={13} cy={21} r={5} /><circle cx={31} cy={21} r={5} /></g>
    </>
  ),
  mixed: (
    <>
      <g fill="none" stroke="currentColor" strokeWidth={1.5}><rect x={6} y={3} width={10} height={5} rx={2} /><rect x={28} y={3} width={10} height={5} rx={2} /></g>
      <g fill="currentColor">{[15, 21, 27].flatMap((y) => [4, 10, 16, 22, 28, 34, 40].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} />))}</g>
    </>
  ),
};

/** Nama pendek di kartu. Nama lengkap dan deskripsinya tetap di bawah pemilih. */
const NAMA_KARTU: Record<PilihanLayout, string> = {
  banquet_round: "Banquet",
  cabaret: "Cabaret",
  theater: "Theater",
  classroom: "Classroom",
  u_shape: "U-shape",
  hollow_square: "Hollow square",
  boardroom: "Boardroom",
  head_table: "Head table + banquet",
  mixed: "Mixed sections",
};

export function LayoutPicker({ value, onChange, terkunci }: {
  value: PilihanLayout;
  onChange: (value: PilihanLayout) => void;
  /** Selain yang terpilih, semua nonaktif: ada peserta yang sudah duduk. */
  terkunci: boolean;
}) {
  const pilihan: PilihanLayout[] = [...SEAT_MAP_LAYOUTS, "mixed"];
  const keterangan = value === "mixed"
    ? "Sections stacked from the stage backwards. Each section has its own layout and its own seat labels."
    : `${LAYOUT_INFO[value].desc} ${LAYOUT_INFO[value].labelHint}.`;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-body-medium font-medium text-on-surface">Layout</legend>
      <div className="grid grid-cols-3 gap-2">
        {pilihan.map((item) => {
          const on = item === value;
          const mati = terkunci && !on;
          return (
            <label
              key={item}
              className={cx(
                "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-md border px-1.5 py-2 text-center text-body-small focus-within:ring-2 focus-within:ring-primary",
                on ? "border-2 border-primary bg-accent-soft text-primary" : "border-outline-variant text-on-surface-variant",
                mati ? "cursor-not-allowed opacity-40" : !on && "cursor-pointer hover:bg-primary-soft",
              )}
            >
              <input type="radio" name="layout-type" value={item} checked={on} disabled={mati} onChange={() => onChange(item)} className="sr-only" />
              <svg width={44} height={30} viewBox="0 0 44 30" aria-hidden>{GAMBAR[item]}</svg>
              <span className="text-on-surface">{NAMA_KARTU[item]}</span>
            </label>
          );
        })}
      </div>
      <p className="text-body-medium text-on-surface-variant">{keterangan}</p>
    </fieldset>
  );
}
