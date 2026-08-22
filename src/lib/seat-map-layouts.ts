import {
  buildSeatLabel,
  seatCountForTable,
  seatLetter,
  tableLabelFor,
  CELL_HEIGHT,
  CELL_WIDTH,
  PADDING_BOTTOM,
  PADDING_X,
  SEAT_ARC_CENTER,
  SEAT_ORBIT,
  SEAT_RADIUS,
  STAGE_GAP,
  STAGE_HEIGHT,
  STAGE_TOP,
  TABLE_RADIUS,
  type SeatMapConfig,
  type SeatMapLayout,
  type SeatMapLayoutParams,
  type TableGeometry,
  type TableShape,
} from "./seat-map.ts";

/**
 * Generator geometri per jenis tata ruang.
 *
 * Semuanya mengembalikan bentuk yang sama — daftar meja beserta kursinya, plus
 * ukuran kanvas — sehingga seluruh konsumen geometri (halaman publik, layar LED,
 * pratinjau CMS, pencarian nama) tidak perlu tahu layout mana yang dipakai.
 * Menambah layout baru berarti menambah satu fungsi di berkas ini dan satu
 * cabang di `computeSeatMapGeometry`.
 *
 * Dipisahkan dari `seat-map.ts` karena berkas itu sudah memikul dua tanggung
 * jawab lain: pembersihan konfigurasi dan pencocokan label. Menumpuk tujuh
 * generator di sana membuat aturan label — bagian yang paling berbahaya kalau
 * salah — terkubur di tengah perhitungan koordinat.
 *
 * y dihitung dari `CONTENT_TOP`, tepat di bawah panggung; panggungnya sendiri
 * dipasang oleh pembungkusnya.
 */

/**
 * Batas atas area isi, tepat di bawah panggung.
 *
 * Fungsi, bukan konstanta modul. Berkas ini dan `seat-map.ts` saling mengimpor —
 * yang satu butuh tipe dan pembantu label, yang lain butuh generator — dan
 * konstanta yang dihitung saat modul dimuat akan membaca nilai yang belum sempat
 * diinisialisasi, tergantung modul mana yang kebetulan dimuat lebih dulu.
 * Terukur: `ReferenceError: Cannot access 'STAGE_TOP' before initialization`.
 * Di dalam fungsi, pembacaannya baru terjadi saat dipanggil — jauh setelah
 * kedua modul selesai dimuat.
 */
function contentTop() {
  return STAGE_TOP + STAGE_HEIGHT + STAGE_GAP;
}

/** Satuan meja persegi. Satu "unit" kira-kira selebar satu kursi. */
const RECT_UNIT = 62;
const RECT_DEPTH = 34;
const SEAT_GAP_FROM_TABLE = 26;
const ROW_SEAT_PITCH = 34;
const ROW_PITCH = 46;
const AISLE_WIDTH = 44;

export type Kanvas = { tables: TableGeometry[]; width: number; height: number };

type Konteks = {
  config: SeatMapConfig;
  /** Nomor posisi berikutnya, menerus lintas baris dan lintas sisi. */
  nomor: number;
};

type Titik = { x: number; y: number };

/**
 * Menyusun satu meja beserta kursinya.
 *
 * Penomoran kursi dipisah menjadi dua gaya karena konvensinya memang berbeda:
 * meja bundar dan meja panjang memakai huruf ("12A"), sedangkan baris theater
 * memakai angka ("A12") — itu yang tercetak di tiket dan denah gedung
 * pertunjukan, dan menyimpang darinya membuat panitia salah menyebutkan kursi
 * lewat pengeras suara.
 */
