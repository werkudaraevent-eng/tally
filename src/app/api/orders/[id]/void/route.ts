import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/guards";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ reason: z.string().trim().min(1).max(500), user_id: z.string().uuid().nullable().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // Booth ikut diizinkan karena saat konfirmasi kasir dimatikan, order langsung
  // final dan booth tidak punya jalan koreksi lain untuk salah input. Batasannya
  // ditegakkan di RPC: booth hanya boleh void order miliknya sendiri yang
  // auto_settled. Order alur kasir tetap mengikuti BR-08.
  const auth = await requireUser(["booth", "cashier", "admin"]);
  if (auth.response) return auth.response;
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return apiError("VALIDATION_ERROR", 422, body.success ? undefined : body.error.flatten());
  if (auth.user.role === "booth" && auth.user.booth_id === null) return apiError("FORBIDDEN", 403);
  const { data, error } = await getSupabaseServiceClient().rpc("void_order_transaction" as never, {
    p_order_id: params.data.id,
    p_reason: body.data.reason,
    p_user_id: auth.user.id,
    p_is_admin: auth.user.role === "admin",
    p_booth_id: auth.user.role === "booth" ? auth.user.booth_id : null,
  } as never);
  if (error) return apiError(mapDatabaseError(error), 409);
  return Response.json({ order: data });
}
