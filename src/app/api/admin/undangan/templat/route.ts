import { requireRequestEvent } from "@/lib/auth/request-event";
import { CONTOH_TEMPLAT_EN, KOLOM_TEMPLAT } from "@/lib/undangan/templat";

// Templat impor tamu undangan. Berisi baris contoh, bukan hanya judul kolom,
// supaya panitia tahu kolom mana yang boleh kosong dan bentuk isinya. Pola yang
// sama dengan templat Undian dan Logistik.

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Invited guests");
  sheet.addRow(KOLOM_TEMPLAT);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECFB" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const baris of CONTOH_TEMPLAT_EN) sheet.addRow(baris);
  sheet.columns = [{ width: 28 }, { width: 34 }, { width: 30 }, { width: 24 }, { width: 18 }];
  // No. HP sebagai teks supaya angka nol di depan tidak hilang.
  sheet.getColumn(5).numFmt = "@";

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="invited-guests-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
