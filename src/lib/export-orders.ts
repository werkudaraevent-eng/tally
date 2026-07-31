import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Data export order, dipakai bersama endpoint CSV dan XLSX.
//
// Satu modul supaya kedua format berisi kolom dan urutan yang sama persis. Kalau
// masing-masing endpoint menyusun barisnya sendiri, keduanya akan pelan-pelan
// berbeda dan hasil rekonsiliasi bergantung pada format mana yang diunduh.

export type ExportFormat = "csv" | "xlsx";

export const EXPORT_FORMATS: readonly ExportFormat[] = ["csv", "xlsx"];

export function normalizeExportFormat(value: unknown): ExportFormat {
  return value === "xlsx" ? "xlsx" : "csv";
}

type OrderRow = {
  code: string;
  created_at: string;
  booth_id: number;
  participant_id: string;
  has_discount_item: boolean;
  regular_amount: number;
  total_amount: number;
  status: string;
  payment_method: string | null;
  approval_code: string | null;
  paid_by: string | null;
};

/** Judul kolom. Urutannya harus sama dengan `toRow`. */
export const EXPORT_HEADERS = [
  "order_code",
  "waktu",
  "booth_id",
  "participant_id",
  "item_diskon",
  "nominal_reguler",
  "total",
  "status",
  "metode_bayar",
  "approval_code",
  "kasir",
] as const;

function toRow(order: OrderRow) {
  return [
    order.code,
    order.created_at,
    order.booth_id,
    order.participant_id,
    order.has_discount_item ? "Y" : "N",
    order.regular_amount,
    order.total_amount,
    order.status,
    order.payment_method,
    order.approval_code,
    order.paid_by,
  ];
}

export async function loadExportRows() {
  const { data, error } = await getSupabaseServiceClient()
    .from("orders")
    .select("code,created_at,booth_id,participant_id,has_discount_item,regular_amount,total_amount,status,payment_method,approval_code,paid_by")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as OrderRow[]).map(toRow);
}

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildCsv(rows: unknown[][]) {
  const lines = [EXPORT_HEADERS.join(",")];
  for (const row of rows) lines.push(row.map(escapeCsv).join(","));
  // BOM di depan: tanpa itu Excel di Windows membaca berkas sebagai ANSI dan
  // huruf beraksen pada nama peserta tampil rusak.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function buildXlsx(rows: unknown[][]) {
  // Diimpor di dalam fungsi supaya library hanya dimuat ketika XLSX benar-benar
  // diminta. Unduhan CSV tetap ringan meski library ini cukup besar.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Orders");

  sheet.addRow([...EXPORT_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  // Baris judul dibekukan agar tetap terlihat saat panitia menggulir ratusan
  // baris order untuk rekonsiliasi.
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) sheet.addRow(row);

  // Kolom nominal diberi format angka supaya bisa langsung dijumlahkan di Excel.
  // Tanpa ini nilainya bisa terbaca sebagai teks dan SUM menghasilkan nol.
  for (const index of [6, 7]) {
    sheet.getColumn(index).numFmt = "#,##0";
  }

  sheet.columns.forEach((column) => { column.width = 18; });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function exportFilename(format: ExportFormat) {
  return `tally-orders-${new Date().toISOString().slice(0, 10)}.${format}`;
}

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
