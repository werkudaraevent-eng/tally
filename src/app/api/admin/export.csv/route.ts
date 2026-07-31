import { requireUser } from "@/lib/auth/guards";
import {
  EXPORT_CONTENT_TYPES,
  buildCsv,
  exportFilename,
  loadExportRows,
} from "@/lib/export-orders";

// Alamat export lama. Dipertahankan karena disebut di
// SPEC-prima-executive-gathering-2026.md dan bisa sudah tersimpan sebagai bookmark
// panitia; menghapusnya berarti tautan yang pernah bekerja mendadak mati.
//
// Isinya kini dibangun modul yang sama dengan /api/admin/export, sehingga kolom
// dan urutannya tidak akan berbeda antara alamat lama dan baru.
export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  try {
    const rows = await loadExportRows();
    return new Response(buildCsv(rows), {
      headers: {
        "Content-Type": EXPORT_CONTENT_TYPES.csv,
        "Content-Disposition": `attachment; filename="${exportFilename("csv")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Export gagal." } }, { status: 500 });
  }
}
