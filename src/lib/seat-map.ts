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
};

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

      // Aturan kursi memakai nomor POSISI, bukan label. Rentang "meja 1-25 enam
      // kursi" tetap berlaku apa adanya walau salah satu meja di dalamnya
      // berlabel "3A"; kalau aturan ikut memakai label, mengganti satu tulisan
      // akan mengubah jumlah kursi di meja itu tanpa ada yang meminta.
      const seatCount = seatCountForTable(tableNumber, config.seat_rules);
      const label = tableLabelFor(tableNumber, config.table_labels);
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
          label: buildSeatLabel(config.seat_label_pattern, label, code),
          tableNumber,
          x: centerX + Math.cos(angle) * SEAT_ORBIT,
          y: y + Math.sin(angle) * SEAT_ORBIT,
          r: SEAT_RADIUS,
        });
      }

      tables.push({ number: tableNumber, label, x: centerX, y, r: TABLE_RADIUS, rowIndex, seats });
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
