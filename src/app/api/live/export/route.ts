import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import { CONTENT_TYPES, buildCsv, buildXlsx, exportFilename, exportHeaders, loadParticipantExportRows } from "@/lib/participants-io";
import { normalizeTimeZone } from "@/lib/timezone";

/**
 * Unduhan daftar pendaftar untuk akun Viewer.
 *
 * Isinya ekspor peserta yang sama dengan milik admin, minus dua kolom: QR code
 * (kunci masuk tiap tamu; berkas klien bisa diteruskan ke mana saja) dan
 * participant_id (hanya berguna untuk impor ulang, yang tidak bisa dilakukan
 * viewer).
 */
const DIBUANG = new Set(["qr_code", "participant_id"]);

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["viewer", "admin"], { readOnly: true });
  if (auth.response) return auth.response;

  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const event = auth.scope.event;
  const fields = ((event.registration_form_config as RegistrationFormConfig | null)?.fields ?? []) as RegistrationField[];

  try {
    const semua = exportHeaders(fields);
    const simpan = semua.map((kolom, index) => (DIBUANG.has(kolom) ? -1 : index)).filter((index) => index >= 0);
    const headers = simpan.map((index) => semua[index]);
    const rows = (await loadParticipantExportRows(event.id, fields, normalizeTimeZone(event.time_zone))).map((row) => simpan.map((index) => row[index]));
    const body = format === "xlsx" ? await buildXlsx(rows, headers) : buildCsv(rows, headers);
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type": CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${exportFilename(format, event.slug)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (galat) {
    console.error("Ekspor viewer gagal:", galat);
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Export failed." } }, { status: 500 });
  }
}
