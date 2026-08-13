import { z } from "zod";
import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireRequestEvent } from "@/lib/auth/request-event";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["cashier", "admin"]);
  if (auth.response) return auth.response;
  const params = z.object({ id: z.string().uuid() }).safeParse(await context.params);
  if (!params.success) return apiError("VALIDATION_ERROR", 422);
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();
  const [{ data: participant, error: participantError }, { data: orders, error: ordersError }] = await Promise.all([
    client.from("participants").select("id,qr_code,name,company,title,photo_url,allow_name_display").eq("event_id", eventId).eq("id", params.data.id).single(),
    client.from("orders").select("id,code,participant_id,booth_id,has_discount_item,regular_amount,total_amount,status,pickup_mode,note,created_at,payment_method,approval_code,paid_at,handed_over_at,void_reason").eq("event_id", eventId).eq("participant_id", params.data.id).eq("status", "pending").order("created_at", { ascending: true }),
  ]);
  if (participantError || ordersError) return apiError("INTERNAL_ERROR", 500);
  const pendingOrders = (orders ?? []) as Array<{ total_amount: number }>;
  return Response.json({ participant, orders: pendingOrders, grand_total: pendingOrders.reduce((sum, order) => sum + order.total_amount, 0) });
}
