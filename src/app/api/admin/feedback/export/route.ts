import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { labelKolom, muatHasil, muatSetelan } from "@/lib/kilas-balik/server";
import { normalizeTimeZone, timeZoneAbbr } from "@/lib/timezone";

/**
 * Admin > Feedback > Results > Download .xlsx: satu baris per peserta yang
 * menjawab, kolom peserta lalu satu kolom per pertanyaan. Pilihan ganda
 * digabung koma. qr_code tidak pernah ikut.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const muat = await muatSetelan(event.id).catch(() => null);
  if (!muat?.siap) return apiError("VALIDATION_ERROR", 409);
  const hasil = await muatHasil(event.id);
  if (!hasil) return apiError("INTERNAL_ERROR", 500);

  const label = labelKolom(event);
  const kolomPeserta = [...new Set(hasil.baris.flatMap((b) => Object.keys(b.peserta)))].filter((k) => hasil.baris.some((b) => b.peserta[k]));
  const urut = ["name", "email", "company", "title", "participant_type"];
  kolomPeserta.sort((a, b) => (urut.indexOf(a) + 1 || 99) - (urut.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const tanya = muat.setelan.questions;
  // Waktu kirim di zona acara, sebagai teks: Excel tidak menyimpan zona waktu.
  const zona = normalizeTimeZone(event.time_zone);
  const waktu = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Answers");
  sheet.addRow([...kolomPeserta.map((k) => label[k] ?? k.replace(/^extra\./, "")), ...tanya.map((q) => q.title), `Submitted at (${timeZoneAbbr(zona)})`]);
  sheet.getRow(1).font = { bold: true };
  for (const b of hasil.baris) {
    sheet.addRow([
      ...kolomPeserta.map((k) => b.peserta[k] ?? ""),
      ...tanya.map((q) => {
        const v = b.answers[q.key];
        return Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : (v as string | number);
      }),
      waktu.format(new Date(b.submitted_at)).replace(",", ""),
    ]);
  }
  sheet.columns.forEach((kolom) => {
    kolom.width = 22;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="feedback-${event.slug}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
