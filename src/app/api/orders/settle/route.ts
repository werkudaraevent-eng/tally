import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/guards";

const schema = z.object({
  order_ids: z.array(z.string().uuid()).min(1),
  payment_method: z.enum(["edc", "cash"]),
  approval_code: z.string().nullable().optional(),
  paid_by: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await requireUser(["cashier"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { data, error } = await getSupabaseServiceClient().rpc("settle_orders_transaction" as never, {
    p_order_ids: parsed.data.order_ids,
    p_payment_method: parsed.data.payment_method,
    p_approval_code: parsed.data.approval_code ?? null,
    p_paid_by: auth.user.id,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "ORDER_NOT_PENDING" ? 409 : 422);
  }
  const settledOrders = (data ?? []) as Array<{ total_amount: number }>;
  return Response.json({ settled_orders: settledOrders, total: settledOrders.reduce((sum, order) => sum + order.total_amount, 0) });
}