function buatMeja(
  ctx: Konteks,
  meja: { x: number; y: number; rowIndex: number; shape: TableShape; r: number; w?: number; h?: number },
  kursi: Titik[],
  penomoran: "huruf" | "angka" = "huruf",
  labelBawaan?: string,
): TableGeometry {
  ctx.nomor += 1;
  const number = ctx.nomor;
  const offset = ctx.config.table_overrides[String(number)] ?? { dx: 0, dy: 0 };
  // Label khusus dari admin selalu menang. Tanpa itu dipakai label bawaan
  // layout — huruf untuk baris theater, nomor posisi untuk meja.
  const kustom = ctx.config.table_labels[String(number)];
  const label = kustom && kustom.trim() ? kustom.trim() : labelBawaan ?? tableLabelFor(number, ctx.config.table_labels);

  return {
    number,
    label,
    x: meja.x + offset.dx,
    y: meja.y + offset.dy,
    r: meja.r,
    shape: meja.shape,
    w: meja.w,
    h: meja.h,
    rowIndex: meja.rowIndex,
    seats: kursi.map((titik, index) => {
      const code = penomoran === "angka" ? String(index + 1) : seatLetter(index);
      return {
        code,
        label: buildSeatLabel(ctx.config.seat_label_pattern, label, code),
        tableNumber: number,
        x: titik.x + offset.dx,
        y: titik.y + offset.dy,
        r: SEAT_RADIUS,
      };
    }),
  };
}

/** Kursi pada busur mengelilingi meja bundar. */
function kursiBusur(cx: number, cy: number, jumlah: number, sweep: number): Titik[] {
  const step = jumlah > 1 ? sweep / (jumlah - 1) : 0;
  const mulai = SEAT_ARC_CENTER + sweep / 2;
  return Array.from({ length: jumlah }, (_, index) => {
    // Mundur dari sisi kiri, melewati bawah, lalu naik ke sisi kanan: urutan A di
    // kiri atas sampai huruf terakhir di kanan atas, sama seperti denah cetak.
    const sudut = ((mulai - index * step) * Math.PI) / 180;
    return { x: cx + Math.cos(sudut) * SEAT_ORBIT, y: cy + Math.sin(sudut) * SEAT_ORBIT };
  });
}

/** Kursi berjajar rata di sepanjang satu sisi meja persegi. */
function kursiSisi(mulai: number, panjang: number, jumlah: number, tetap: number, sumbu: "x" | "y", terbalik = false): Titik[] {
  return Array.from({ length: jumlah }, (_, index) => {
    const urut = terbalik ? jumlah - 1 - index : index;
    const posisi = mulai + (urut + 0.5) * (panjang / Math.max(jumlah, 1));
    return sumbu === "x" ? { x: posisi, y: tetap } : { x: tetap, y: posisi };
  });
}

/** Banquet dan cabaret: meja bundar berbaris, beda hanya lebar busur kursinya. */
export function layoutRounds(config: SeatMapConfig, params: SeatMapLayoutParams): Kanvas {
  const rows = config.row_table_counts.length ? config.row_table_counts : [1];
  const widest = rows.reduce((max, count) => Math.max(max, count), 1);
  const width = widest * CELL_WIDTH + PADDING_X * 2;
  const ctx: Konteks = { config, nomor: 0 };
  const tables: TableGeometry[] = [];

  rows.forEach((countInRow, rowIndex) => {
    const rowStartX = (width - countInRow * CELL_WIDTH) / 2;
    const centerY = contentTop() + rowIndex * CELL_HEIGHT + CELL_HEIGHT / 2;
    for (let i = 0; i < countInRow; i += 1) {
      const cx = rowStartX + i * CELL_WIDTH + CELL_WIDTH / 2;
      // Aturan kursi memakai nomor POSISI, bukan label: rentang "meja 1-25 enam
      // kursi" tetap berlaku walau salah satu meja di dalamnya berlabel "3A".
      const jumlah = seatCountForTable(ctx.nomor + 1, config.seat_rules);
      tables.push(buatMeja(
        ctx,
        { x: cx, y: centerY, rowIndex, shape: "round", r: TABLE_RADIUS },
        kursiBusur(cx, centerY, jumlah, params.arc_sweep),
      ));
    }
  });

  return { tables, width, height: contentTop() + rows.length * CELL_HEIGHT + PADDING_BOTTOM };
}

