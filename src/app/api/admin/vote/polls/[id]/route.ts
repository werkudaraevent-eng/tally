import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { pollBodySchema } from "@/lib/vote";

const paramsSchema = z.coerce.number().int().positive();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  const body = pollBodySchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) return apiError("VALIDATION_ERROR", 422, body.success ? undefined : body.error.flatten());

  const { data, error } = await getSupabaseServiceClient().rpc("save_vote_poll" as never, {
    p_event_id: auth.scope.event.id,
    p_id: id.data,
    p_question: body.data.question,
    p_description: body.data.description ?? null,
    p_type: body.data.type,
    p_voter_mode: body.data.voter_mode,
    p_max_choices: body.data.max_choices,
    // `id` diteruskan apa adanya: opsi ber-id diperbarui, opsi tanpa id
    // disisipkan, dan opsi yang hilang dari daftar ini dihapus — seluruhnya
    // dijaga di dalam RPC terhadap suara yang sudah masuk.
    p_options: body.data.options.map((option) => ({ id: option.id ?? null, label: option.label, image_url: option.image_url ?? null })),
    p_actor: auth.user.id,
    p_rating_max: body.data.rating_max,
    p_rating_min_label: body.data.rating_min_label ?? null,
    p_rating_max_label: body.data.rating_max_label ?? null,
    p_moderation: body.data.moderation,
    p_max_words: body.data.max_words,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : code === "VOTE_POLL_NOT_FOUND" ? 404 : 422);
  }
  return Response.json(data);
}

/**
 * Hapus pertanyaan beserta seluruh suaranya.
 *
 * Tanpa penjaga "sudah ada suara": menghapus pertanyaan adalah tindakan sadar
 * yang memang berarti membuang hasilnya, berbeda dari mengubah opsi di tengah
 * voting yang diam-diam mengubah arti angka. Dialog konfirmasi di CMS yang
 * menyebutkan jumlah suara yang ikut hilang.
 *
 * CASCADE pada FK komposit membawa serta opsi, suara, dan pilihan.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const eventId = auth.scope.event.id;

  const { data: poll } = await client
    .from("vote_polls").select("question").eq("id", id.data).eq("event_id", eventId).maybeSingle();
  if (!poll) return apiError("VOTE_POLL_NOT_FOUND", 404);

  const { error } = await client.from("vote_polls").delete().eq("id", id.data).eq("event_id", eventId);
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: eventId, user_id: auth.user.id, action: "vote_poll_deleted",
    payload: { poll_id: id.data, question: (poll as { question: string }).question },
  } as never);

  return Response.json({ ok: true });
}
