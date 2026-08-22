import { generateLayout } from "./seat-map-layouts.ts";

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

/**
 * Cara layar dipakai, bukan sifat acaranya.
 *
 *   * `search` — layar sentuh atau HP tamu; tamu mengetik namanya.
 *   * `qr` — LED publik tanpa sentuh; tidak ada yang bisa mengetik, jadi layar
 *     menampilkan QR agar pencarian pindah ke HP tamu. Nama peserta tidak
 *     pernah tampil di layar besar.
 */
export type PublicViewMode = "search" | "qr";

export const PUBLIC_VIEW_MODES: readonly PublicViewMode[] = ["search", "qr"];

/** Nilai tak dikenal jatuh ke `search`: layar yang bisa dipakai lebih baik daripada layar kosong. */
export function normalizePublicViewMode(value: unknown): PublicViewMode {
  return value === "qr" ? "qr" : "search";
}

/**
 * Warna kursi per agenda. Semua boleh null.
 *
 * Null BUKAN berarti "tanpa warna", melainkan "ikuti perilaku lama". Sebelum
 * kolom-kolom ini ada, kursi meminjam warna lain: kosong memakai warna latar,
 * terisi memakai warna TEKS, dan yang sudah check-in memakai hijau yang ditulis
 * langsung di komponen. Menjadikan null sebagai penanda itu membuat denah yang
 * sudah ditata panitia tidak berubah satu piksel pun sampai ada yang benar-benar
 * mengisinya.
 *
 * Idiom yang sama dipakai `title_color` dan `subtitle_color`.
 */
export type SeatColors = {
  /** Isian kursi kosong. Null -> warna latar denah. */
  seat_available_color: string | null;
  /** Isian kursi terisi. Null -> warna teks. */
  seat_occupied_color: string | null;
  /** Isian kursi yang tamunya sudah check-in. Null -> DEFAULT_CHECKED_IN_COLOR. */
  seat_checked_in_color: string | null;
  /** Garis tepi kursi. Null -> warna teks. */
  seat_outline_color: string | null;
};

export const SEAT_COLOR_COLUMNS =
  "seat_available_color,seat_occupied_color,seat_checked_in_color,seat_outline_color";

/**
 * Hijau kehadiran sebelum warna kursi dapat diatur. Tetap dipakai sebagai nilai
 * jatuh-tempo supaya denah yang belum disetel tampil persis seperti sebelumnya.
 */
export const DEFAULT_CHECKED_IN_COLOR = "#237a52";

