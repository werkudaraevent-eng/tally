import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Impor dan ekspor peserta, CSV maupun XLSX.
//
// Satu modul untuk KEDUA ARAH, bukan hanya kedua format. Alasannya sebuah
// jaminan yang ingin dipegang panitia: berkas yang baru saja diunduh harus bisa
// diunggah kembali apa adanya. Kalau penulis dan pembaca berdiri di modul
// terpisah, keduanya akan pelan-pelan berbeda dan "export lalu import" berhenti
// bekerja tepat saat dipakai untuk menyunting massal.

export type ParticipantFileFormat = "csv" | "xlsx";

/** Kolom yang DIBACA importir. Urutannya juga urutan kolom di berkas contoh. */
export const IMPORT_HEADERS = [
  "qr_code",
  "name",
  "company",
  "title",
  "email",
  "phone",
  "participant_type",
  "rsvp_status",
] as const;

export type ImportField = (typeof IMPORT_HEADERS)[number];

/**
 * Kolom ekspor: seluruh kolom impor, lalu kolom yang hanya bisa dibaca.
 *
 * Kolom baca-saja sengaja diletakkan SESUDAH kolom impor, bukan disisipkan di
 * tengah. Panitia yang menyunting berkas ini bekerja dari kiri; kolom yang
 * suntingannya akan diabaikan tidak boleh menghalangi kolom yang tidak.
 */
export const EXPORT_HEADERS = [
  ...IMPORT_HEADERS,
  "sumber",
  "check_in",
  "total_scan",
  "kursi",
  "dihapus_di_sumber",
  "participant_id",
] as const;

/**
 * Nama kolom alternatif yang diterima importir.
 *
 * Berkas nyata datang dari spreadsheet panitia, bukan dari ekspor aplikasi ini.
 * Menolak "Nama" karena headernya bukan "name" memaksa orang menyunting baris
 * pertama sebelum boleh mengunggah -- pekerjaan yang tidak menghasilkan apa pun
 * dan yang gagal dilakukan justru saat sedang terburu-buru.
 */
const HEADER_ALIASES: Record<string, ImportField> = {
  qr_code: "qr_code", qr: "qr_code", kode: "qr_code", kode_qr: "qr_code",
  kode_peserta: "qr_code", unique_code: "qr_code", uniquecode: "qr_code",
  name: "name", nama: "name", nama_lengkap: "name", full_name: "name", fullname: "name",
  company: "company", perusahaan: "company", instansi: "company", affiliation: "company",
  title: "title", jabatan: "title", job_title: "title", jobtitle: "title", posisi: "title",
  email: "email", surel: "email", alamat_email: "email",
  phone: "phone", telepon: "phone", telp: "phone", hp: "phone", no_hp: "phone", whatsapp: "phone",
  participant_type: "participant_type", tipe: "participant_type", tipe_peserta: "participant_type",
  kategori: "participant_type", participanttype: "participant_type",
  rsvp_status: "rsvp_status", rsvp: "rsvp_status", status_rsvp: "rsvp_status", rsvpstatus: "rsvp_status",
};

/** Samakan bentuk header sebelum dicocokkan: "No. HP " -> "no_hp". */
function normalizeHeader(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type ImportRow = Partial<Record<ImportField, string>>;

/**
 * Petakan matriks sel (baris pertama = header) menjadi baris impor.
 *
 * Kolom yang tidak dikenali DIABAIKAN diam-diam. Berkas panitia lazim memuat
 * kolom catatan, nomor meja, atau ukuran kaus; menolak berkasnya karena ada
 * kolom asing berarti menolak hampir semua berkas nyata.
 */
export function mapRows(matrix: string[][]) {
  const [headerRow, ...bodyRows] = matrix;
  if (!headerRow) return { rows: [] as ImportRow[], recognized: [] as ImportField[] };

  const columns = headerRow.map((cell) => HEADER_ALIASES[normalizeHeader(cell ?? "")] ?? null);
  const recognized = [...new Set(columns.filter((column): column is ImportField => column !== null))];

  const rows: ImportRow[] = [];
  for (const cells of bodyRows) {
    const row: ImportRow = {};
    let filled = false;
    columns.forEach((column, index) => {
      if (!column) return;
      const value = (cells[index] ?? "").trim();
      if (!value) return;
      row[column] = value;
      filled = true;
    });
    // Baris kosong dilewati tanpa dihitung sebagai penolakan. Spreadsheet nyaris
    // selalu punya baris kosong di bawah data, dan melaporkannya sebagai galat
    // membuat setiap impor terlihat bermasalah.
    if (filled) rows.push(row);
  }
  return { rows, recognized };
}

/**
 * Pembaca CSV.
 *
 * Ditulis sendiri, bukan memakai `split(",")`: nama perusahaan Indonesia
 * lazim memuat koma ("PT Maju, Tbk") dan pemisah naif memecahnya jadi dua
 * kolom, menggeser SELURUH kolom di kanannya tanpa galat apa pun.
 */
export function parseCsv(text: string) {
  // BOM dari Excel harus dibuang sebelum header dicocokkan, kalau tidak kolom
  // pertama terbaca "﻿qr_code" dan tidak pernah dikenali.
  const input = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(input);

  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        // Dua petik berurutan di dalam sel = satu petik harfiah.
        if (input[index + 1] === '"') { cell += '"'; index += 1; } else { quoted = false; }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { row.push(cell); cell = ""; continue; }
    if (char === "\r") continue;
    if (char === "\n") { row.push(cell); matrix.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); matrix.push(row); }

  return matrix;
}

