import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { stasiunBelumAda } from "@/lib/badge/stasiun-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Laporan stasiun setelah satu badge: `terkirim` (dialog cetak selesai) atau
 * `gagal` (badge tidak bisa disiapkan). `diterima: false` berarti token ini
 * bukan lagi pemegang lease, atau pekerjaannya sudah ditandai macet.
 */
const bodySchema = z.object({
  job_id: z.number().int().positive(),
  token: z.string().uuid(),
  hasil: z.enum(["terkirim", "gagal"]),
  galat: z.string().trim().max(200).nullish(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error, status } = await getSupabaseServiceClient().rpc("badge_cetak_selesai" as never, {
    p_event_id: auth.scope.event.id,
    p_job_id: parsed.data.job_id,
    p_token: parsed.data.token,
    p_hasil: parsed.data.hasil,
    p_galat: parsed.data.galat ?? null,
  } as never);
  if (error) return stasiunBelumAda(error, status) ? apiError("STASIUN_NOT_READY", 409) : apiError("INTERNAL_ERROR", 500);
  return Response.json({ diterima: Boolean(data) });
}
