// Geometri denah tempat duduk. Modul murni: tidak menyentuh database, tidak
// menyentuh React, sehingga editor CMS dan halaman publik memakai hasil hitungan
// yang sama persis.
//
// Kenapa dihitung, bukan disimpan per meja: denah acara ini sangat teratur
// (4 baris berisi 8, 9, 8, dan 7 meja). Menyimpan x/y tiap meja hanya membuka
// peluang meja tersimpan tumpang tindih atau keluar kanvas, dan kesalahan
// seperti itu baru terlihat saat sudah tampil di depan tamu.

export type SeatRule = { from: number; to: number; seats: number };
export type TableOffset = { dx: number; dy: number };

export type SeatMapConfig = {
  stage_label: string;
  row_table_counts: number[];
  seat_rules: SeatRule[];
  seat_label_pattern: string;
  table_overrides: Record<string, TableOffset>;
};

export type SeatGeometry = {
  /** Huruf kursi di dalam mejanya, misalnya "C". */
  code: string;
  /** Label penuh hasil pola, dipakai mencocokkan dengan data scanner API. */
  label: string;
  tableNumber: number;
  x: number;
  y: number;
  r: number;
};

export type TableGeometry = {
  number: number;
  x: number;
  y: number;
  r: number;
  rowIndex: number;
  seats: SeatGeometry[];
};

export type SeatMapGeometry = {
  width: number;
  height: number;
  stage: { x: number; y: number; width: number; height: number; label: string };
  tables: TableGeometry[];
  totalTables: number;
  totalSeats: number;
};

// Ukuran dalam satuan koordinat SVG. Skala akhir diserahkan ke viewBox supaya
// denah ikut melebar mengikuti lebar layar tanpa perhitungan ulang.
const TABLE_RADIUS = 33;
const SEAT_RADIUS = 10.5;
const SEAT_ORBIT = 47;
const CELL_WIDTH = 132;
const CELL_HEIGHT = 126;
const PADDING_X = 40;
const STAGE_TOP = 34;
const STAGE_HEIGHT = 46;
const STAGE_GAP = 78;
const PADDING_BOTTOM = 34;

// Kursi disebar pada busur yang menyisakan celah di sisi panggung, meniru denah
// asli: tidak ada kursi yang membelakangi layar.
const SEAT_ARC_SWEEP = 300;
const SEAT_ARC_CENTER = 90; // 90 derajat = sisi bawah pada koordinat SVG (y ke bawah).

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const MAX_SEATS_PER_TABLE = LETTERS.length;

/** Huruf kursi ke-index, 0 -> "A". */
export function seatLetter(index: number) {
  return LETTERS[index] ?? String(index + 1);
}

/** Jumlah kursi untuk sebuah nomor meja menurut aturan rentang. */
export function seatCountForTable(tableNumber: number, rules: SeatRule[]) {
  // Aturan terakhir yang cocok menang, sehingga admin bisa menambahkan
  // pengecualian untuk satu meja di bawah aturan umum.
  let count = 0;
  for (const rule of rules) {
    if (tableNumber >= rule.from && tableNumber <= rule.to) count = rule.seats;
  }
  return count;
}

/**
 * Label kursi dari pola. Token yang dikenali: {table} dan {seat}.
 *
 * Sengaja dibuat sebagai pola, bukan hasil menebak format lewat parsing string
 * dari API. Kalau panitia memakai gaya penulisan lain, admin cukup mengganti
 * satu pola dan seluruh label ikut benar; parsing akan pecah satu per satu.
 */
export function buildSeatLabel(pattern: string, tableNumber: number, seatCode: string) {
  return pattern.replaceAll("{table}", String(tableNumber)).replaceAll("{seat}", seatCode);
}

/**
 * Bentuk pembanding label. Perbedaan huruf besar-kecil dan spasi ganda adalah
 * beda penulisan, bukan beda kursi, jadi diseragamkan sebelum dicocokkan.
 * Label asli tetap disimpan apa adanya untuk ditampilkan.
 */
export function normalizeSeatLabel(label: string) {
  return label.trim().replace(/\s+/g, " ").toUpperCase();
}

function sanitizeRowCounts(counts: unknown): number[] {
  if (!Array.isArray(counts)) return [];
  return counts
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0))
    .filter((value) => value > 0);
}

function sanitizeRules(rules: unknown): SeatRule[] {
  if (!Array.isArray(rules)) return [];
  const result: SeatRule[] = [];
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") continue;
    const { from, to, seats } = rule as Record<string, unknown>;
    if (typeof from !== "number" || typeof to !== "number" || typeof seats !== "number") continue;
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(seats)) continue;
    result.push({
      from: Math.max(1, Math.floor(from)),
      to: Math.max(1, Math.floor(to)),
      seats: Math.min(MAX_SEATS_PER_TABLE, Math.max(0, Math.floor(seats))),
    });
  }
  return result;
}

