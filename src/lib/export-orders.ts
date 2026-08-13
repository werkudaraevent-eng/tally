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
  booths: { code: string; name: string } | null;
  participants: { name: string; company: string | null } | null;
  order_special_items: Array<{ price_at_claim: number; special_offers: { name: string } | null }>;
};

/** Judul kolom. Urutannya harus sama dengan `toRow`. */
//
// `booth_id` dan `participant_id` sengaja DIPERTAHANKAN di samping kolom yang mudah
// dibaca manusia: id itulah yang menyambungkan baris ini kembali ke database bila
// ada sengketa angka, sedangkan nama bisa berubah atau berulang.
//
// Sebelumnya export hanya memuat kedua id tersebut. Untuk rekonsiliasi itu nyaris
// tidak terpakai: pembaca harus menerjemahkan UUID peserta satu per satu, dan tidak
// ada keterangan APA yang diserahkan padahal tiap booth punya item berbeda.
export const EXPORT_HEADERS = [
  "order_code",
  "waktu",
  "booth_kode",
  "booth_nama",
  "peserta",
  "instansi",
  "item_diserahkan",
  "jumlah_item",
  "item_diskon",
  "nominal_reguler",
  "total",
  "status",
  "metode_bayar",
  "approval_code",
  "kasir",
  "booth_id",
  "participant_id",
] as const;

function toRow(order: OrderRow) {
  const items = order.order_special_items ?? [];
  // Nominal reguler ikut disebut sebagai baris item supaya kolom ini tidak pernah
  // kosong pada order yang sebenarnya berisi belanja biasa.
  const parts = [
    ...(order.regular_amount > 0 ? [`Item reguler (${order.regular_amount})`] : []),
    ...items.map((item) => `${item.special_offers?.name ?? "Item dihapus"} (${item.price_at_claim})`),
  ];
  return [
    order.code,
    order.created_at,
    order.booths?.code ?? "",
    order.booths?.name ?? "",
    order.participants?.name ?? "",
    order.participants?.company ?? "",
    parts.join(" + "),
    items.length,
    order.has_discount_item ? "Y" : "N",
    order.regular_amount,
    order.total_amount,
    order.status,
    order.payment_method,
    order.approval_code,
    order.paid_by,
    order.booth_id,
    order.participant_id,
  ];
}

export async function loadExportRows(eventId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("orders")
    .select("code,created_at,booth_id,participant_id,has_discount_item,regular_amount,total_amount,status,payment_method,approval_code,paid_by,booths(code,name),participants(name,company),order_special_items(price_at_claim,special_offers(name))")
    .eq("event_id", eventId)
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
  //
  // Indeks dihitung dari EXPORT_HEADERS, bukan ditulis sebagai angka tetap. Versi
  // sebelumnya memakai [6, 7] secara harfiah, dan angka itu langsung salah menunjuk
  // kolom begitu ada kolom baru disisipkan di depannya.
  for (const name of ["nominal_reguler", "total"] as const) {
    const index = EXPORT_HEADERS.indexOf(name) + 1;
    if (index > 0) sheet.getColumn(index).numFmt = "#,##0";
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
