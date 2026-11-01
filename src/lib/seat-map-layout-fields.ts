import { layoutDefaults, SEAT_MAP_LAYOUTS, type SeatMapLayout, type SeatMapLayoutParams } from "./seat-map.ts";

// Isian penyunting per tata ruang, sebagai DATA.
//
// Dulu setiap isian ditulis sebagai cabang `if layout_type === …` di halaman
// admin, jadi menambah satu tata ruang berarti menyentuh halaman, LAYOUT_INFO,
// nilai bawaan, dan geometri di empat tempat. Sekarang halaman hanya
// menggambar daftar ini; tata ruang baru = satu entri di sini (plus geometri dan
// LAYOUT_INFO). `seat-map-layout-fields.check.ts` memastikan setiap tata ruang
// punya entri dan setiap batas memuat nilai bawaannya.

export type KunciAngka = "rows" | "per_row" | "seats_per_table" | "seats_per_side" | "seats_head" | "head_seats";

export type IsianAngka = { key: KunciAngka; label: string; min: number; max: number };

export type BarisIsian =
  /** Sudut kursi di meja bulat (pilihan jadi + sudut sendiri). */
  | { kind: "arc" }
  /** Dua angka berdampingan. */
  | { kind: "pair"; fields: [IsianAngka, IsianAngka] }
  /** Satu angka, kolom sempit. */
  | { kind: "single"; field: IsianAngka }
  /** Lorong setelah kursi ke-n, dipisah koma. */
  | { kind: "aisles"; label: string; hint: string };

const baris = (key: KunciAngka, label: string, min: number, max: number): IsianAngka => ({ key, label, min, max });

const SISI = (kepala: string): BarisIsian => ({
  kind: "pair",
  fields: [baris("seats_per_side", "Seats per long side", 1, 40), baris("seats_head", kepala, 0, 20)],
});

export const LAYOUT_FIELDS: Record<SeatMapLayout, BarisIsian[]> = {
  banquet_round: [{ kind: "arc" }],
  cabaret: [{ kind: "arc" }],
  theater: [
    { kind: "pair", fields: [baris("rows", "Rows", 1, 40), baris("per_row", "Seats per row", 1, 40)] },
    { kind: "aisles", label: "Aisle after seat number", hint: "Separate with commas. Leave empty for no aisles." },
  ],
  classroom: [
    { kind: "pair", fields: [baris("rows", "Rows", 1, 40), baris("per_row", "Tables per row", 1, 40)] },
    { kind: "single", field: baris("seats_per_table", "Seats per table", 1, 12) },
  ],
  u_shape: [SISI("Seats on the head side")],
  hollow_square: [SISI("Seats on the head side")],
  boardroom: [SISI("Seats at the table ends")],
  head_table: [{ kind: "arc" }, { kind: "single", field: baris("head_seats", "Head table seats", 1, 26) }],
};

/** Tata ruang meja bulat: punya isian sudut, baris meja, dan aturan kursi per meja. */
export function pakaiMejaBulat(layout: SeatMapLayout): boolean {
  return LAYOUT_FIELDS[layout].some((item) => item.kind === "arc");
}

/** Semua isian angka sebuah tata ruang, untuk pemeriksaan. */
export function isianAngka(layout: SeatMapLayout): IsianAngka[] {
  return LAYOUT_FIELDS[layout].flatMap((item) => (item.kind === "pair" ? item.fields : item.kind === "single" ? [item.field] : []));
}

export function nilaiBawaan(layout: SeatMapLayout, key: KunciAngka): number {
  return (layoutDefaults(layout) as SeatMapLayoutParams)[key];
}

export const SEMUA_LAYOUT = SEAT_MAP_LAYOUTS;
