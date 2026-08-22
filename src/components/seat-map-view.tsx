"use client";

import { useMemo } from "react";
import { computeSeatMapGeometry, normalizeSeatLabel, readableOn, resolveSeatColors, type SeatColors, type SeatMapConfig } from "@/lib/seat-map";

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
  /**
   * Warna latar denah. Dipakai untuk DUA hal sekaligus: isian kanvas dan warna
   * teks di atas bentuk terang (nomor meja, label panggung, kursi kosong).
   * Karena itu nilainya tidak boleh "transparent" — teksnya akan ikut hilang.
   * Untuk kanvas tembus pandang, pakai `canvasColor`.
   */
  backgroundColor?: string;
  /**
   * Isian kanvas SVG, bila perlu berbeda dari `backgroundColor`. Diisi
   * "transparent" saat di belakang denah ada gambar latar: tanpa ini denah
   * menutupi gambar dengan kotak warna solid, sehingga gambar hanya terlihat di
   * pinggir halaman. Default-nya mengikuti `backgroundColor`, jadi pemanggil
   * yang memakai warna solid tidak perlu tahu properti ini ada.
   */
  canvasColor?: string;
  textColor?: string;
  accentColor?: string;
  /** Menampilkan huruf kursi. Dimatikan otomatis saat denah sangat padat. */
  showSeatCodes?: boolean;
  /** Mewarnai kursi menurut kehadiran, bukan sekadar terisi. */
  showAttendance?: boolean;
  /**
   * Warna kursi pilihan admin. Setiap field boleh null, artinya "ikuti perilaku
   * lama" — kosong memakai `backgroundColor`, terisi memakai `textColor`, dan
   * check-in memakai hijau bawaan. Prop ini opsional supaya pemanggil yang belum
   * mengaturnya tidak perlu berubah sama sekali.
   */
  seatColors?: Partial<SeatColors> | null;
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
  canvasColor,
  textColor = "#ffffff",
  accentColor = "#f2c14e",
  showSeatCodes = true,
  showAttendance = false,
  seatColors,
  maxHeight,
  onSeatClick,
  onTableClick,
  className,
}: SeatMapViewProps) {
  const geometry = useMemo(() => computeSeatMapGeometry(config), [config]);

  // Null diselesaikan SEKALI di sini, bukan di dalam perulangan kursi. Selain
  // lebih murah, ini membuat satu-satunya sumber jawaban "warna apa yang benar
  // dipakai" berada di `resolveSeatColors`, sehingga pratinjau CMS tidak dapat
  // menyimpang dari layar tamu.
  //
  // Namanya `palette`, bukan `seat`: perulangan di bawah sudah memakai `seat`
  // untuk satu kursi, dan nama yang sama membuat `seat.available` diam-diam
  // membaca field yang tidak ada pada `SeatGeometry` — undefined, tanpa satu pun
  // keluhan dari TypeScript, dan kursi kehilangan warnanya.
  const palette = useMemo(
    () => resolveSeatColors(seatColors, { backgroundColor, textColor }),
    [seatColors, backgroundColor, textColor],
  );

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
      <p className="rounded-lg border border-dashed border-outline-variant bg-panel-high p-6 text-center text-body-medium text-on-surface-variant">
        Denah belum punya baris meja. Tambahkan baris di pengaturan denah.
      </p>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className={className}
      style={{ background: canvasColor ?? backgroundColor, display: "block", width: "100%", height: "auto", maxHeight }}
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
            {/* Bentuk meja mengikuti tata ruangnya. `none` dipakai theater:
                barisnya bukan meja, jadi tidak ada apa pun yang digambar selain
                label barisnya di pinggir kiri. */}
            {table.shape === "round" ? (
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
            ) : table.shape === "rect" ? (
              <rect
                x={table.x - (table.w ?? 0) / 2}
                y={table.y - (table.h ?? 0) / 2}
                width={table.w ?? 0}
                height={table.h ?? 0}
                rx={table.r}
                fill={tableHighlighted ? accentColor : textColor}
                stroke={tableHighlighted ? textColor : "transparent"}
                strokeWidth={2.5}
                onClick={onTableClick ? () => onTableClick(table.number) : undefined}
                style={onTableClick ? { cursor: "pointer" } : undefined}
              />
            ) : null}
            <text
              x={table.x}
              y={table.y}
              textAnchor={table.shape === "none" ? "end" : "middle"}
              dominantBaseline="central"
              fill={table.shape === "none" ? textColor : backgroundColor}
              // Label bisa lebih panjang dari satu atau dua angka ("3A"), jadi
              // ukuran huruf mengecil mengikuti panjangnya. Tanpa ini "3A" pada
              // ukuran 26 sudah menyentuh tepi bulatan, dan label yang menyentuh
              // tepi terbaca terpotong dari kursi tamu di seberang meja.
              fontSize={table.shape === "none" ? 19 : table.label.length > 3 ? 18 : table.label.length > 2 ? 22 : 26}
              fontWeight={600}
              pointerEvents="none"
            >
              {table.label}
            </text>

            {/* Deskripsi per meja untuk pembaca layar. Denah visual saja tidak
                terbaca, jadi tiap meja membawa ringkasan keterisiannya. */}
            <title>{`Meja ${table.label}: ${occupiedCount} dari ${tableSeats.length} kursi terisi`}</title>

            {tableSeats.map((seat) => {
              const key = normalizeSeatLabel(seat.label);
              const state = seatStates[key];
              const isHighlighted = highlighted.has(key);

              // Urutan penentu warna: sorotan menang atas segalanya, lalu
              // kehadiran (bila diminta), lalu terisi, terakhir kosong.
              let fill = palette.available;
              let stroke = palette.outline;
              let strokeWidth = 1.5;

              if (isHighlighted) {
                fill = accentColor;
                stroke = textColor;
                strokeWidth = 2.5;
              } else if (state?.occupied) {
                if (showAttendance) {
                  fill = state.checkedIn ? palette.checkedIn : palette.occupied;
                  stroke = fill;
                } else {
                  fill = palette.occupied;
                  stroke = fill;
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
                      // Teks harus kontras terhadap ISIAN KURSI yang sebenarnya
                      // dipakai, bukan terhadap tebakan.
                      //
                      // Versi lama menulis `occupied ? backgroundColor : textColor`,
                      // yang benar hanya selama kursi terisi pasti berwarna terang
                      // (dulu selalu putih). Begitu admin boleh memilih warna, kursi
                      // terisi bisa gelap dan hurufnya ikut gelap — hilang sama
                      // sekali. `readableOn` menghitungnya dari luminansi isian, jadi
                      // pilihan warna apa pun tetap terbaca.
                      fill={readableOn(fill, backgroundColor, textColor)}
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
