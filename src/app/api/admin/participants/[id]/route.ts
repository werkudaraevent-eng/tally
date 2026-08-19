import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { participantBodySchema, toRpcArgs } from "@/lib/participant-input";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const paramsSchema = z.string().uuid();

/**
 * Sunting satu peserta.
 *
 * Penjaga "baris dari Scanner API tidak boleh diubah" TIDAK ditegakkan di sini,
 * melainkan di dalam `save_participant`. Diperiksa di route, ia hanya berlaku
 * untuk jalur ini; di dalam fungsi, impor massal dan jalur mana pun kelak ikut
 * terjaga oleh aturan yang sama. Route hanya menerjemahkan galatnya jadi pesan.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  const body = participantBodySchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) return apiError("VALIDATION_ERROR", 422, body.success ? undefined : body.error.flatten());

  const { data, error } = await getSupabaseServiceClient().rpc("save_participant" as never, {
    p_event_id: auth.scope.event.id,
    p_id: id.data,
    ...toRpcArgs(body.data),
    p_actor: auth.user.id,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : code === "PARTICIPANT_NOT_FOUND" ? 404 : 422);
  }
  return Response.json({ participant: data });
}

/**
 * Hapus peserta manual.
 *
 * Tanpa dialog ketik-ulang seperti penghapusan event: yang hilang adalah satu
 * baris tanpa transaksi (penjaga di RPC menolak selebihnya), dan panitia dapat
 * mengetiknya kembali dalam sepuluh detik. Konfirmasi berlapis untuk tindakan
 * yang murah dipulihkan hanya melatih orang menekan "ya" tanpa membaca.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", 422);

  const { data, error } = await getSupabaseServiceClient().rpc("delete_participant" as never, {
    p_event_id: auth.scope.event.id,
    p_id: id.data,
    p_actor: auth.user.id,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : code === "PARTICIPANT_NOT_FOUND" ? 404 : 422);
  }
  return Response.json(data);
}