/**
 * Theater: baris kursi tanpa meja.
 *
 * Satu baris menjadi satu "meja" di struktur data — bukan karena ada mejanya,
 * tetapi karena seluruh konsumen geometri sudah mengenal bentuk itu. Alternatifnya
 * menambahkan jenis data kedua yang harus dipahami pencarian nama, pewarnaan
 * kursi, dan panel detail sekaligus.
 */
export function layoutTheater(config: SeatMapConfig, params: SeatMapLayoutParams): Kanvas {
  const ctx: Konteks = { config, nomor: 0 };
  const tables: TableGeometry[] = [];
  const lorong = params.aisles.filter((posisi) => posisi < params.per_row);
  const lebarBaris = params.per_row * ROW_SEAT_PITCH + lorong.length * AISLE_WIDTH;
  const width = Math.max(lebarBaris + PADDING_X * 2, 320);

  for (let rowIndex = 0; rowIndex < params.rows; rowIndex += 1) {
    const y = contentTop() + rowIndex * ROW_PITCH;
    const kiri = (width - lebarBaris) / 2;
    const kursi: Titik[] = [];
    let geser = 0;
    for (let i = 0; i < params.per_row; i += 1) {
      // Lorong disisipkan SETELAH kursi ke-n, jadi `i === n` adalah kursi
      // pertama sesudah lorong.
      if (lorong.includes(i)) geser += AISLE_WIDTH;
      kursi.push({ x: kiri + ROW_SEAT_PITCH / 2 + i * ROW_SEAT_PITCH + geser, y });
    }
    // Titik mejanya diletakkan di pinggir kiri baris: di sanalah label baris
    // dicetak pada denah gedung pertunjukan.
    // Baris diberi HURUF, kursinya angka: hasilnya "A12", konvensi yang dipakai
    // tiket dan denah cetak gedung pertunjukan. Meja bundar memakai kebalikannya
    // ("12A"), dan menyeragamkan keduanya berarti salah satunya menyimpang dari
    // yang tercetak di kertas yang dipegang tamu.
    tables.push(buatMeja(ctx, { x: kiri - 18, y, rowIndex, shape: "none", r: 0 }, kursi, "angka", seatLetter(rowIndex)));
  }

  return { tables, width, height: contentTop() + params.rows * ROW_PITCH + PADDING_BOTTOM };
}

/** Classroom: meja panjang menghadap panggung, kursi di sisi belakang meja. */
export function layoutClassroom(config: SeatMapConfig, params: SeatMapLayoutParams): Kanvas {
  const ctx: Konteks = { config, nomor: 0 };
  const tables: TableGeometry[] = [];
  const lebarMeja = Math.max(params.seats_per_table, 1) * RECT_UNIT;
  const pitchX = lebarMeja + 46;
  const pitchY = RECT_DEPTH + SEAT_GAP_FROM_TABLE * 2 + 34;
  const lebarBaris = params.per_row * pitchX;
  const width = Math.max(lebarBaris + PADDING_X * 2, 320);

  for (let rowIndex = 0; rowIndex < params.rows; rowIndex += 1) {
    const y = contentTop() + rowIndex * pitchY + RECT_DEPTH / 2;
    const kiri = (width - lebarBaris) / 2;
    for (let i = 0; i < params.per_row; i += 1) {
      const cx = kiri + pitchX / 2 + i * pitchX;
      // Kursi di sisi yang MENJAUHI panggung: peserta menghadap panggung dengan
      // mejanya di depan badan, bukan di belakang punggung.
      const kursi = kursiSisi(cx - lebarMeja / 2, lebarMeja, params.seats_per_table, y + RECT_DEPTH / 2 + SEAT_GAP_FROM_TABLE, "x");
      tables.push(buatMeja(
        ctx,
        { x: cx, y, rowIndex, shape: "rect", r: 6, w: lebarMeja, h: RECT_DEPTH },
        kursi,
      ));
    }
  }

  return { tables, width, height: contentTop() + params.rows * pitchY + PADDING_BOTTOM };
}

