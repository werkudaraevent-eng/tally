import { requireUser } from "@/lib/auth/guards";
import { BONUS_TEMPLATE_HEADERS } from "@/lib/undian-bonus-list";

// Templat daftar tiket tambahan: QR peserta, Email, Nama (untuk dicek).
//
// Berbeda dari templat Daftar import (Nama, Perusahaan, Kode, Bobot): daftar ini
// menunjuk peserta acara yang sudah ada, jadi kuncinya QR atau email, dan tidak
// ada kolom bobot. Jumlah tiket diatur di aturannya, satu angka per daftar.

const EXAMPLE_ROWS = [
  ["KSO-0142", "", "Andi Wijaya"],
  ["", "siti.rahma@contoh.co.id", "Siti Rahma"],
];

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Bonus ticket list");

  sheet.addRow([...BONUS_TEMPLATE_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECFB" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of EXAMPLE_ROWS) sheet.addRow(row);

  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 34;
  sheet.getColumn(3).width = 32;
  // QR dipaksa teks: Excel membuang nol di depan ("0142" menjadi 142), dan QR
  // yang berubah bentuk tidak cocok dengan peserta mana pun.
  sheet.getColumn(1).numFmt = "@";

  // Cara mengisi di sheet kedua, supaya tidak terbaca sebagai baris data.
  const help = workbook.addWorksheet("How to fill in");
  help.getColumn(1).width = 100;
  const notes = [
    "HOW TO FILL IN THE BONUS TICKET LIST",
    "",
    "1. One person per row, starting on row 2. Do not delete the heading row.",
    "2. Delete the two example rows before uploading.",
    "3. Enter the Participant QR OR the Email. One is enough; if both are filled in, the QR is used.",
    "4. Name only helps the team check the list. Name is NOT used for matching.",
    "",
    "NOTES",
    "",
    "- The number of bonus tickets is set in the prize rule, not in this file.",
    "  For different tiers (e.g. VIP +4, VVIP +9), make two files and two rules.",
    "- The same person listed twice counts once.",
    "- Maximum 5000 rows. Besides .xlsx, the system also accepts .csv.",
  ];
  for (const line of notes) help.addRow([line]);
  help.getRow(1).font = { bold: true, size: 14 };
  help.getRow(8).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="bonus-ticket-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
