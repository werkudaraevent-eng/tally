import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

export async function GET(request: Request) {
  const auth = await requireUser(["booth", "admin"]);
  if (auth.response) return auth.response;
  if (auth.user.role === "booth" && !auth.user.booth_id) return apiError("FORBIDDEN", 403);
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  let query = getSupabaseServiceClient()
    .from("orders")
    .select("id,code,booth_id,has_discount_item,total_amount,status,pickup_mode,created_at,participants(qr_code,name,company)")
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);
  if (auth.user.role === "booth") query = query.eq("booth_id", auth.user.booth_id as number);
  const { data, error } = await query;
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ orders: data ?? [] });
}