function sanitizeOverrides(overrides: unknown): Record<string, TableOffset> {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return {};
  const result: Record<string, TableOffset> = {};
  for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const { dx, dy } = value as Record<string, unknown>;
    const safeDx = typeof dx === "number" && Number.isFinite(dx) ? dx : 0;
    const safeDy = typeof dy === "number" && Number.isFinite(dy) ? dy : 0;
    if (safeDx === 0 && safeDy === 0) continue;
    result[key] = { dx: safeDx, dy: safeDy };
  }
  return result;
}

/** Membersihkan konfigurasi mentah dari database menjadi bentuk yang aman dipakai. */
export function normalizeConfig(raw: Partial<SeatMapConfig> | null | undefined): SeatMapConfig {
  const pattern = typeof raw?.seat_label_pattern === "string" && raw.seat_label_pattern.includes("{table}") && raw.seat_label_pattern.includes("{seat}")
    ? raw.seat_label_pattern
    : "{table}{seat}";
  return {
    stage_label: typeof raw?.stage_label === "string" && raw.stage_label.trim() ? raw.stage_label : "LED SCREEN",
    row_table_counts: sanitizeRowCounts(raw?.row_table_counts),
    seat_rules: sanitizeRules(raw?.seat_rules),
    seat_label_pattern: pattern,
    table_overrides: sanitizeOverrides(raw?.table_overrides),
  };
}

/**
 * Menghitung posisi seluruh meja dan kursi.
 *
 * Nomor meja berjalan menerus dari baris terdepan (paling dekat panggung) ke
 * belakang, mengikuti denah asli: baris pertama 1-8, baris kedua 9-17, dan
 * seterusnya. Setiap baris dipusatkan secara horizontal supaya baris yang lebih
 * pendek tetap terlihat seimbang.
 */
export function computeSeatMapGeometry(input: Partial<SeatMapConfig> | null | undefined): SeatMapGeometry {
  const config = normalizeConfig(input);
  const rows = config.row_table_counts;
  const widestRow = rows.reduce((max, count) => Math.max(max, count), 0);

  const width = Math.max(widestRow, 1) * CELL_WIDTH + PADDING_X * 2;
  const height = STAGE_TOP + STAGE_HEIGHT + STAGE_GAP + Math.max(rows.length, 1) * CELL_HEIGHT + PADDING_BOTTOM;

  // Panggung dibuat selebar dua per tiga kanvas dan dipusatkan: ia acuan arah
  // pandang, jadi harus terbaca lebih dulu sebelum mata mencari nomor meja.
  const stageWidth = Math.round(width * 0.66);
  const stage = {
    x: Math.round((width - stageWidth) / 2),
    y: STAGE_TOP,
    width: stageWidth,
    height: STAGE_HEIGHT,
    label: config.stage_label,
  };

  const firstRowCenterY = STAGE_TOP + STAGE_HEIGHT + STAGE_GAP + CELL_HEIGHT / 2;
  const tables: TableGeometry[] = [];
  let tableNumber = 0;

  rows.forEach((countInRow, rowIndex) => {
    const rowWidth = countInRow * CELL_WIDTH;
    const rowStartX = (width - rowWidth) / 2;
    const centerY = firstRowCenterY + rowIndex * CELL_HEIGHT;

    for (let indexInRow = 0; indexInRow < countInRow; indexInRow += 1) {
      tableNumber += 1;
      const offset = config.table_overrides[String(tableNumber)] ?? { dx: 0, dy: 0 };
      const centerX = rowStartX + indexInRow * CELL_WIDTH + CELL_WIDTH / 2 + offset.dx;
      const y = centerY + offset.dy;

      const seatCount = seatCountForTable(tableNumber, config.seat_rules);
      const seats: SeatGeometry[] = [];

      // Satu kursi tidak punya jarak antar kursi, jadi dibagi rata pada busur
      // hanya bila ada lebih dari satu.
      const step = seatCount > 1 ? SEAT_ARC_SWEEP / (seatCount - 1) : 0;
      const startAngle = SEAT_ARC_CENTER + SEAT_ARC_SWEEP / 2;

      for (let seatIndex = 0; seatIndex < seatCount; seatIndex += 1) {
        // Mundur dari sisi kiri, melewati bawah, lalu naik ke sisi kanan.
        // Hasilnya urutan A di kiri atas sampai huruf terakhir di kanan atas,
        // sama seperti denah cetak.
        const angle = ((startAngle - seatIndex * step) * Math.PI) / 180;
        const code = seatLetter(seatIndex);
        seats.push({
          code,
          label: buildSeatLabel(config.seat_label_pattern, tableNumber, code),
          tableNumber,
          x: centerX + Math.cos(angle) * SEAT_ORBIT,
          y: y + Math.sin(angle) * SEAT_ORBIT,
          r: SEAT_RADIUS,
        });
      }

      tables.push({ number: tableNumber, x: centerX, y, r: TABLE_RADIUS, rowIndex, seats });
    }
  });

  return {
    width,
    height,
    stage,
    tables,
    totalTables: tables.length,
    totalSeats: tables.reduce((sum, table) => sum + table.seats.length, 0),
  };
}
