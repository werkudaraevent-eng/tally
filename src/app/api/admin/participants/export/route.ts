import { z } from "zod";
import { apiError } from "@/lib/api";
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
import { normalizeTimeZone } from "@/lib/timezone";

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
    const rows = isTemplate ? templateRows(fields) : await loadParticipantExportRows(auth.scope.event.id, fields, normalizeTimeZone(auth.scope.event.time_zone));
    const body = format === "xlsx" ? await buildXlsx(rows, headers) : buildCsv(rows, headers);
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type": CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${isTemplate ? templateFilename(format) : exportFilename(format, auth.scope.event.slug)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Participant export failed." } }, { status: 500 });
  }
}

const pilihanSchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  ids: z.array(z.string().uuid()).min(1).max(5000),
});

/**
 * Unduh hanya peserta yang dicentang di daftar.
 *
 * POST karena "pilih semua yang cocok" bisa ribuan id, terlalu panjang untuk
 * query string. Tetap baca-saja, jadi `readOnly: true` seperti GET di atas.
 */
export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const body = pilihanSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const fields = ((auth.scope.event.registration_form_config as RegistrationFormConfig | null)?.fields ?? []) as RegistrationField[];
  try {
    const rows = await loadParticipantExportRows(auth.scope.event.id, fields, normalizeTimeZone(auth.scope.event.time_zone), new Set(body.data.ids));
    const headers = exportHeaders(fields);
    const isi = body.data.format === "xlsx" ? await buildXlsx(rows, headers) : buildCsv(rows, headers);
    return new Response(isi as BodyInit, {
      headers: {
        "Content-Type": CONTENT_TYPES[body.data.format],
        "Content-Disposition": `attachment; filename="${exportFilename(body.data.format, auth.scope.event.slug).replace(/(\.[a-z]+)$/, "-selected$1")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Participant export failed." } }, { status: 500 });
  }
}
