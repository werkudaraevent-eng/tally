import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Trial-mode reset: wipes recorded orders + audit trail (and optionally the
// synced participant list) so the event can be rehearsed from a clean slate.
// Requires an explicit confirmation phrase to prevent accidental data loss.
const bodySchema = z.object({
  confirm: z.literal("HAPUS SEMUA DATA"),
  include_participants: z.boolean().default(false),
});

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await getSupabaseServiceClient().rpc(
    "admin_reset_records" as never,
    { p_actor: auth.user.id, p_include_participants: parsed.data.include_participants } as never,
  );
  if (error) return apiError(mapDatabaseError(error), 500);
  return Response.json(data);
}
