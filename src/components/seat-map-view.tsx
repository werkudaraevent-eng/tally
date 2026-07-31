"use client";

import { useMemo } from "react";
import { computeSeatMapGeometry, normalizeSeatLabel, type SeatMapConfig } from "@/lib/seat-map";

// Renderer denah. Satu komponen dipakai bersama halaman publik dan editor CMS.
//
// Kenapa satu renderer: kalau editor dan halaman publik punya penggambar
// masing-masing, keduanya akan pelan-pelan berbeda, dan admin menata sesuatu
// yang tidak sama dengan yang dilihat tamu.
//
// SVG, bukan canvas: teks nomor meja tetap tajam saat di-zoom di ponsel, bisa
// diberi atribut aksesibilitas, dan tiap kursi jadi elemen yang bisa ditekan
// tanpa perhitungan hit-test manual.

/** Ringkasan keterisian satu kursi. Sengaja tanpa nama: pemanggil yang memutuskan. */
export type SeatState = {
  occupied: boolean;
  checkedIn: boolean;
};

export type SeatMapViewProps = {
  config: Partial<SeatMapConfig> | null | undefined;
  /** Kunci: label kursi yang sudah dinormalisasi. */
  seatStates?: Record<string, SeatState>;
  /** Label kursi yang disorot, misalnya hasil pencarian nama tamu. */
  highlightedSeatLabels?: string[];
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  /** Menampilkan huruf kursi. Dimatikan otomatis saat denah sangat padat. */
  showSeatCodes?: boolean;
  /** Mewarnai kursi menurut kehadiran, bukan sekadar terisi. */
  showAttendance?: boolean;
  /**
   * Batas tinggi, misalnya "58vh" atau "var(--x)". Denah akan mengecil sendiri
   * agar utuh di dalam batas itu, bukan terpotong, karena viewBox menjaga
   * seluruh isinya tetap masuk.
   */
  maxHeight?: string;
  onSeatClick?: (seatLabel: string, tableNumber: number) => void;
  onTableClick?: (tableNumber: number) => void;
  className?: string;
};

const EMPTY_STATES: Record<string, SeatState> = {};
const EMPTY_HIGHLIGHTS: string[] = [];

