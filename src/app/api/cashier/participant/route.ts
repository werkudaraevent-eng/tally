import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["cashier", "admin"]);
  if (auth.response) return auth.response;
  const parsed = z.object({ qr: z.string().trim().min(1).max(200) }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();
  const participantQuery = await client.from("participants").select("id,qr_code,name,company,title,photo_url,allow_name_display").eq("event_id", eventId).eq("qr_code", parsed.data.qr).single();
  const participant = participantQuery.data as { id: string; qr_code: string; name: string; company: string | null; title: string | null; photo_url: string | null; allow_name_display: boolean } | null;
  const participantError = participantQuery.error;
  if (participantError || !participant) return apiError("PARTICIPANT_NOT_FOUND", 404);
  const { data: orders, error: ordersError } = await client.from("orders").select("id,code,participant_id,booth_id,has_discount_item,regular_amount,total_amount,status,pickup_mode,note,created_at,payment_method,approval_code,paid_at,handed_over_at,void_reason").eq("event_id", eventId).eq("participant_id", participant.id).eq("status", "pending").order("created_at", { ascending: true });
  if (ordersError) return apiError("INTERNAL_ERROR", 500);
  const pendingOrders = (orders ?? []) as Array<{ total_amount: number }>;
  return Response.json({ participant, orders: pendingOrders, grand_total: pendingOrders.reduce((sum, order) => sum + order.total_amount, 0) });
}
