import { z } from "zod";
import type { Worksheet } from "exceljs";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { WINNER_STATUS_LABEL } from "@/lib/undian";
import { buildPrizeRecap, buildTimeline, loadWinners } from "@/lib/undian-results";

// Export hasil undian: satu berkas Excel berisi tiga sheet.
//
//   Pemenang   daftar lengkap, satu baris per orang
//   Timeline   kronologi undian dan keputusan, berurut waktu
//   Rekap      ringkasan per hadiah
//
// Tiga sheet dalam satu berkas, bukan tiga berkas terpisah. Ketiganya menjawab
// pertanyaan yang berbeda tentang peristiwa yang sama, dan panitia yang harus
// mengirim tiga lampiran akan mengirim satu lalu lupa dua sisanya.
//
// XLSX saja, tanpa pilihan CSV. Berbeda dengan export order — yang memang sering
// diolah ulang di sistem lain — hasil undian dibaca manusia sebagai laporan, dan
// CSV tidak bisa memuat tiga sheet sekaligus.

const querySchema = z.object({
  // Kosong berarti SELURUH riwayat, termasuk baris tanpa sesi.
  session: z.coerce.number().int().positive().optional(),
});

export async function GET(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const sessionId = parsed.success ? parsed.data.session ?? null : null;

  try {
    const client = getSupabaseServiceClient();
    const winners = await loadWinners(sessionId);

    let sessionName = "Semua sesi";
    if (sessionId !== null) {
      const { data } = await client.from("undian_sessions").select("name").eq("id", sessionId).maybeSingle();
      sessionName = (data as { name?: string } | null)?.name ?? `Sesi ${sessionId}`;
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();

    // --- Sheet 1: pemenang ---
    const sheet = workbook.addWorksheet("Pemenang");
    const headers = [
      "Sesi", "Hadiah", "Sponsor", "Undian ke", "Urutan", "Jenis",
      "Nama", "Perusahaan", "Kursi", "Kode badge",
      "Status", "Alasan batal", "Waktu undi", "Diundi oleh", "Waktu keputusan", "Diputuskan oleh",
    ];
    sheet.addRow(headers);
    for (const winner of winners) {
      sheet.addRow([
        winner.session_name ?? "(tanpa sesi)",
        winner.prize_name,
        winner.sponsor_name ?? "",
        winner.draw_round,
        winner.slot_order,
        winner.is_backup ? "Cadangan" : "Utama",
        winner.display_name,
        winner.company ?? "",
        winner.seat_label ?? "",
        winner.qr_code ?? "",
        WINNER_STATUS_LABEL[winner.status],
        winner.reject_reason ?? "",
        localTime(winner.drawn_at),
        winner.drawn_by_username ?? "",
        winner.decided_at ? localTime(winner.decided_at) : "",
        winner.decided_by_username ?? "",
      ]);
    }
    styleSheet(sheet, headers.length, [28, 26, 20, 10, 9, 11, 30, 30, 10, 16, 18, 26, 20, 16, 20, 16]);

    // --- Sheet 2: timeline ---
    const timeline = workbook.addWorksheet("Timeline");
    const timelineHeaders = ["Waktu", "Peristiwa", "Hadiah", "Keterangan", "Operator"];
    timeline.addRow(timelineHeaders);
    const KIND_LABEL = { draw: "Diundi", confirm: "Hadir & diserahkan", reject: "Dibatalkan" } as const;
    for (const event of buildTimeline(winners)) {
      timeline.addRow([localTime(event.at), KIND_LABEL[event.kind], event.prize_name, event.detail, event.actor ?? ""]);
    }
    styleSheet(timeline, timelineHeaders.length, [20, 20, 26, 80, 16]);

    // --- Sheet 3: rekap per hadiah ---
    const recap = workbook.addWorksheet("Rekap");
    const recapHeaders = ["Hadiah", "Sponsor", "Kali diundi", "Total nama", "Sah", "Belum dikonfirmasi", "Dibatalkan", "Cadangan", "Undi pertama", "Undi terakhir"];
    recap.addRow(recapHeaders);
    for (const row of buildPrizeRecap(winners)) {
      recap.addRow([
        row.prize_name, row.sponsor_name ?? "", row.draws, row.total,
        row.confirmed, row.pending, row.rejected, row.backups,
        row.first_draw_at ? localTime(row.first_draw_at) : "",
        row.last_draw_at ? localTime(row.last_draw_at) : "",
      ]);
    }
    styleSheet(recap, recapHeaders.length, [26, 20, 12, 12, 10, 20, 12, 12, 20, 20]);

    // --- Sheet 4: keterangan berkas ---
    //
    // Berkas laporan sering beredar terpisah dari konteksnya. Tanpa halaman ini,
    // penerima tidak tahu berkas ini menyangkut sesi mana, kapan diambil, dan apa
    // arti "Cadangan" atau "Belum dikonfirmasi".
    const info = workbook.addWorksheet("Keterangan");
    info.getColumn(1).width = 24;
    info.getColumn(2).width = 76;
    const rows: [string, string][] = [
      ["Lingkup", sessionName],
      ["Diambil pada", localTime(new Date().toISOString())],
      ["Diambil oleh", auth.user.username],
      ["Jumlah baris", String(winners.length)],
      ["", ""],
      ["Utama", "Pemenang yang berhak atas hadiah."],
      ["Cadangan", "Diundi bersamaan, dipakai hanya bila pemenang utama tidak hadir."],
      ["Sah", "Sudah dikonfirmasi hadir dan hadiahnya diserahkan."],
      ["Belum dikonfirmasi", "Namanya sudah keluar, tetapi belum ditandai hadir maupun dibatalkan."],
      ["Dibatalkan", "Tidak hadir atau tidak berhak; peserta kembali masuk kolam undian berikutnya."],
      ["Undian ke", "Nomor putaran pada hadiah tersebut. Satu putaran bisa mengeluarkan beberapa nama."],
    ];
    for (const [key, value] of rows) info.addRow([key, value]);
    info.getColumn(1).font = { bold: true };
    info.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const slug = sessionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "undian";
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="hasil-undian-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Export hasil undian gagal." } }, { status: 500 });
  }
}

/**
 * Waktu ditulis sebagai TEKS dalam zona Asia/Jakarta, bukan sebagai nilai tanggal
 * Excel.
 *
 * Nilai tanggal Excel tidak membawa zona waktu: penerima yang membuka berkas di
 * zona berbeda akan melihat jam yang bergeser, dan pada laporan undian jam adalah
 * bagian dari buktinya. Teks tidak bisa bergeser.
 */
function localTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).replace(/\./g, ":");
}

// Tipe diimpor dari exceljs, bukan disusun sendiri: tipe struktural buatan
// tangan akan menyimpang begitu pustakanya diperbarui, dan penyimpangannya
// muncul sebagai galat yang membingungkan di tempat lain.
function styleSheet(sheet: Worksheet, columnCount: number, widths: number[]) {
  sheet.getRow(1).font = { bold: true };
  // Baris judul dibekukan agar tetap terlihat saat menggulir ratusan baris, dan
  // filter dipasang supaya penerima bisa menyaring per hadiah tanpa menyiapkan
  // apa pun lebih dulu.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnCount } };
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}