/**
 * Boardroom: satu meja panjang, kursi mengelilinginya searah jarum jam.
 *
 * Urutannya sengaja mengelilingi, bukan "sisi atas semua lalu sisi bawah semua":
 * orang yang mencari kursi F berjalan mengitari meja, dan huruf yang melompat ke
 * seberang membuatnya berbalik arah di tengah ruangan.
 */
export function layoutBoardroom(config: SeatMapConfig, params: SeatMapLayoutParams): Kanvas {
  const ctx: Konteks = { config, nomor: 0 };
  const panjang = Math.max(params.seats_per_side, 1) * RECT_UNIT;
  const width = Math.max(panjang + PADDING_X * 2 + 140, 420);
  const cx = width / 2;
  const cy = contentTop() + 90;
  const kiriMeja = cx - panjang / 2;

  const kursi: Titik[] = [
    ...kursiSisi(kiriMeja, panjang, params.seats_per_side, cy - RECT_DEPTH / 2 - SEAT_GAP_FROM_TABLE, "x"),
    ...Array.from({ length: params.seats_head }, (_, index) => ({
      x: cx + panjang / 2 + SEAT_GAP_FROM_TABLE,
      y: cy - ((params.seats_head - 1) * 34) / 2 + index * 34,
    })),
    ...kursiSisi(kiriMeja, panjang, params.seats_per_side, cy + RECT_DEPTH / 2 + SEAT_GAP_FROM_TABLE, "x", true),
    ...Array.from({ length: params.seats_head }, (_, index) => ({
      x: cx - panjang / 2 - SEAT_GAP_FROM_TABLE,
      y: cy + ((params.seats_head - 1) * 34) / 2 - index * 34,
    })),
  ];

  const tables = [buatMeja(ctx, { x: cx, y: cy, rowIndex: 0, shape: "rect", r: 8, w: panjang, h: RECT_DEPTH }, kursi)];
  return { tables, width, height: cy + 90 + PADDING_BOTTOM };
}

/**
 * U-shape dan hollow square.
 *
 * Satu mesin, dua hasil: bedanya hanya sisi keempat dipasang atau dibiarkan
 * terbuka. Setiap sisi menjadi satu "meja" bernomor sendiri, sehingga labelnya
 * tetap berbentuk `<sisi><huruf>` dan tidak ada satu meja pun dengan dua puluh
 * huruf kursi yang mustahil disebutkan.
 */
export function layoutRectRing(
  config: SeatMapConfig,
  params: SeatMapLayoutParams,
  tutupSisiKeempat: boolean,
): Kanvas {
  const ctx: Konteks = { config, nomor: 0 };
  const tables: TableGeometry[] = [];
  const panjangSisi = Math.max(params.seats_per_side, 1) * RECT_UNIT;
  const lebarKepala = Math.max(params.seats_head, 1) * RECT_UNIT;

  const width = Math.max(lebarKepala + 260 + PADDING_X * 2, 460);
  const cx = width / 2;
  const kepalaY = contentTop() + RECT_DEPTH / 2 + 20;

  // Sisi kepala menghadap panggung; kursinya di sisi yang menjauhi panggung.
  tables.push(buatMeja(
    ctx,
    { x: cx, y: kepalaY, rowIndex: 0, shape: "rect", r: 8, w: lebarKepala, h: RECT_DEPTH },
    kursiSisi(cx - lebarKepala / 2, lebarKepala, params.seats_head, kepalaY - RECT_DEPTH / 2 - SEAT_GAP_FROM_TABLE, "x"),
  ));

  const sisiAtas = kepalaY + RECT_DEPTH / 2;
  const sisiTengahY = sisiAtas + panjangSisi / 2;
  for (const sisi of ["kiri", "kanan"] as const) {
    const x = sisi === "kiri" ? cx - lebarKepala / 2 - RECT_DEPTH / 2 : cx + lebarKepala / 2 + RECT_DEPTH / 2;
    const arah = sisi === "kiri" ? -1 : 1;
    tables.push(buatMeja(
      ctx,
      { x, y: sisiTengahY, rowIndex: 1, shape: "rect", r: 8, w: RECT_DEPTH, h: panjangSisi },
      kursiSisi(sisiAtas, panjangSisi, params.seats_per_side, x + arah * (RECT_DEPTH / 2 + SEAT_GAP_FROM_TABLE), "y"),
    ));
  }

  const bawahY = sisiAtas + panjangSisi + RECT_DEPTH / 2;
  if (tutupSisiKeempat) {
    tables.push(buatMeja(
      ctx,
      { x: cx, y: bawahY, rowIndex: 2, shape: "rect", r: 8, w: lebarKepala, h: RECT_DEPTH },
      kursiSisi(cx - lebarKepala / 2, lebarKepala, params.seats_head, bawahY + RECT_DEPTH / 2 + SEAT_GAP_FROM_TABLE, "x", true),
    ));
  }

  return { tables, width, height: bawahY + RECT_DEPTH / 2 + SEAT_GAP_FROM_TABLE * 2 + PADDING_BOTTOM };
}

