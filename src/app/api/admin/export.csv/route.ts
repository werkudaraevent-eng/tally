import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const { data, error } = await getSupabaseServiceClient().from("orders").select("code,created_at,booth_id,participant_id,has_discount_item,regular_amount,total_amount,status,payment_method,approval_code,paid_by").order("created_at", { ascending: true });
  if (error) return Response.json({ error: { code: "INTERNAL_ERROR", message: "Export gagal." } }, { status: 500 });
  const lines = ["order_code,waktu,booth_id,participant_id,item_diskon,nominal_reguler,total,status,metode_bayar,approval_code,kasir"];
  const rows = (data ?? []) as Array<{ code: string; created_at: string; booth_id: number; participant_id: string; has_discount_item: boolean; regular_amount: number; total_amount: number; status: string; payment_method: string | null; approval_code: string | null; paid_by: string | null }>;
  for (const row of rows) lines.push([row.code, row.created_at, row.booth_id, row.participant_id, row.has_discount_item ? "Y" : "N", row.regular_amount, row.total_amount, row.status, row.payment_method, row.approval_code, row.paid_by].map(escapeCsv).join(","));
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tally-orders-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
