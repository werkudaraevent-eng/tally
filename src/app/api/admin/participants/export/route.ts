import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import {
  CONTENT_TYPES,
  buildCsv,
  buildXlsx,
  exportFilename,
  exportHeaders,
  importHeaders,
  loadParticipantExportRows,
  templateFilename,
  templateRows,
} from "@/lib/participants-io";

/**
 * Unduh seluruh peserta event ini.
 *
 * Tanpa filter pencarian dan tanpa paginasi, sengaja. Ekspor dipakai untuk dua
 * hal -- menyunting massal lalu mengunggah kembali, dan menyerahkan daftar ke
 * klien -- dan keduanya rusak oleh hasil yang diam-diam terpotong pada 25 baris
 * yang kebetulan sedang tampil di layar.
 *
 * `readOnly: true` karena ini GET yang tidak menulis apa pun: penjaga tulis di
 * requireRequestEvent tidak boleh menghalangi panitia mengunduh data event yang
 * sudah selesai atau diarsipkan -- justru di sanalah ekspor paling dibutuhkan.
 *
 * Kolomnya mengikuti pertanyaan tambahan form pendaftaran acara ini, jadi
 * template yang diunduh hari ini memuat pertanyaan yang ditambahkan admin
 * kemarin — tanpa ada yang perlu memperbarui daftar kolom di mana pun.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "xlsx" ? "xlsx" : "csv";
  // Template berbagi endpoint dengan ekspor, bukan berdiri sendiri: keduanya
  // menghasilkan berkas dengan kolom yang harus tetap sepadan, dan endpoint
  // terpisah adalah tempat kedua yang bisa ketinggalan saat kolom bertambah.
  const isTemplate = params.get("template") === "1";
  const fields = ((auth.scope.event.registration_form_config as RegistrationFormConfig | null)?.fields ?? []) as RegistrationField[];

  try {
    const headers = isTemplate ? importHeaders(fields) : exportHeaders(fields);
    const rows = isTemplate ? templateRows(fields) : await loadParticipantExportRows(auth.scope.event.id, fields);
    const body = format === "xlsx" ? await buildXlsx(rows, headers) : buildCsv(rows, headers);
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type": CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${isTemplate ? templateFilename(format) : exportFilename(format, auth.scope.event.slug)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Export peserta gagal." } }, { status: 500 });
  }
}
