import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const paramsSchema = z.coerce.number().int().positive();

/**
 * Kosongkan seluruh suara satu pertanyaan.
 *
 * Endpoint terpisah, bukan satu aksi lagi di `/api/admin/vote/control`. Isi
 * endpoint kontrol adalah aksi yang dijalankan berulang kali sepanjang acara —
 * tayangkan, buka, tutup, perlihatkan — dan semuanya dapat dibatalkan dengan
 * menekan lawannya. Reset tidak: ia membuang data dan tidak punya kebalikan.
 * Menaruhnya di daftar yang sama membuatnya terlihat sederajat dengan tombol
 * yang aman ditekan dua kali.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", 422);

  const { data, error } = await getSupabaseServiceClient().rpc("reset_vote_poll" as never, {
    p_event_id: auth.scope.event.id,
    p_poll_id: id.data,
    p_actor: auth.user.id,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : code === "VOTE_POLL_NOT_FOUND" ? 404 : 422);
  }
  return Response.json(data);
}
