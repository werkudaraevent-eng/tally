// Parser daftar entri undian: teks tempelan, CSV, dan XLSX.
//
// Server-only karena `exceljs` cukup besar dan tidak ada gunanya di browser.
//
// SEMUA FORMAT DIPARSE DI SERVER, termasuk XLSX. Membaca berkas di browser
// terdengar lebih hemat, tapi hasilnya bergantung pada bagaimana peramban operator
// menangani BOM, pemisah, dan akhiran baris — dan perbedaannya baru ketahuan
// ketika satu baris hilang dari kolam pada malam acara.

const MAX_ROWS = 5000;

export type ParsedEntry = { label: string; sublabel: string | null; code: string | null; weight: number };

/** Nama kolom yang dikenali, semuanya dicocokkan tanpa memandang besar kecil huruf. */
const COLUMN_ALIASES = {
  label: ["nama", "name", "label", "peserta", "nama peserta"],
  sublabel: ["perusahaan", "company", "instansi", "keterangan", "sublabel", "jabatan"],
  code: ["kode", "code", "kupon", "nomor", "kursi", "qr", "no", "nomor kupon"],
  weight: ["bobot", "weight", "tiket", "jumlah", "jumlah tiket"],
} as const;

export const TEMPLATE_HEADERS = ["Nama", "Perusahaan", "Kode", "Bobot"] as const;

/**
 * Ubah matriks sel mentah menjadi baris entri.
 *
 * Dipakai bersama oleh jalur teks dan jalur XLSX supaya keduanya menerapkan aturan
 * yang sama persis: pengenalan header, pemetaan kolom, pemangkasan, dan dedup.
 * Kalau masing-masing memilikinya sendiri, panitia yang menempel dari Excel dan
 * panitia yang mengunggah berkas Excel yang sama bisa mendapat hasil berbeda.
 */
