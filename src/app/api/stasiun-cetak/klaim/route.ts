import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { stasiunBelumAda } from "@/lib/badge/stasiun-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Laptop ini memegang nama stasiun. Token dibuat di tab stasiun dan hanya
 * hidup di tab itu; nama yang lease-nya masih dipegang tab lain dijawab
 * `dipakai`, kecuali petugas menekan Take over dengan sadar.
 *
 * Dipakai juga sebagai detak jantung saat stasiun tidak boleh mengambil
 * pekerjaan (kertas tidak cocok): lease tetap hidup tanpa mengambil badge.
 */
const bodySchema = z.object({
  nama: z.string().trim().min(1).max(40),
  token: z.string().uuid(),
  ambil_alih: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error, status } = await getSupabaseServiceClient().rpc("badge_stasiun_klaim" as never, {
    p_event_id: auth.scope.event.id,
    p_nama: parsed.data.nama,
    p_token: parsed.data.token,
    p_ambil_alih: parsed.data.ambil_alih ?? false,
  } as never);
  if (error) return stasiunBelumAda(error, status) ? apiError("STASIUN_NOT_READY", 409) : apiError("INTERNAL_ERROR", 500);
  return Response.json(data);
}
