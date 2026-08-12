import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { MAX_ORDER_AMOUNT } from "@/lib/domain";

const bodySchema = z.object({
  order_code: z.string().trim().min(1).max(20),
  participant_id: z.string().uuid(),
  booth_id: z.number().int().positive(),
  has_discount_item: z.boolean(),
  regular_amount: z.number().int().min(0).max(MAX_ORDER_AMOUNT),
  note: z.string().max(500).optional(),
  created_by: z.string().uuid().nullable().optional(),
  // Kode penawaran spesial yang diklaim. Dibiarkan opsional supaya pemanggil lama
  // (hanya has_discount_item) tetap bekerja: RPC menerjemahkannya ke penawaran
  // bawaan booth. Kuota, stok, syarat akumulasi, dan harga divalidasi di RPC.
  offer_codes: z.array(z.string().trim().regex(/^[a-z0-9_]{2,40}$/)).max(10).optional(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["booth", "admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (auth.scope.role === "booth" && auth.scope.boothId !== parsed.data.booth_id) return apiError("FORBIDDEN", 403);
  const client = getSupabaseServiceClient();
  const [{ data: booth }, { data: participant }] = await Promise.all([
    client.from("booths").select("id").eq("event_id", auth.scope.event.id).eq("id", parsed.data.booth_id).maybeSingle(),
    client.from("participants").select("id").eq("event_id", auth.scope.event.id).eq("id", parsed.data.participant_id).maybeSingle(),
  ]);
  if (!booth) return apiError("BOOTH_NOT_FOUND", 404);
  if (!participant) return apiError("PARTICIPANT_NOT_FOUND", 404);
  const { data, error } = await client.rpc("create_order_transaction" as never, {
    p_code: parsed.data.order_code,
    p_participant_id: parsed.data.participant_id,
    p_booth_id: parsed.data.booth_id,
    p_has_discount_item: parsed.data.has_discount_item,
    p_regular_amount: parsed.data.regular_amount,
    p_note: parsed.data.note ?? null,
    p_created_by: auth.user.id,
    p_offer_codes: parsed.data.offer_codes ?? null,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "DISCOUNT_ALREADY_TAKEN" || code === "ORDER_CODE_USED" ? 409 : 422);
  }
  await client.from("audit_logs").insert({ event_id: auth.scope.event.id, order_id: (data as { id?: string } | null)?.id ?? null, user_id: auth.user.id, action: "booth_order_created", payload: { booth_id: parsed.data.booth_id, participant_id: parsed.data.participant_id, has_discount_item: parsed.data.has_discount_item, offer_codes: parsed.data.offer_codes ?? null } } as never);
  return Response.json({ order: data }, { status: 201 });
}
