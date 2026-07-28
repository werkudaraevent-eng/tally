import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const querySchema = z.object({
  q: z.string().trim().min(1).max(100),
  boothId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export async function GET(request: Request) {
  const auth = await requireUser(["booth", "admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (auth.user.role === "booth" && auth.user.booth_id !== parsed.data.boothId) return apiError("FORBIDDEN", 403);

    const pattern = `%${parsed.data.q.replace(/[%_,]/g, " ")}%`;
  const { data, error } = await getSupabaseServiceClient()
    .from("participants")
    .select("id,qr_code,name,company,title")
    .or(`name.ilike.${pattern},company.ilike.${pattern}`)
    .order("name", { ascending: true })
    .limit(parsed.data.limit);
  if (error) return apiError("INTERNAL_ERROR", 500);
  const participants = (data ?? []) as Array<{ id: string; qr_code: string; name: string; company: string | null; title: string | null }>;
  const participantIds = participants.map((participant) => participant.id);

  const { data: boothRow } = await getSupabaseServiceClient().from("booths").select("discount_enabled,discount_limit_per_participant,discount_item_stock").eq("id", parsed.data.boothId).single() as { data: { discount_enabled: boolean; discount_limit_per_participant: number; discount_item_stock: number | null } | null };
  const boothOffersDiscount = Boolean(boothRow?.discount_enabled) && (boothRow?.discount_limit_per_participant ?? 0) > 0 && (boothRow?.discount_item_stock === null || (boothRow?.discount_item_stock ?? 0) > 0);
  const limit = boothRow?.discount_limit_per_participant ?? 0;

  const { data: claims } = participantIds.length ? await getSupabaseServiceClient().from("orders").select("participant_id").in("participant_id", participantIds).eq("booth_id", parsed.data.boothId).eq("has_discount_item", true).neq("status", "void") : { data: [] as Array<{ participant_id: string }> };
  const claimCount = new Map<string, number>();
  for (const claim of claims ?? []) claimCount.set(claim.participant_id, (claimCount.get(claim.participant_id) ?? 0) + 1);
  return Response.json({ participants: participants.map((participant) => ({ ...participant, discount_available: boothOffersDiscount && (claimCount.get(participant.id) ?? 0) < limit })) });
}
