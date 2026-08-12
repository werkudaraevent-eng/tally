import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireRequestEvent } from "@/lib/auth/request-event";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["booth", "admin"]);
  if (auth.response) return auth.response;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return apiError("VALIDATION_ERROR", 422);
  const { role, boothId, event } = auth.scope;
  // Filter event ikut di query yang sama: order milik event lain tidak akan
  // ditemukan, sehingga tidak perlu pemeriksaan terpisah yang bisa terlupa.
  const { data: order } = await getSupabaseServiceClient().from("orders").select("booth_id").eq("event_id", event.id).eq("id", params.data.id).maybeSingle() as { data: { booth_id: number } | null };
  const boleh = order && (role === "admin" || role === "super_admin" || (role === "booth" && boothId === order.booth_id));
  if (!boleh) return apiError("FORBIDDEN", 403);
  const { data, error } = await getSupabaseServiceClient().rpc("hand_over_order_transaction" as never, { p_order_id: params.data.id, p_user_id: auth.user.id } as never);
  if (error) return apiError(mapDatabaseError(error), 409);
  return Response.json({ order: data });
}