export function rowsToEntries(cells: string[][]): ParsedEntry[] {
  const nonEmpty = cells.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return [];

  // Header dikenali dari kata kuncinya, bukan dari posisinya. Berkas tanpa header
  // juga lazim, dan membuang baris pertama begitu saja akan menghilangkan satu nama.
  const head = nonEmpty[0].map((cell) => cell.trim().toLowerCase());
  const hasHeader = head.some((cell) => (COLUMN_ALIASES.label as readonly string[]).includes(cell));
  const body = hasHeader ? nonEmpty.slice(1) : nonEmpty;

  const index = hasHeader
    ? {
        label: findColumn(head, COLUMN_ALIASES.label),
        sublabel: findColumn(head, COLUMN_ALIASES.sublabel),
        code: findColumn(head, COLUMN_ALIASES.code),
        weight: findColumn(head, COLUMN_ALIASES.weight),
      }
    : { label: 0, sublabel: 1, code: 2, weight: 3 };

  const seen = new Set<string>();
  const rows: ParsedEntry[] = [];
  for (const row of body) {
    const label = (row[index.label] ?? "").trim();
    if (!label) continue;

    const sublabel = index.sublabel >= 0 ? (row[index.sublabel] ?? "").trim() : "";
    const code = index.code >= 0 ? (row[index.code] ?? "").trim() : "";
    const rawWeight = index.weight >= 0 ? Number((row[index.weight] ?? "").replace(/\D/g, "")) : 1;

    // Duplikat DIBIARKAN, tidak digabung, kecuali baris yang benar-benar identik.
    // Dua orang bernama sama adalah hal biasa di daftar peserta, dan menggabungkan
    // keduanya akan menghapus satu orang dari undian. Kunci dedup karena itu
    // memakai seluruh isi baris, bukan namanya saja.
    const key = `${label}\u0000${sublabel}\u0000${code}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      label: label.slice(0, 200),
      sublabel: sublabel ? sublabel.slice(0, 200) : null,
      code: code ? code.slice(0, 100) : null,
      weight: Number.isFinite(rawWeight) && rawWeight > 0 ? Math.min(1000, rawWeight) : 1,
    });
  }
  return rows;
}

/**
 * Parser teks: CSV, TSV, atau satu nama per baris.
 *
 * Ditulis tangan, bukan memakai pustaka. Bentuk yang diterima sangat sempit —
 * empat kolom, tanpa baris bersarang — dan berkas yang diproses berasal dari
 * panitia sendiri. Repo ini juga sudah menulis CSV-nya sendiri di
 * src/lib/export-orders.ts.
 */
export function parseEntryText(text: string): ParsedEntry[] {
  // BOM dibuang. Berkas CSV yang diekspor Excel di Windows hampir selalu punya BOM,
  // dan tanpa ini karakter itu menempel pada nama pertama sehingga baris pertama
  // tampil dengan karakter aneh di layar panggung.
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  if (lines.length === 0) return [];

  // Pemisah ditentukan dari baris pertama. Tab didahulukan karena tempelan dari
  // Excel memakai tab, dan nama perusahaan Indonesia sering memuat koma
  // ("PT Sinar Mas, Tbk") yang akan salah pecah bila koma dipilih lebih dulu.
  const first = lines[0];
  const delimiter = first.includes("\t") ? "\t" : first.includes(";") ? ";" : first.includes(",") ? "," : "";

  return rowsToEntries(lines.map((line) => (delimiter ? splitLine(line, delimiter) : [line])));
}

/**
 * Parser XLSX.
 *
 * `exceljs` diimpor di dalam fungsi supaya pustaka yang cukup besar itu hanya
 * dimuat ketika ada berkas yang benar-benar diunggah. Pola yang sama dipakai
 * buildXlsx() di src/lib/export-orders.ts.
 *
 * Hanya SHEET PERTAMA yang dibaca. Berkas dari panitia sering punya sheet kedua
 * berisi catatan atau daftar lama, dan menggabungkan semuanya akan diam-diam
 * memasukkan nama yang sudah tidak berlaku ke dalam undian.
 */
export async function parseEntryXlsx(buffer: ArrayBuffer): Promise<ParsedEntry[] | { error: "UNREADABLE" }> {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) return { error: "UNREADABLE" };

    const cells: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      // `eachCell` melewati sel kosong, sehingga kolom bisa bergeser. Karena itu
      // pengisian dilakukan lewat INDEKS, bukan lewat push: satu sel Perusahaan
      // yang kosong akan membuat Kode terbaca sebagai Perusahaan pada baris itu
      // saja — kesalahan yang hanya mengenai sebagian baris dan sangat sulit
      // ditemukan setelah tersimpan.
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        values[columnNumber - 1] = cellText(cell.value);
      });
      for (let i = 0; i < values.length; i += 1) values[i] ??= "";
      cells.push(values);
    });

    return rowsToEntries(cells);
  } catch {
    // Berkas rusak atau bukan XLSX sungguhan. Dilaporkan sebagai galat yang bisa
    // ditindaklanjuti, bukan dilempar sebagai 500 tanpa penjelasan.
    return { error: "UNREADABLE" };
  }
}

/**
 * Ubah nilai sel exceljs menjadi teks.
 *
 * Sel Excel bisa berisi rumus, hyperlink, atau teks kaya. Tanpa penanganan ini
 * nilainya menjadi "[object Object]" — dan itu tersimpan sebagai nama peserta,
 * lalu tampil di layar panggung.
 */
function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const raw = value as Record<string, unknown>;
  // Rumus: pakai hasil hitungnya, bukan rumusnya. Kolom "Bobot" yang berisi
  // `=A2*2` harus menjadi angka, bukan teks rumus.
  if ("result" in raw) return cellText(raw.result);
  if ("text" in raw && typeof raw.text === "string") return raw.text.trim();
  if ("hyperlink" in raw && typeof raw.text === "string") return String(raw.text).trim();
  // Teks kaya: gabungkan potongannya.
  if ("richText" in raw && Array.isArray(raw.richText)) {
    return raw.richText.map((part) => String((part as { text?: string }).text ?? "")).join("").trim();
  }
  return "";
}

function findColumn(header: string[], names: readonly string[]): number {
  return header.findIndex((cell) => names.includes(cell));
}

/** Pemecah satu baris yang menghormati field berkutip dan kutip ganda ("" = "). */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1; }
        else quoted = false;
      } else current += char;
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export { MAX_ROWS };
