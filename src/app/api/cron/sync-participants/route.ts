import { apiError, mapDatabaseError } from "@/lib/api";
import { fetchExternalParticipants } from "@/lib/external/scanner-api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

function verifyCronSecret(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET;
  const suppliedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configuredSecret || !suppliedSecret || suppliedSecret.length !== configuredSecret.length) return false;
  let matches = true;
  for (let index = 0; index < configuredSecret.length; index += 1) matches = matches && suppliedSecret.charCodeAt(index) === configuredSecret.charCodeAt(index);
  return matches;
}

async function runSync(request: Request) {
  if (!verifyCronSecret(request)) return apiError("FORBIDDEN", 403);
  try {
    const external = await fetchExternalParticipants();
    const client = getSupabaseServiceClient();
    const { data, error } = await client.rpc("upsert_external_participants" as never, { p_participants: external.participants } as never);
    if (error) return apiError(mapDatabaseError(error), 500);
    await client.from("audit_logs").insert({ user_id: null, action: "participant_sync", payload: { source: "cron", fetched: external.participants.length, total: external.total, synced: data } } as never);
    return Response.json({ source_total: external.total, fetched: external.participants.length, synced: data ?? external.participants.length, synced_at: new Date().toISOString() });
  } catch (error) {
    return apiError("INTERNAL_ERROR", 502, process.env.NODE_ENV === "development" ? String(error) : undefined);
  }
}

export async function GET(request: Request) {
  return runSync(request);
}

export async function POST(request: Request) {
  return runSync(request);
}
