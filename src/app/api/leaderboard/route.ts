import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  try {
     const { data, error } = await getSupabaseServiceClient().rpc("get_leaderboard" as never, { p_limit: parsed.data.limit } as never);
    const { data: settings } = await getSupabaseServiceClient().from("event_settings").select("leaderboard_enabled").eq("id", 1).single() as { data: { leaderboard_enabled: boolean } | null };
    if (error) return apiError(mapDatabaseError(error), 500);
     return Response.json({ updated_at: new Date().toISOString(), leaderboard_enabled: settings?.leaderboard_enabled ?? true, entries: data ?? [] });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
