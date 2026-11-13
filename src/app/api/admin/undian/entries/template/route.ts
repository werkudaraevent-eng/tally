import { requireUser } from "@/lib/auth/guards";
import { TEMPLATE_HEADERS } from "@/lib/undian-import";

// Unduh templat daftar entri undian.
//
// Ada karena format yang benar tidak dapat ditebak dari layar kosong. Tanpa
// templat, panitia mengunggah berkas apa pun yang sudah mereka punya — dengan
// kolom bernama "Nama Lengkap Peserta", judul laporan di baris 1, dan baris
// kosong di tengahnya — lalu mendapat "tidak ada baris yang terbaca" tanpa tahu
// bagian mana yang salah.
//
// Templatnya sengaja berisi CONTOH BARIS, bukan hanya judul kolom. Berkas berisi
// empat judul kosong masih menyisakan pertanyaan apakah bobot boleh dikosongkan
// dan seperti apa bentuk kodenya. Dua baris contoh menjawab keduanya sekaligus,
// dan panitia tinggal menimpanya.

const EXAMPLE_ROWS = [
  ["Budi Santoso", "PT Maju Bersama", "K-001", 1],
  ["Siti Rahayu", "PT Jaya Abadi", "K-002", 3],
];

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  // Diimpor di dalam handler supaya pustaka yang cukup besar ini hanya dimuat
  // ketika templat benar-benar diminta. Pola yang sama dipakai buildXlsx() di
  // src/lib/export-orders.ts.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Draw list");

  sheet.addRow([...TEMPLATE_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECFB" } };
  // Baris judul dibekukan supaya tetap terlihat saat panitia menggulir ratusan
  // baris kupon.
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of EXAMPLE_ROWS) sheet.addRow(row);

  sheet.getColumn(1).width = 32;
  sheet.getColumn(2).width = 32;
  sheet.getColumn(3).width = 16;
  sheet.getColumn(4).width = 10;

  // Kolom Kode dipaksa berformat TEKS.
  //
  // Tanpa ini Excel mengubah kode seperti "001" menjadi angka 1 dan membuang nol
  // di depannya, lalu "1-2" menjadi tanggal. Nomor kupon yang berubah bentuk baru
  // ketahuan saat pemenang dipanggil dan nomornya tidak cocok dengan kupon fisik
  // yang dipegang tamu.
  sheet.getColumn(3).numFmt = "@";

  // Catatan cara pakai diletakkan di sheet KEDUA, bukan di atas tabel.
  //
  // Menaruhnya sebagai baris keterangan di sheet pertama akan membuat parser
  // membacanya sebagai data — dan panitia yang lupa menghapusnya akan mendapati
  // "Cara mengisi:" ikut berputar di roda sebagai nama peserta.
  const help = workbook.addWorksheet("How to fill in");
  help.getColumn(1).width = 100;
  const notes = [
    "HOW TO FILL IN THE DRAW LIST",
    "",
    "1. Start on row 2 of the \"Draw list\" sheet. Do not delete the heading row.",
    "2. Delete the two example rows before uploading.",
    "3. Name is REQUIRED. Rows without a name are skipped.",
    "4. Company, Code and Weight can be left empty.",
    "",
    "COLUMNS",
    "",
    "Name        The name shown large on the stage screen.",
    "Company     Shown small under the name. A job title or other note also works.",
    "Code        Coupon number, seat number or QR code. Optional.",
    "Weight      Number of draw tickets. Empty or 1 means one ticket.",
    "            Enter 3 if the person collected 3 coupons, so their chance is three times higher.",
    "            Maximum 1000.",
    "",
    "NOTES",
    "",
    "- Maximum 5000 rows per list.",
    "- The same name can appear more than once; each is drawn separately.",
    "  Only rows whose ENTIRE content is identical are skipped.",
    "- Besides .xlsx, the system also accepts .csv and .txt, or a paste straight from Excel.",
    "- Indonesian column headings (Nama, Perusahaan, Kode, Bobot) still work.",
  ];
  for (const line of notes) help.addRow([line]);
  help.getRow(1).font = { bold: true, size: 14 };
  for (const rowNumber of [8, 17]) help.getRow(rowNumber).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="draw-list-template.xlsx"',
      // Templat berubah hanya saat kode berubah, tapi tetap tidak di-cache:
      // panitia yang mengunduh ulang setelah kolomnya bertambah harus mendapat
      // versi yang baru, bukan salinan lama dari peramban.
      "Cache-Control": "no-store",
    },
  });
}
