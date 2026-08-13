import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["booth", "admin"]);
  if (auth.response) return auth.response;
  if (auth.scope.role === "booth" && !auth.scope.boothId) return apiError("FORBIDDEN", 403);
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  // auto_settled dikirim agar layar booth tahu order mana yang boleh di-void
  // sendiri (order mode tanpa kasir), tanpa menebak dari status.
  let query = getSupabaseServiceClient()
    .from("orders")
    .select("id,code,booth_id,has_discount_item,total_amount,status,pickup_mode,auto_settled,created_at,participants(qr_code,name,company)")
    .eq("event_id", auth.scope.event.id)
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);
  if (auth.scope.role === "booth") query = query.eq("booth_id", auth.scope.boothId as number);
  const { data, error } = await query;
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ orders: data ?? [] });
}
