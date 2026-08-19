import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Antrean moderasi word cloud.
 *
 * Penyaring kata di database hanya menangkap yang sudah terdaftar. Yang tidak
 * terdaftar — nama orang, sindiran, plesetan yang tidak pernah bisa diantisipasi
 * daftar mana pun — hanya dapat dihentikan mata manusia sebelum tampil di layar
 * besar di depan klien. Karena itu `vote_polls.moderation` menyala secara bawaan
 * dan kata baru masuk berstatus `pending`.
 */
const bodySchema = z.object({
  ballot_id: z.number().int().positive(),
  approve: z.boolean(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;

  const pollId = Number(new URL(request.url).searchParams.get("poll_id"));
  if (!Number.isInteger(pollId) || pollId <= 0) return apiError("VALIDATION_ERROR", 422);

  const { data, error } = await getSupabaseServiceClient()
    .from("vote_ballots")
    .select("id,text_value,display_name,created_at")
    .eq("event_id", auth.scope.event.id)
    .eq("poll_id", pollId)
    .eq("text_status", "pending")
    .order("created_at", { ascending: true })
    // Dibatasi 100: antrean yang lebih panjang dari itu tidak akan sempat
    // dibaca satu per satu di tengah acara, dan operator lebih baik mematikan
    // moderasi atau menutup voting daripada menggulir daftar tanpa ujung.
    .limit(100);
  if (error) return apiError("INTERNAL_ERROR", 500);

  return Response.json({ pending: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const { error } = await getSupabaseServiceClient().rpc("moderate_vote_word" as never, {
    p_event_id: auth.scope.event.id,
    p_ballot_id: body.data.ballot_id,
    p_approve: body.data.approve,
    p_actor: auth.user.id,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 404);
  }
  return Response.json({ ok: true });
}