export function SeatMapView({
  config,
  seatStates = EMPTY_STATES,
  highlightedSeatLabels = EMPTY_HIGHLIGHTS,
  backgroundColor = "#111a63",
  textColor = "#ffffff",
  accentColor = "#f2c14e",
  showSeatCodes = true,
  showAttendance = false,
  maxHeight,
  onSeatClick,
  onTableClick,
  className,
}: SeatMapViewProps) {
  const geometry = useMemo(() => computeSeatMapGeometry(config), [config]);

  // Dinormalisasi sekali; kalau tidak, tiap kursi akan menormalisasi ulang
  // seluruh daftar sorotan dan pekerjaannya jadi berlipat.
  const highlighted = useMemo(
    () => new Set(highlightedSeatLabels.map(normalizeSeatLabel)),
    [highlightedSeatLabels],
  );

  const hasHighlight = highlighted.size > 0;
  const interactive = Boolean(onSeatClick || onTableClick);

  if (geometry.tables.length === 0) {
    return (
      <p className="border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-6 text-center text-sm text-[var(--ink-muted)]">
        Denah belum punya baris meja. Tambahkan baris di pengaturan denah.
      </p>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className={className}
      style={{ background: backgroundColor, display: "block", width: "100%", height: "auto", maxHeight }}
      role="img"
      aria-label={`Denah tempat duduk, ${geometry.totalTables} meja dan ${geometry.totalSeats} kursi. Acuan arah: ${geometry.stage.label} berada di depan.`}
    >
      {/* Panggung digambar lebih dulu: ia acuan arah pandang, jadi harus terbaca
          sebelum mata mencari nomor meja. */}
      <g>
        <rect
          x={geometry.stage.x}
          y={geometry.stage.y}
          width={geometry.stage.width}
          height={geometry.stage.height}
          rx={3}
          fill={textColor}
        />
        <text
          x={geometry.stage.x + geometry.stage.width / 2}
          y={geometry.stage.y + geometry.stage.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={backgroundColor}
          fontSize={20}
          fontWeight={600}
          letterSpacing={1.5}
        >
          {geometry.stage.label}
        </text>
      </g>

      {geometry.tables.map((table) => {
        const tableSeats = table.seats;
        const occupiedCount = tableSeats.filter((seat) => seatStates[normalizeSeatLabel(seat.label)]?.occupied).length;
        const tableHighlighted = tableSeats.some((seat) => highlighted.has(normalizeSeatLabel(seat.label)));

        // Saat ada sorotan, meja lain diredupkan supaya tamu langsung menemukan
        // mejanya sendiri tanpa membaca 32 nomor satu per satu.
        const dimmed = hasHighlight && !tableHighlighted;

        return (
          <g key={table.number} opacity={dimmed ? 0.28 : 1} style={{ transition: "opacity 200ms" }}>
            <circle
              cx={table.x}
              cy={table.y}
              r={table.r}
              fill={tableHighlighted ? accentColor : textColor}
              stroke={tableHighlighted ? textColor : "transparent"}
              strokeWidth={2.5}
              onClick={onTableClick ? () => onTableClick(table.number) : undefined}
              style={onTableClick ? { cursor: "pointer" } : undefined}
            />
            <text
              x={table.x}
              y={table.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={backgroundColor}
              fontSize={26}
              fontWeight={600}
              pointerEvents="none"
            >
              {table.number}
            </text>

            {/* Deskripsi per meja untuk pembaca layar. Denah visual saja tidak
                terbaca, jadi tiap meja membawa ringkasan keterisiannya. */}
            <title>{`Meja ${table.number}: ${occupiedCount} dari ${tableSeats.length} kursi terisi`}</title>

            {tableSeats.map((seat) => {
              const key = normalizeSeatLabel(seat.label);
              const state = seatStates[key];
              const isHighlighted = highlighted.has(key);

              // Urutan penentu warna: sorotan menang atas segalanya, lalu
              // kehadiran (bila diminta), lalu terisi, terakhir kosong.
              let fill = backgroundColor;
              let stroke = textColor;
              let strokeWidth = 1.5;

              if (isHighlighted) {
                fill = accentColor;
                stroke = textColor;
                strokeWidth = 2.5;
              } else if (state?.occupied) {
                if (showAttendance) {
                  fill = state.checkedIn ? "#237a52" : textColor;
                  stroke = state.checkedIn ? "#237a52" : textColor;
                } else {
                  fill = textColor;
                }
              }

              const clickable = Boolean(onSeatClick);

              return (
                <g key={seat.label}>
                  <circle
                    cx={seat.x}
                    cy={seat.y}
                    r={seat.r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    onClick={clickable ? () => onSeatClick?.(seat.label, seat.tableNumber) : undefined}
                    style={clickable ? { cursor: "pointer" } : undefined}
                  />
                  {showSeatCodes ? (
                    <text
                      x={seat.x}
                      y={seat.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      // Teks harus kontras terhadap isian kursi, bukan terhadap
                      // latar denah, kalau tidak huruf hilang saat kursi terisi.
                      fill={isHighlighted || state?.occupied ? backgroundColor : textColor}
                      fontSize={9}
                      fontWeight={600}
                      pointerEvents="none"
                    >
                      {seat.code}
                    </text>
                  ) : null}
                  <title>{`Kursi ${seat.label}${state?.occupied ? " — terisi" : " — kosong"}`}</title>
                </g>
              );
            })}
          </g>
        );
      })}

      {interactive ? null : <desc>Denah hanya untuk dilihat.</desc>}
    </svg>
  );
}