/**
 * Meja utama di depan, meja bundar di belakangnya.
 *
 * Kursi meja utama duduk di sisi panggung, MEMBELAKANGI layar. Itu memang
 * posisinya di gala: mereka yang dilihat, bukan yang melihat.
 */
export function layoutHeadTable(config: SeatMapConfig, params: SeatMapLayoutParams): Kanvas {
  const ctx: Konteks = { config, nomor: 0 };
  const rows = config.row_table_counts.length ? config.row_table_counts : [1];
  const widest = rows.reduce((max, count) => Math.max(max, count), 1);
  const width = widest * CELL_WIDTH + PADDING_X * 2;
  const tables: TableGeometry[] = [];

  const lebarKepala = Math.max(params.head_seats, 1) * RECT_UNIT;
  const kepalaY = contentTop() + RECT_DEPTH / 2;
  tables.push(buatMeja(
    ctx,
    { x: width / 2, y: kepalaY, rowIndex: 0, shape: "rect", r: 8, w: lebarKepala, h: RECT_DEPTH },
    kursiSisi(width / 2 - lebarKepala / 2, lebarKepala, params.head_seats, kepalaY - RECT_DEPTH / 2 - SEAT_GAP_FROM_TABLE, "x"),
  ));

  const mulaiY = kepalaY + RECT_DEPTH / 2 + 40;
  rows.forEach((countInRow, rowIndex) => {
    const rowStartX = (width - countInRow * CELL_WIDTH) / 2;
    const centerY = mulaiY + rowIndex * CELL_HEIGHT + CELL_HEIGHT / 2;
    for (let i = 0; i < countInRow; i += 1) {
      const cx = rowStartX + i * CELL_WIDTH + CELL_WIDTH / 2;
      const jumlah = seatCountForTable(ctx.nomor + 1, config.seat_rules);
      tables.push(buatMeja(
        ctx,
        { x: cx, y: centerY, rowIndex: rowIndex + 1, shape: "round", r: TABLE_RADIUS },
        kursiBusur(cx, centerY, jumlah, params.arc_sweep),
      ));
    }
  });

  return { tables, width, height: mulaiY + rows.length * CELL_HEIGHT + PADDING_BOTTOM };
}

/** Memilih generator menurut jenis tata ruang. */
export function generateLayout(layout: SeatMapLayout, config: SeatMapConfig, params: SeatMapLayoutParams): Kanvas {
  switch (layout) {
    case "theater": return layoutTheater(config, params);
    case "classroom": return layoutClassroom(config, params);
    case "boardroom": return layoutBoardroom(config, params);
    case "u_shape": return layoutRectRing(config, params, false);
    case "hollow_square": return layoutRectRing(config, params, true);
    case "head_table": return layoutHeadTable(config, params);
    // banquet_round dan cabaret memakai generator yang sama; yang membedakan
    // hanya `arc_sweep`, dan itu sudah menjadi bawaan masing-masing layout.
    default: return layoutRounds(config, params);
  }
}
