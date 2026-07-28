import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

type PendingRow = {
  id: string;
  code: string;
  booth_id: number;
  total_amount: number;
  created_at: string;
  participant_id: string;
  participants: { qr_code: string; name: string; company: string | null } | null;
};

export async function GET() {
  const auth = await requireUser(["cashier", "admin"]);
  if (auth.response) return auth.response;
  const { data, error } = await getSupabaseServiceClient()
    .from("orders")
    .select("id,code,booth_id,total_amount,created_at,participant_id,participants(qr_code,name,company)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) return apiError("INTERNAL_ERROR", 500);

  const rows = (data ?? []) as unknown as PendingRow[];
  const grouped = new Map<string, { qr_code: string; name: string; company: string | null; orders_count: number; total: number; oldest_created_at: string }>();
  for (const row of rows) {
    const key = row.participant_id;
    const current = grouped.get(key);
    if (current) {
      current.orders_count += 1;
      current.total += row.total_amount;
    } else {
      grouped.set(key, {
        qr_code: row.participants?.qr_code ?? "",
        name: row.participants?.name ?? "Peserta",
        company: row.participants?.company ?? null,
        orders_count: 1,
        total: row.total_amount,
        oldest_created_at: row.created_at,
      });
    }
  }
  return Response.json({ participants: Array.from(grouped.values()) });
}
