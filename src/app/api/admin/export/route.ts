import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import {
  EXPORT_CONTENT_TYPES,
  buildCsv,
  buildXlsx,
  exportFilename,
  loadExportRows,
  normalizeExportFormat,
} from "@/lib/export-orders";

// Export order dengan pilihan format.
//
// Endpoint lama `/api/admin/export.csv` tetap dipertahankan karena disebut di
// spec dan mungkin sudah dipakai di tempat lain; endpoint itu kini meneruskan
// pekerjaannya ke modul yang sama, jadi isi kedua format tidak akan berbeda.

const querySchema = z.object({ format: z.string().trim().toLowerCase().optional() });

export async function GET(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  // Format yang tidak dikenal jatuh ke CSV, bukan ditolak: unduhan yang gagal
  // total lebih merepotkan panitia daripada mendapat CSV saat salah ketik.
  const format = normalizeExportFormat(parsed.success ? parsed.data.format : undefined);

  try {
    const rows = await loadExportRows();
    const body = format === "xlsx" ? await buildXlsx(rows) : buildCsv(rows);

    return new Response(body, {
      headers: {
        "Content-Type": EXPORT_CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${exportFilename(format)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Export gagal." } }, { status: 500 });
  }
}
