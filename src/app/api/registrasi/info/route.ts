import { apiError } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";

/**
 * Konfigurasi form untuk halaman /daftar. Publik.
 *
 * Yang dikirim SENGAJA sedikit: nama acara, tanggal, dan bentuk formnya. Status
 * event, slug Scanner API, dan `registration_auto_approve` TIDAK ikut —
 * pendaftar tidak perlu tahu apakah pendaftarannya akan disetujui otomatis, dan
 * mengumumkannya berarti memberitahu bahwa tidak ada yang memeriksa.
 */
export async function GET(request: Request) {
  const event = await getPublicRequestEvent(request);
  if (!event) return apiError("VALIDATION_ERROR", 404, { message: "Acara tidak ditemukan." });
  if (!event.registration_enabled) return apiError("REGISTRATION_CLOSED", 422);

  const config = event.registration_form_config ?? {};
  return Response.json({
    event: { name: event.name, slug: event.slug, event_date: event.event_date, time_zone: event.time_zone },
    form: {
      fields: config.fields ?? [],
      welcome_text: config.welcome_text ?? null,
      success_text: config.success_text ?? null,
      require_company: config.require_company ?? false,
      require_job_title: config.require_job_title ?? false,
    },
  });
}
