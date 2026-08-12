import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();
  const [{ data: orders, error }, { data: booths, error: boothsError }] = await Promise.all([
    client.from("orders").select("status,total_amount,booth_id,has_discount_item,regular_amount").eq("event_id", eventId),
    client.from("booths").select("id,code,name,discount_item_stock,is_active").eq("event_id", eventId).order("id"),
  ]);
  if (error || boothsError) return apiError("INTERNAL_ERROR", 500);
  const allOrders = (orders ?? []) as Array<{ status: string; total_amount: number; booth_id: number; has_discount_item: boolean }>;
  const boothRows = (booths ?? []) as Array<{ id: number; code: string; name: string; discount_item_stock: number | null; is_active: boolean }>;
  const settled = allOrders.filter((order) => order.status === "paid" || order.status === "handed_over");
  return Response.json({
    total_revenue: settled.reduce((sum, order) => sum + order.total_amount, 0),
    total_orders: allOrders.length,
    pending_count: allOrders.filter((order) => order.status === "pending").length,
    orders_per_booth: boothRows.map((booth) => ({ ...booth, orders: allOrders.filter((order) => order.booth_id === booth.id).length })),
    discount_items_claimed_per_booth: boothRows.map((booth) => ({ booth_id: booth.id, claimed: allOrders.filter((order) => order.booth_id === booth.id && order.has_discount_item && order.status !== "void").length })),
  });
}
