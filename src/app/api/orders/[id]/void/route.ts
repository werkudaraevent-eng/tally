import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/guards";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ reason: z.string().trim().min(1).max(500), user_id: z.string().uuid().nullable().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["cashier", "admin"]);
  if (auth.response) return auth.response;
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return apiError("VALIDATION_ERROR", 422, body.success ? undefined : body.error.flatten());
  const { data, error } = await getSupabaseServiceClient().rpc("void_order_transaction" as never, { p_order_id: params.data.id, p_reason: body.data.reason, p_user_id: auth.user.id } as never);
  if (error) return apiError(mapDatabaseError(error), 409);
  return Response.json({ order: data });
}
