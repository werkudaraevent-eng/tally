import { z } from "zod";
import type { Worksheet } from "exceljs";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
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

const WINNER_STATUS_LABEL = { pending: "Not confirmed", confirmed: "Confirmed", rejected: "Cancelled" } as const;

const querySchema = z.object({
  // Kosong berarti SELURUH riwayat, termasuk baris tanpa sesi.
  session: z.coerce.number().int().positive().optional(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const sessionId = parsed.success ? parsed.data.session ?? null : null;

  try {
    const client = getSupabaseServiceClient();
    const winners = await loadWinners(eventId, sessionId);

    let sessionName = "All sessions";
    if (sessionId !== null) {
      const { data } = await client.from("undian_sessions").select("name").eq("event_id", eventId).eq("id", sessionId).maybeSingle();
      sessionName = (data as { name?: string } | null)?.name ?? `Session ${sessionId}`;
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();

    // --- Sheet 1: pemenang ---
    const sheet = workbook.addWorksheet("Winners");
    const headers = [
      "Session", "Prize", "Sponsor", "Draw no.", "Order", "Type",
      "Name", "Company", "Seat", "Badge code",
      "Status", "Cancel reason", "Drawn at", "Drawn by", "Decided at", "Decided by",
    ];
    sheet.addRow(headers);
    for (const winner of winners) {
      sheet.addRow([
        winner.session_name ?? "(no session)",
        winner.prize_name,
        winner.sponsor_name ?? "",
        winner.draw_round,
        winner.slot_order,
        winner.is_backup ? "Backup" : "Main",
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
    const timelineHeaders = ["Time", "Event", "Prize", "Details", "Operator"];
    timeline.addRow(timelineHeaders);
    const KIND_LABEL = { draw: "Drawn", confirm: "Present & handed over", reject: "Cancelled" } as const;
    for (const event of buildTimeline(winners, "en")) {
      timeline.addRow([localTime(event.at), KIND_LABEL[event.kind], event.prize_name, event.detail, event.actor ?? ""]);
    }
    styleSheet(timeline, timelineHeaders.length, [20, 20, 26, 80, 16]);

    // --- Sheet 3: rekap per hadiah ---
    const recap = workbook.addWorksheet("Summary");
    const recapHeaders = ["Prize", "Sponsor", "Times drawn", "Total names", "Confirmed", "Not confirmed", "Cancelled", "Backups", "First draw", "Last draw"];
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
    const info = workbook.addWorksheet("About this file");
    info.getColumn(1).width = 24;
    info.getColumn(2).width = 76;
    const rows: [string, string][] = [
      ["Scope", sessionName],
      ["Exported at", localTime(new Date().toISOString())],
      ["Exported by", auth.user.username],
      ["Rows", String(winners.length)],
      ["", ""],
      ["Main", "The winner entitled to the prize."],
      ["Backup", "Drawn at the same time, used only if the main winner is not present."],
      ["Confirmed", "Confirmed present and the prize was handed over."],
      ["Not confirmed", "The name came out, but has not been marked present or cancelled."],
      ["Cancelled", "Not present or not eligible; the participant goes back into the pool for the next draw."],
      ["Draw no.", "The round number for that prize. One round can draw several names."],
      ["Times", "Asia/Jakarta (WIB)."],
    ];
    for (const [key, value] of rows) info.addRow([key, value]);
    info.getColumn(1).font = { bold: true };
    info.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const slug = sessionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "draw";
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="draw-results-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Could not export the draw results." } }, { status: 500 });
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
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
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
