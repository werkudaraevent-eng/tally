import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { halamanKlien, hitunganKlien, kolomJawabanKlien } from "@/lib/live/data";
import { normalizeTimeZone } from "@/lib/timezone";

/**
 * Data pendaftaran untuk akun Viewer (klien), dibaca ulang tiap 30 detik.
 *
 * Endpoint sendiri, bukan /api/admin/participants yang dibuka untuk viewer:
 * route admin itu juga melayani POST, impor, dan detail baris lengkap (extra,
 * berkas unggahan, logistik). Membuka satu jalur admin untuk peran baca-saja
 * berarti setiap perubahan di jalur itu harus ingat peran ini. Di sini hanya
 * ada satu GET, dengan kolom yang memang boleh dilihat klien (lib/live/data).
 *
 * Admin ikut diizinkan supaya panitia bisa melihat persis apa yang dilihat klien.
 */
const querySchema = z.object({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(["registered_at", "name", "company"]).default("registered_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["viewer", "admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const event = auth.scope.event;
  try {
    const kolom = kolomJawabanKlien(event.registration_form_config);
    const [halaman, counts] = await Promise.all([halamanKlien(event.id, parsed.data, kolom), hitunganKlien(event.id, event.time_zone)]);
    return Response.json(
      {
        event: { name: event.name, slug: event.slug, status: event.status, time_zone: normalizeTimeZone(event.time_zone) },
        counts,
        answer_columns: kolom.map(({ key, label }) => ({ key, label })),
        rows: halaman.rows,
        total: halaman.total,
        fetched_at: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (galat) {
    console.error("Data viewer gagal:", galat);
    return apiError("INTERNAL_ERROR", 500);
  }
}
