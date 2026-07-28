import { requireUser } from "@/lib/auth/guards";
import { apiError, mapDatabaseError } from "@/lib/api";
import { fetchExternalParticipants } from "@/lib/external/scanner-api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  try {
    const external = await fetchExternalParticipants();
    const { data, error } = await getSupabaseServiceClient().rpc("upsert_external_participants" as never, { p_participants: external.participants } as never);
    if (error) return apiError(mapDatabaseError(error), 500);
    await getSupabaseServiceClient().from("audit_logs").insert({ user_id: auth.user.id, action: "participant_sync", payload: { source: "scanner_api", fetched: external.participants.length, total: external.total, synced: data } } as never);
    return Response.json({ source_total: external.total, fetched: external.participants.length, synced: data ?? external.participants.length, synced_at: new Date().toISOString() });
  } catch (error) {
    return apiError("INTERNAL_ERROR", 502, process.env.NODE_ENV === "development" ? String(error) : undefined);
  }
}
