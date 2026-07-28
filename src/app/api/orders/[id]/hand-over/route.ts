import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/guards";
import { canUseBooth } from "@/lib/auth/roles";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["booth", "admin"]);
  if (auth.response) return auth.response;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return apiError("VALIDATION_ERROR", 422);
  const { data: order } = await getSupabaseServiceClient().from("orders").select("booth_id").eq("id", params.data.id).single() as { data: { booth_id: number } | null };
  if (!order || !canUseBooth(auth.user, order.booth_id)) return apiError("FORBIDDEN", 403);
  const { data, error } = await getSupabaseServiceClient().rpc("hand_over_order_transaction" as never, { p_order_id: params.data.id, p_user_id: auth.user.id } as never);
  if (error) return apiError(mapDatabaseError(error), 409);
  return Response.json({ order: data });
}
