import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const parsed = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);
  const { data, error } = await getSupabaseServiceClient().rpc("get_leaderboard" as never, { p_limit: parsed.data.limit } as never);
  if (error) return apiError(mapDatabaseError(error), 500);
  const { data: settings } = await getSupabaseServiceClient().from("event_settings").select("leaderboard_enabled").eq("id", 1).single() as { data: { leaderboard_enabled: boolean } | null };
  return Response.json({ updated_at: new Date().toISOString(), leaderboard_enabled: settings?.leaderboard_enabled ?? true, entries: data ?? [] });
}