export const DEFAULT_SEAT_COLORS: SeatColors = {
  seat_available_color: null,
  seat_occupied_color: null,
  seat_checked_in_color: null,
  seat_outline_color: null,
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Hanya hex enam digit yang diterima; sisanya jadi null.
 *
 * Bukan sekadar kerapian. SVG menerima "biru" atau "#fff" tanpa mengeluh lalu
 * mengabaikannya, jadi warna yang salah tulis akan tampil sebagai warna bawaan
 * tanpa satu pun pesan kesalahan — admin mengira setelannya tidak tersimpan.
 * Menjatuhkannya ke null membuat hasilnya sama tetapi maknanya jujur: kolom itu
 * memang tidak berisi warna yang sah.
 */
function normalizeSeatHex(raw: unknown): string | null {
  return typeof raw === "string" && HEX.test(raw) ? raw : null;
}

/** Membaca kolom warna kursi dari baris agenda mana pun. */
export function normalizeSeatColors(raw: Record<string, unknown> | null | undefined): SeatColors {
  if (!raw) return DEFAULT_SEAT_COLORS;
  return {
    seat_available_color: normalizeSeatHex(raw.seat_available_color),
    seat_occupied_color: normalizeSeatHex(raw.seat_occupied_color),
    seat_checked_in_color: normalizeSeatHex(raw.seat_checked_in_color),
    seat_outline_color: normalizeSeatHex(raw.seat_outline_color),
  };
}

/**
 * Warna kursi yang benar-benar dipakai menggambar, setelah null diselesaikan.
 *
 * Penyelesaian null dikerjakan DI SATU TEMPAT, bukan di dalam renderer, supaya
 * editor CMS dapat menampilkan warna efektif yang sama persis dengan yang dilihat
 * tamu. Kalau tiap pemakai menyelesaikan null-nya sendiri, pratinjau dan layar
 * publik akan berbeda begitu salah satunya lupa diperbarui.
 */
export function resolveSeatColors(
  colors: Partial<SeatColors> | null | undefined,
  fallback: { backgroundColor: string; textColor: string },
) {
  return {
    available: colors?.seat_available_color ?? fallback.backgroundColor,
    occupied: colors?.seat_occupied_color ?? fallback.textColor,
    checkedIn: colors?.seat_checked_in_color ?? DEFAULT_CHECKED_IN_COLOR,
    outline: colors?.seat_outline_color ?? fallback.textColor,
  };
}

/**
 * Luminansi relatif (WCAG). 0 = hitam, 1 = putih.
 *
 * Nilai bukan hex dianggap gelap (0). Itu pilihan yang aman: hasilnya teks
 * terang, dan teks terang di atas warna tak dikenal lebih mungkin terbaca
 * daripada teks gelap — latar denah acara ini selalu gelap.
 */
function luminance(hex: string): number {
  if (!HEX.test(hex)) return 0;
  const channel = (start: number) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/**
 * Memilih warna teks yang terbaca di atas sebuah isian.
 *
 * Dibutuhkan begitu warna kursi dapat dipilih admin. Sebelumnya kursi terisi
 * selalu terang (memakai warna teks, praktis selalu putih), jadi huruf kursi
 * cukup memakai warna latar dan pasti kontras. Sekarang admin bisa memilih isian
 * gelap, dan aturan tetap itu membuat huruf gelap di atas kursi gelap: hilang
 * tanpa ada yang menyadarinya sampai denah tampil di layar.
 *
 * Ambang 0.5 memakai luminansi WCAG, bukan rata-rata RGB: mata jauh lebih peka
 * pada hijau, sehingga #00ff00 terbaca terang walau rata-rata RGB-nya hanya 85.
 */
export function readableOn(fill: string, darkText: string, lightText: string): string {
  return luminance(fill) > 0.5 ? darkText : lightText;
}

export type SeatMapConfig = {
  stage_label: string;
  row_table_counts: number[];
  seat_rules: SeatRule[];
  seat_label_pattern: string;
  table_overrides: Record<string, TableOffset>;
  /**
   * Label meja yang menyimpang dari nomor urutnya, bentuk `{"4": "3A"}`.
   *
   * Kuncinya nomor POSISI (meja ke-berapa dari depan, menerus antar baris),
   * bukan label. Dengan begitu mengubah satu label tidak menggeser meja lain:
   * permintaan "meja 4 diganti 3A" tidak boleh mengubah meja 5 sampai 32, sebab
   * denah cetak, kartu meja, dan penempatan peserta sudah memakai nomor itu.
   */
  table_labels: Record<string, string>;
  layout_type: SeatMapLayout;
  layout_params: SeatMapLayoutParams;
};


/**
 * Jenis tata ruang. Menentukan GAMBAR, bukan identitas kursi.
 *
 * Label kursi ("12A") adalah kunci pencocokan dengan penempatan peserta — yang
 * datang dari scanner API, entri manual di modul Peserta, atau impor berkas.
 * Karena itu berpindah layout tidak boleh dilakukan diam-diam setelah ada
 * penempatan masuk: pola labelnya berubah, dan denah akan tampil kosong tanpa
 * satu pun galat. Penjagaannya ada di route handler CMS.
 */
export type SeatMapLayout =
  | "banquet_round"
  | "cabaret"
  | "theater"
  | "classroom"
  | "u_shape"
  | "hollow_square"
  | "boardroom"
  | "head_table";

export const SEAT_MAP_LAYOUTS: readonly SeatMapLayout[] = [
  "banquet_round",
  "cabaret",
  "theater",
  "classroom",
  "u_shape",
  "hollow_square",
  "boardroom",
  "head_table",
];

export const LAYOUT_INFO: Record<SeatMapLayout, { name: string; desc: string; labelHint: string }> = {
  banquet_round: {
    name: "Banquet (meja bundar)",
    desc: "Meja bundar berbaris. Kursi mengelilingi meja, menyisakan celah di sisi panggung.",
    labelHint: "Label kursi: nomor meja + huruf, mis. 12A",
  },
  cabaret: {
    name: "Cabaret (setengah lingkaran)",
    desc: "Meja bundar dengan kursi hanya di sisi menghadap panggung. Tidak ada tamu yang membelakangi layar.",
    labelHint: "Label kursi: nomor meja + huruf, mis. 12A",
  },
  theater: {
    name: "Theater",
    desc: "Baris kursi tanpa meja. Kapasitas terbesar, dipakai untuk seminar dan pembukaan.",
    labelHint: "Label kursi: huruf baris + nomor, mis. A12",
  },
  classroom: {
    name: "Classroom",
    desc: "Meja panjang berbaris menghadap panggung, dua sampai tiga kursi per meja.",
    labelHint: "Label kursi: nomor meja + huruf, mis. 12A",
  },
  u_shape: {
    name: "U-shape",
    desc: "Meja membentuk huruf U dengan kursi di sisi luar. Untuk rapat 15-30 orang.",
    labelHint: "Label kursi: nomor sisi + huruf, mis. 1A",
  },
  hollow_square: {
    name: "Hollow square",
    desc: "Meja membentuk persegi tertutup. Tidak ada kepala meja; semua peserta setara.",
    labelHint: "Label kursi: nomor sisi + huruf, mis. 1A",
  },
  boardroom: {
    name: "Boardroom",
    desc: "Satu meja panjang dengan kursi mengelilinginya. Untuk rapat kecil.",
    labelHint: "Label kursi: nomor meja + huruf, mis. 1A",
  },
  head_table: {
    name: "Head table + banquet",
    desc: "Meja utama menghadap tamu di depan, meja bundar di belakangnya.",
    labelHint: "Meja utama bernomor 1, meja bundar melanjutkan nomornya",
  },
};

/**
 * Parameter tata ruang. Satu bentuk untuk semua layout, bukan union.
 *
 * Union akan lebih rapi di TypeScript tetapi lebih berbahaya di database: kolom
 * jsonb yang isinya berganti bentuk mengikuti `layout_type` berarti setiap
 * pembacaan harus mempercayai bahwa keduanya sinkron. Dengan satu bentuk datar,
 * mengganti layout hanya mengubah field mana yang DIBACA — nilai yang tidak
 * dipakai tetap tersimpan, jadi kembali ke layout sebelumnya mengembalikan
 * setelan lamanya, bukan nilai bawaan.
 */
export type SeatMapLayoutParams = {
  /** Meja bundar: sudut busur kursi dalam derajat. 300 = hampir penuh, 180 = cabaret. */
  arc_sweep: number;
  /** Theater & classroom: jumlah baris. */
  rows: number;
  /** Theater: kursi per baris. Classroom: meja per baris. */
  per_row: number;
  /** Classroom: kursi per meja. */
  seats_per_table: number;
  /** Theater: lorong disisipkan SETELAH kursi ke-n. Boleh lebih dari satu. */
  aisles: number[];
  /** U-shape, hollow square, boardroom: kursi per sisi memanjang. */
  seats_per_side: number;
  /** U-shape & boardroom: kursi di sisi kepala/ujung meja. */
  seats_head: number;
  /** Head table: kursi di meja utama. */
  head_seats: number;
};

export const DEFAULT_LAYOUT_PARAMS: SeatMapLayoutParams = {
  arc_sweep: 300,
  rows: 6,
  per_row: 12,
  seats_per_table: 3,
  aisles: [],
  seats_per_side: 6,
  seats_head: 3,
  head_seats: 6,
};

/** Nilai bawaan yang berbeda per layout. Sisanya memakai DEFAULT_LAYOUT_PARAMS. */
const LAYOUT_DEFAULT_OVERRIDES: Partial<Record<SeatMapLayout, Partial<SeatMapLayoutParams>>> = {
  // 190 derajat, bukan 180: pada tepat setengah lingkaran, kursi pertama dan
  // terakhir duduk persis di garis tengah meja dan terbaca seperti menghadap ke
  // samping. Sedikit lebih lebar membuat keduanya jelas menghadap panggung.
  cabaret: { arc_sweep: 190 },
};

export function layoutDefaults(layout: SeatMapLayout): SeatMapLayoutParams {
  return { ...DEFAULT_LAYOUT_PARAMS, ...(LAYOUT_DEFAULT_OVERRIDES[layout] ?? {}) };
}

export function normalizeLayout(value: unknown): SeatMapLayout {
  return SEAT_MAP_LAYOUTS.includes(value as SeatMapLayout) ? (value as SeatMapLayout) : "banquet_round";
}

function angka(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeLayoutParams(layout: SeatMapLayout, raw: unknown): SeatMapLayoutParams {
  const bawaan = layoutDefaults(layout);
  const data = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    arc_sweep: angka(data.arc_sweep, bawaan.arc_sweep, 60, 340),
    rows: angka(data.rows, bawaan.rows, 1, 40),
    per_row: angka(data.per_row, bawaan.per_row, 1, 40),
    seats_per_table: angka(data.seats_per_table, bawaan.seats_per_table, 1, MAX_SEATS_PER_TABLE),
    aisles: Array.isArray(data.aisles)
      ? [...new Set(data.aisles.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0).map(Math.floor))]
          .sort((a, b) => a - b)
          .slice(0, 6)
      : bawaan.aisles,
    seats_per_side: angka(data.seats_per_side, bawaan.seats_per_side, 1, 40),
    seats_head: angka(data.seats_head, bawaan.seats_head, 0, 20),
    head_seats: angka(data.head_seats, bawaan.head_seats, 1, MAX_SEATS_PER_TABLE),
  };
}

export type SeatGeometry = {
  /** Huruf kursi di dalam mejanya, misalnya "C". */
  code: string;
  /** Label penuh hasil pola, dipakai mencocokkan dengan data scanner API. */
  label: string;
  /**
   * Nomor POSISI mejanya, bukan labelnya. Dipakai untuk menghubungkan kursi ke
   * mejanya di dalam kode (mis. panel "kursi meja ini"), sehingga tetap berupa
   * angka walau label mejanya "3A".
   */
  tableNumber: number;
  x: number;
  y: number;
  r: number;
};

/**
 * Bentuk meja di kanvas.
 *
 * `none` untuk theater: barisnya bukan meja, hanya kumpulan kursi. Ia tetap
 * berupa "table" di struktur data supaya seluruh konsumen — pencarian nama,
 * panel "kursi meja ini", pewarnaan, dan LED — tidak perlu mengenal dua bentuk
 * data yang berbeda.
 */
export type TableShape = "round" | "rect" | "none";

export type TableGeometry = {
  /**
   * Nomor posisi, menerus dari baris terdepan. Tetap `number` dengan sengaja:
   * dipakai sebagai kunci render, acuan `table_overrides`, `seat_rules`, dan
   * meja terpilih di halaman publik. Yang berubah hanya tulisannya.
   */
  number: number;
  /**
   * Tulisan yang tampil di meja, mis. "3A". Sama dengan `String(number)` bila
   * tidak ada penyimpangan. Ini pula yang menyusun label kursi.
   */
  label: string;
  x: number;
  y: number;
  /** Jari-jari untuk meja bundar. Untuk meja persegi dipakai sebagai jari-jari sudut. */
  r: number;
  shape: TableShape;
  /** Lebar & tinggi meja persegi. Diabaikan pada bentuk lain. */
  w?: number;
  h?: number;
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
export const TABLE_RADIUS = 33;
export const SEAT_RADIUS = 10.5;
export const SEAT_ORBIT = 47;
export const CELL_WIDTH = 132;
export const CELL_HEIGHT = 126;
export const PADDING_X = 40;
export const STAGE_TOP = 34;
export const STAGE_HEIGHT = 46;
export const STAGE_GAP = 78;
export const PADDING_BOTTOM = 34;

// Sudut busur kursi kini menjadi parameter tata ruang (layout_params.arc_sweep),
// bukan konstanta: banquet memakai busur lebar, cabaret memakai busur sempit.
// Nilai bawaannya ada di DEFAULT_LAYOUT_PARAMS.
export const SEAT_ARC_CENTER = 90; // 90 derajat = sisi bawah pada koordinat SVG (y ke bawah).

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
 *
 * `tableLabel` adalah STRING, bukan angka, karena satu meja bisa berlabel "3A".
 * Label itulah yang harus masuk ke label kursi ("A3A"), sebab yang dicocokkan
 * dengan scanner API adalah tulisan yang dilihat tamu di meja — bukan nomor
 * posisi yang hanya dipakai di dalam kode.
 */
export function buildSeatLabel(pattern: string, tableLabel: string, seatCode: string) {
  return pattern.replaceAll("{table}", tableLabel).replaceAll("{seat}", seatCode);
}

/**
 * Panjang maksimum label meja. Cukup untuk "3A" atau "12B" tetapi menolak teks
 * yang akan meluber keluar bulatan meja di layar.
 */
export const MAX_TABLE_LABEL_LENGTH = 6;

/**
 * Tulisan yang tampil pada sebuah meja.
 *
 * Jatuh ke nomor posisinya bila tidak ada penyimpangan, sehingga denah yang
 * belum pernah disetel tetap menampilkan 1..32 seperti sebelumnya.
 */
export function tableLabelFor(tableNumber: number, labels: Record<string, string>) {
  const custom = labels[String(tableNumber)];
  return custom && custom.trim() ? custom.trim() : String(tableNumber);
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

/**
 * Membersihkan pemetaan label meja.
 *
 * Kunci wajib berupa angka posisi. Nilai kosong DIBUANG, bukan disimpan sebagai
 * string kosong: meja tanpa tulisan apa pun di denah tidak dapat disebutkan ke
 * tamu, dan kelalaian mengosongkan satu kolom di CMS tidak boleh menghasilkan
 * meja tak bernama di layar. Membuangnya membuat meja itu kembali memakai nomor
 * posisinya, yang selalu benar.
 *
 * Label yang identik dengan nomor posisinya juga dibuang — menyimpannya hanya
 * menambah baris yang harus dibaca admin tanpa mengubah apa pun.
 */
function sanitizeTableLabels(labels: unknown): Record<string, string> {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels as Record<string, unknown>)) {
    if (!/^\d{1,3}$/.test(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim().replace(/\s+/g, " ").slice(0, MAX_TABLE_LABEL_LENGTH);
    if (!trimmed) continue;
    if (trimmed === key) continue;
    result[key] = trimmed;
  }
  return result;
}

/** Membersihkan konfigurasi mentah dari database menjadi bentuk yang aman dipakai. */
export function normalizeConfig(raw: Partial<SeatMapConfig> | null | undefined): SeatMapConfig {
  const layout = normalizeLayout(raw?.layout_type);
  const pattern = typeof raw?.seat_label_pattern === "string" && raw.seat_label_pattern.includes("{table}") && raw.seat_label_pattern.includes("{seat}")
    ? raw.seat_label_pattern
    : "{table}{seat}";
  return {
    stage_label: typeof raw?.stage_label === "string" && raw.stage_label.trim() ? raw.stage_label : "LED SCREEN",
    row_table_counts: sanitizeRowCounts(raw?.row_table_counts),
    seat_rules: sanitizeRules(raw?.seat_rules),
    seat_label_pattern: pattern,
    table_overrides: sanitizeOverrides(raw?.table_overrides),
    table_labels: sanitizeTableLabels(raw?.table_labels),
    layout_type: layout,
    layout_params: normalizeLayoutParams(layout, raw?.layout_params),
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
  const { tables, width, height } = generateLayout(config.layout_type, config, config.layout_params);

  // Panggung dibuat selebar dua per tiga kanvas dan dipusatkan: ia acuan arah
  // pandang, jadi harus terbaca lebih dulu sebelum mata mencari nomor meja.
  const stageWidth = Math.round(width * 0.66);

  return {
    width,
    height,
    stage: {
      x: Math.round((width - stageWidth) / 2),
      y: STAGE_TOP,
      width: stageWidth,
      height: STAGE_HEIGHT,
      label: config.stage_label,
    },
    tables,
    totalTables: tables.length,
    totalSeats: tables.reduce((sum, table) => sum + table.seats.length, 0),
  };
}

/**
 * Label meja yang muncul lebih dari sekali.
 *
 * Ini kesalahan yang paling mahal pada fitur label meja, dan satu-satunya yang
 * tidak dapat dilihat dari denah. Memberi label "3A" pada meja 4 sementara meja
 * 3 masih bernomor 3 aman; tetapi memberi label "5" pada meja 4 membuat DUA meja
 * bernama 5, dan kursi "A5" lalu ada di dua tempat. Pencocokan dengan data
 * peserta akan menyorot kedua meja itu sekaligus, jadi tamu dikirim ke meja yang
 * salah tanpa satu pun pesan kesalahan muncul.
 *
 * Dikembalikan sebagai daftar, bukan boolean, supaya CMS dapat menyebutkan label
 * mana yang bentrok. "Ada label ganda" tanpa menyebut labelnya memaksa admin
 * memeriksa 32 baris satu per satu.
 */
export function duplicateTableLabels(input: Partial<SeatMapConfig> | null | undefined): string[] {
  const geometry = computeSeatMapGeometry(input);
  const seen = new Map<string, number>();
  for (const table of geometry.tables) {
    const key = table.label.trim().toUpperCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([label]) => label);
}
