import { requireRequestEvent } from "@/lib/auth/request-event";
import { apiError, mapDatabaseError } from "@/lib/api";
import { fetchExternalParticipants } from "@/lib/external/scanner-api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const { event } = auth.scope;

  // Event bersumber manual/form tidak punya apa pun untuk ditarik. Ditolak di
  // sini supaya pesannya bisa ditindaklanjuti, bukan galat konfigurasi env.
  if (!event.scanner_api_event_slug) {
    return apiError("VALIDATION_ERROR", 422, {
      message: "Event ini tidak memakai Scanner API. Atur slug-nya di konfigurasi event lebih dulu.",
    });
  }

  try {
    // Slug diambil dari EVENT, bukan env var: satu deploy melayani banyak event
    // dan satu env var tidak bisa menunjuk lebih dari satu slug.
    const external = await fetchExternalParticipants(event.scanner_api_event_slug);
    const client = getSupabaseServiceClient();
    const { data, error } = await client.rpc("upsert_external_participants" as never, { p_event_id: event.id, p_participants: external.participants } as never);
    if (error) return apiError(mapDatabaseError(error), 500);
    await client.from("audit_logs").insert({ event_id: event.id, user_id: auth.user.id, action: "participant_sync", payload: { source: "scanner_api", scanner_slug: event.scanner_api_event_slug, fetched: external.participants.length, total: external.total, synced: data } } as never);
    return Response.json({ source_total: external.total, fetched: external.participants.length, synced: data ?? external.participants.length, synced_at: new Date().toISOString() });
  } catch (error) {
    return apiError("INTERNAL_ERROR", 502, process.env.NODE_ENV === "development" ? String(error) : undefined);
  }
}
