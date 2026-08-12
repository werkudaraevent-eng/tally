import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireRequestEvent } from "@/lib/auth/request-event";

const querySchema = z.object({ qr: z.string().trim().min(1).max(200), boothId: z.coerce.number().int().positive() });

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["booth", "cashier", "admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  try {
    if (auth.scope.role === "booth" && auth.scope.boothId !== parsed.data.boothId) return apiError("FORBIDDEN", 403);
    const client = getSupabaseServiceClient();
    const { data: scopedBooth } = await client.from("booths").select("id").eq("event_id", auth.scope.event.id).eq("id", parsed.data.boothId).maybeSingle();
    if (!scopedBooth) return apiError("BOOTH_NOT_FOUND", 404);
    const { data: scopedParticipant } = await client.from("participants").select("id").eq("event_id", auth.scope.event.id).eq("qr_code", parsed.data.qr).maybeSingle();
    if (!scopedParticipant) return apiError("PARTICIPANT_NOT_FOUND", 404);
    const { data, error } = await client.rpc("get_participant_by_qr" as never, { p_qr_code: parsed.data.qr, p_booth_id: parsed.data.boothId, p_event_id: auth.scope.event.id } as never);
    if (error) return apiError(mapDatabaseError(error), error.message.includes("PARTICIPANT_NOT_FOUND") ? 404 : 422);

    // Daftar penawaran spesial yang berlaku, beserta alasan kalau belum memenuhi
    // syarat. Dihitung di server agar layar booth tidak menebak aturan.
    const participantId = (data as { participant?: { id?: string } } | null)?.participant?.id;
    let offers: unknown = { accumulated_amount: 0, offers: [] };
    if (participantId) {
      const { data: offerData } = await client.rpc("get_available_offers" as never, { p_participant_id: participantId, p_booth_id: parsed.data.boothId, p_event_id: auth.scope.event.id } as never);
      if (offerData) offers = offerData;
    }

    return Response.json({ ...(data as object), special_offers: offers });
  } catch (error) {
    return apiError("INTERNAL_ERROR", 500, process.env.NODE_ENV === "development" ? String(error) : undefined);
  }
}