/**
 * Excel berbahasa Indonesia menyimpan CSV dengan titik koma, bukan koma, karena
 * koma dipakai sebagai pemisah desimal. Berkas seperti itu terbaca sebagai satu
 * kolom raksasa bila pemisahnya dipatok koma.
 *
 * Ditentukan dari BARIS PERTAMA saja: itu baris header, isinya tidak pernah
 * memuat koma desimal, jadi hitungannya tidak tertipu oleh data.
 */
function detectDelimiter(input: string) {
  const firstLine = input.slice(0, input.indexOf("\n") === -1 ? input.length : input.indexOf("\n"));
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  return semicolons > commas ? ";" : ",";
}

/** Pembaca XLSX. Hanya sheet PERTAMA — berkas panitia lazim punya sheet catatan. */
export async function parseXlsx(buffer: ArrayBuffer) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const matrix: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    // `row.eachCell` melewati sel kosong dan membuat kolom bergeser. Indeks
    // dibaca langsung supaya posisi kolom tetap sesuai headernya.
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      cells.push(cellText(row.getCell(column).value));
    }
    matrix.push(cells);
  });
  return matrix;
}

/**
 * Nilai sel Excel bisa berupa angka, tanggal, rumus, atau teks kaya. Kode
 * peserta yang seluruhnya angka akan tiba sebagai number, dan `String(1e21)`
 * menghasilkan notasi ilmiah -- kode yang tidak akan pernah cocok dengan apa pun.
 */
function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isInteger(value) ? value.toFixed(0) : String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const object = value as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (Array.isArray(object.richText)) return object.richText.map((part) => part.text).join("");
    if (typeof object.text === "string") return object.text;
    if (object.result != null) return cellText(object.result);
  }
  return String(value);
}

type ParticipantExportRow = {
  id: string;
  qr_code: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  participant_type: string | null;
  rsvp_status: string | null;
  source_participant_id: string | null;
  source_checked_in: boolean;
  source_total_scans: number;
  source_removed_at: string | null;
  seats: Array<{ label: string }> | null;
};

export async function loadParticipantExportRows(eventId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("participants")
    .select("id,qr_code,name,company,title,email,phone,participant_type,rsvp_status,source_participant_id,source_checked_in,source_total_scans,source_removed_at,seats")
    .eq("event_id", eventId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as ParticipantExportRow[]).map((row) => [
    row.qr_code,
    row.name,
    row.company ?? "",
    row.title ?? "",
    row.email ?? "",
    row.phone ?? "",
    row.participant_type ?? "",
    row.rsvp_status ?? "",
    row.source_participant_id ? "scanner" : "manual",
    row.source_checked_in ? "Y" : "N",
    row.source_total_scans,
    (row.seats ?? []).map((seat) => seat.label).join(" | "),
    row.source_removed_at ?? "",
    row.id,
  ]);
}

/**
 * Berkas contoh untuk diisi panitia.
 *
 * Hanya kolom yang DIBACA importir, bukan seluruh kolom ekspor. Template yang
 * memuat `check_in` atau `total_scan` mengundang orang mengisinya, lalu
 * suntingannya diabaikan tanpa penjelasan -- kolom yang tidak berpengaruh
 * sebaiknya tidak pernah muncul di berkas yang dibuat untuk diisi.
 *
 * Dua baris contoh, bukan nol: berkas berisi header saja menyisakan pertanyaan
 * seperti apa isi `rsvp_status` yang sah, dan jawabannya paling cepat dibaca
 * dari contohnya sendiri. Keduanya harus dihapus sebelum diunggah, dan itu
 * disebutkan di layar impor.
 */
export const TEMPLATE_ROWS: string[][] = [
  ["REG000001", "Budi Santoso", "PT Contoh Sejahtera", "Direktur Utama", "budi@contoh.com", "081234567890", "VIP", "confirmed"],
  ["REG000002", "Siti Rahayu", "CV Mitra Abadi", "Manajer", "siti@contoh.com", "+6281298765432", "reguler", "invited"],
];

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildCsv(rows: unknown[][], headers: readonly string[] = EXPORT_HEADERS) {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(row.map(escapeCsv).join(","));
  // BOM di depan: tanpa itu Excel di Windows membaca berkas sebagai ANSI dan
  // nama beraksen tampil rusak.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function buildXlsx(rows: unknown[][], headers: readonly string[] = EXPORT_HEADERS) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Peserta");

  sheet.addRow([...headers]);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) sheet.addRow(row);

  // Kode peserta dipaksa teks. Tanpa ini Excel membaca "0012" sebagai angka 12,
  // dan berkas yang diunduh lalu diunggah kembali tidak lagi cocok dengan
  // peserta mana pun.
  const qrColumn = headers.indexOf("qr_code") + 1;
  if (qrColumn > 0) sheet.getColumn(qrColumn).numFmt = "@";

  sheet.columns.forEach((column) => { column.width = 20; });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function exportFilename(format: ParticipantFileFormat, slug: string) {
  return `peserta-${slug}-${new Date().toISOString().slice(0, 10)}.${format}`;
}

export function templateFilename(format: ParticipantFileFormat) {
  return `template-impor-peserta.${format}`;
}

export const CONTENT_TYPES: Record<ParticipantFileFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
