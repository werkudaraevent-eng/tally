import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { daftarStasiun } from "@/lib/badge/stasiun-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Jeda dan Lanjutkan, hanya dari laptop pemegang lease. Selama dijeda,
 * pemindai tetap mencatat dan badge tetap antre (dengan batas umurnya).
 *
 * Tanpa `.select()` pada update: PostgREST di bawah v14 menerapkan ulang
 * filter PATCH saat membaca balik. Hasilnya dibaca terpisah.
 */
const bodySchema = z.object({
  stasiun_id: z.number().int().positive(),
  token: z.string().uuid(),
  dijeda: z.boolean(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const eventId = auth.scope.event.id;
  const { error, count } = await getSupabaseServiceClient()
    .from("badge_stasiun")
    .update({ dijeda: parsed.data.dijeda } as never, { count: "exact" })
    .eq("event_id", eventId)
    .eq("id", parsed.data.stasiun_id)
    .eq("lease_token", parsed.data.token);
  if (error) return apiError("INTERNAL_ERROR", 500);
  // Token ini bukan lagi pemegang stasiun (diambil alih laptop lain): tidak ada
  // yang berubah, dan itu dikatakan, bukan dijawab 200 dengan keadaan lama.
  if (count === 0) return apiError("VALIDATION_ERROR", 409, { message: "Another laptop holds this station now.", lease: "hilang" });

  const stasiun = (await daftarStasiun(eventId))?.find((s) => s.id === parsed.data.stasiun_id);
  if (!stasiun) return apiError("VALIDATION_ERROR", 404, { message: "This print station no longer exists." });
  return Response.json({ dijeda: stasiun.dijeda });
}
