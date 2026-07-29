import { requireUser } from "@/lib/auth/guards";
import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const client = getSupabaseServiceClient();
  const [{ data: orders, error: orderError }, { data: booths, error: boothError }, { data: participants, error: participantError }] = await Promise.all([
    client.from("orders").select("id,code,participant_id,booth_id,has_discount_item,regular_amount,total_amount,status,payment_method,created_at,paid_at,handed_over_at"),
    client.from("booths").select("id,code,name"),
    // Hanya peserta aktif: yang sudah dihapus di sumber tidak boleh menggelembungkan
    // angka laporan pasca-acara.
    client.from("participants").select("id,name,company,source_checked_in,source_total_scans").is("source_removed_at", null),
  ]);
  if (orderError || boothError || participantError) return apiError("INTERNAL_ERROR", 500);
  const orderRows = (orders ?? []) as Array<{ id: string; code: string; participant_id: string; booth_id: number; has_discount_item: boolean; regular_amount: number; total_amount: number; status: string; payment_method: string | null; created_at: string; paid_at: string | null; handed_over_at: string | null }>;
  const boothRows = (booths ?? []) as Array<{ id: number; code: string; name: string }>;
  const participantRows = (participants ?? []) as Array<{ id: string; name: string; company: string | null; source_checked_in: boolean; source_total_scans: number }>;
  const settled = orderRows.filter((order) => order.status === "paid" || order.status === "handed_over");
  return Response.json({
    summary: { total_revenue: settled.reduce((sum, order) => sum + order.total_amount, 0), gross_regular: settled.reduce((sum, order) => sum + order.regular_amount, 0), total_orders: orderRows.length, paid_orders: settled.length, pending_orders: orderRows.filter((order) => order.status === "pending").length, void_orders: orderRows.filter((order) => order.status === "void").length, discount_claims: orderRows.filter((order) => order.has_discount_item && order.status !== "void").length },
    booths: boothRows.map((booth) => { const boothOrders = orderRows.filter((order) => order.booth_id === booth.id); const boothSettled = boothOrders.filter((order) => order.status === "paid" || order.status === "handed_over"); return { ...booth, orders: boothOrders.length, paid: boothSettled.length, revenue: boothSettled.reduce((sum, order) => sum + order.total_amount, 0), discounts: boothOrders.filter((order) => order.has_discount_item && order.status !== "void").length }; }),
    participants: { total: participantRows.length, checked_in: participantRows.filter((participant) => participant.source_checked_in).length, total_scans: participantRows.reduce((sum, participant) => sum + participant.source_total_scans, 0) },
  });
}
