import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireRequestEvent } from "@/lib/auth/request-event";

// Metode tidak lagi di-hardcode di sini: daftarnya dikelola admin lewat tabel
// payment_methods. Validasi keberadaan, status aktif, dan aturan nomor referensi
// dilakukan di dalam RPC settle_orders_transaction agar tidak bisa dilewati.
const schema = z.object({
  order_ids: z.array(z.string().uuid()).min(1),
  payment_method: z.string().trim().regex(/^[a-z0-9_]{2,32}$/),
  approval_code: z.string().nullable().optional(),
  paid_by: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["cashier"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  // SELURUH id harus milik event ini. Dicek dengan membandingkan JUMLAH, bukan
  // sekadar "ada yang cocok": satu id asing di dalam array sudah cukup untuk
  // melunasi order event lain, dan RPC-nya belum mengenal event.
  const client = getSupabaseServiceClient();
  const { count: milikEvent } = await client
    .from("orders")
    .select("id", { head: true, count: "exact" })
    .eq("event_id", auth.scope.event.id)
    .in("id", parsed.data.order_ids);
  if ((milikEvent ?? 0) !== parsed.data.order_ids.length) {
    return apiError("ORDER_NOT_PENDING", 404, { reason: "Ada order yang bukan milik event ini." });
  }

  const { data, error } = await client.rpc("settle_orders_transaction" as never, {
    p_event_id: auth.scope.event.id,
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
