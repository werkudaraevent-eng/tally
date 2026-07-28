import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const querySchema = z.object({
  status: z.enum(["pending", "paid", "void", "handed_over"]).optional(),
  booth_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type OrderRow = {
  id: string;
  code: string;
  booth_id: number;
  has_discount_item: boolean;
  regular_amount: number;
  total_amount: number;
  status: string;
  pickup_mode: string;
  payment_method: string | null;
  approval_code: string | null;
  created_at: string;
  paid_at: string | null;
  handed_over_at: string | null;
  void_reason: string | null;
  participants: { name: string; company: string | null; qr_code: string } | null;
};

export async function GET(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  let query = client
    .from("orders")
    .select("id,code,booth_id,has_discount_item,regular_amount,total_amount,status,pickup_mode,payment_method,approval_code,created_at,paid_at,handed_over_at,void_reason,participants(name,company,qr_code)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);
  if (parsed.data.status) query = query.eq("status", parsed.data.status);
  if (parsed.data.booth_id) query = query.eq("booth_id", parsed.data.booth_id);
  if (parsed.data.q) query = query.ilike("code", `%${parsed.data.q.replace(/[%_,]/g, " ")}%`);

  const { data, error, count } = await query;
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ total: count ?? 0, limit: parsed.data.limit, offset: parsed.data.offset, orders: (data ?? []) as unknown as OrderRow[] });
}
