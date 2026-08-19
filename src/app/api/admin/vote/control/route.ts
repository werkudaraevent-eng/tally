import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Kontrol operator: apa yang tayang, kapan dibuka, kapan hasilnya diperlihatkan.
 *
 * Satu endpoint beraksi, bukan beberapa endpoint PATCH terpisah. Alasannya sama
 * dengan `/api/undian/control`: operator menjalankan ini sambil berdiri di
 * samping MC, dan urutan aksinya perlu terbaca sebagai satu daftar di satu
 * tempat -- bukan tersebar di beberapa alamat yang masing-masing tahu sepotong.
 */
const bodySchema = z.object({
  action: z.enum(["show", "hide", "open", "close", "reveal_results", "hide_results", "recount"]),
  poll_id: z.number().int().positive().nullish(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const client = getSupabaseServiceClient();
  const eventId = auth.scope.event.id;
  const { action } = body.data;

  // Aksi selain `hide` selalu menyangkut satu pertanyaan tertentu.
  let poll: { id: number; question: string; status: string } | null = null;
  if (action !== "hide") {
    if (!body.data.poll_id) return apiError("VALIDATION_ERROR", 422, { message: "Pertanyaan belum dipilih." });
    const { data } = await client
      .from("vote_polls").select("id,question,status")
      .eq("id", body.data.poll_id).eq("event_id", eventId).maybeSingle();
    if (!data) return apiError("VOTE_POLL_NOT_FOUND", 404);
    poll = data as { id: number; question: string; status: string };
  }

  if (action === "show" || action === "hide") {
    // Baris state dibuat saat dibutuhkan, bukan disiapkan lewat trigger pada
    // pembuatan event: event yang tidak pernah memakai voting tidak perlu punya
    // barisnya, dan upsert di sini menangani keduanya dalam satu permintaan.
    const { error } = await client.from("vote_state").upsert({
      event_id: eventId,
      active_poll_id: action === "show" ? poll!.id : null,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    } as never, { onConflict: "event_id" });
    if (error) return apiError("INTERNAL_ERROR", 500);
  } else if (action === "recount") {
    const { error } = await client.rpc("recount_vote_poll" as never, {
      p_event_id: eventId, p_poll_id: poll!.id,
    } as never);
    if (error) return apiError(mapDatabaseError(error), 500);
  } else {
    const patch = action === "open" ? { status: "open" }
      : action === "close" ? { status: "closed" }
      : action === "reveal_results" ? { results_visible: true }
      : { results_visible: false };
    const { error } = await client
      .from("vote_polls")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", poll!.id).eq("event_id", eventId);
    if (error) return apiError("INTERNAL_ERROR", 500);
  }

  await client.from("audit_logs").insert({
    event_id: eventId, user_id: auth.user.id, action: `vote_${action}`,
    payload: { poll_id: poll?.id ?? null, question: poll?.question ?? null },
  } as never);

  return Response.json({ ok: true });
}
