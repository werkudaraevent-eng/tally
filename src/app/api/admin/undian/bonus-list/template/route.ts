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
  const sheet = workbook.addWorksheet("Daftar Tiket Tambahan");

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
  const help = workbook.addWorksheet("Cara mengisi");
  help.getColumn(1).width = 100;
  const notes = [
    "CARA MENGISI DAFTAR TIKET TAMBAHAN",
    "",
    "1. Satu orang per baris, mulai baris ke-2. Jangan hapus baris judulnya.",
    "2. Hapus dua baris contoh sebelum mengupload.",
    "3. Isi QR peserta ATAU Email. Cukup salah satu; kalau keduanya diisi, QR yang dipakai.",
    "4. Nama hanya untuk memudahkan panitia mengecek. Nama TIDAK dipakai untuk mencocokkan.",
    "",
    "CATATAN",
    "",
    "- Jumlah tiket tambahan diatur di aturan hadiah, bukan di berkas ini.",
    "  Untuk tingkat berbeda (mis. VIP +4, VVIP +9), buat dua berkas dan dua aturan.",
    "- Orang yang sama ditulis dua kali dihitung sekali.",
    "- Maksimal 5000 baris. Selain .xlsx, sistem juga menerima .csv.",
  ];
  for (const line of notes) help.addRow([line]);
  help.getRow(1).font = { bold: true, size: 14 };
  help.getRow(8).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="templat-tiket-tambahan.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
