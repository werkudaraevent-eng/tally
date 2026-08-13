import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { redactAmounts, type LeaderboardEntry } from "@/lib/reveal";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getPublicRequestEvent } from "@/lib/auth/request-event";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) });

// Endpoint PUBLIK, sama seperti /api/display/leaderboard: nominal wajib melewati
// `redactAmounts`. Lihat catatan lengkap di fungsi itu (src/lib/reveal.ts).
export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  try {
    const client = getSupabaseServiceClient();
    const event = await getPublicRequestEvent(request);
    if (!event) return apiError("INTERNAL_ERROR", 404);
    // p_event_id dikirim EKSPLISIT. Tanpa itu RPC jatuh ke resolve_event_id, dan
    // saat dua event aktif ia menolak menebak -- endpoint publik ini akan mati
    // justru pada kondisi yang seharusnya didukung.
    const { data, error } = await client.rpc("get_leaderboard" as never, { p_limit: parsed.data.limit, p_event_id: event.id } as never);
    if (error) return apiError(mapDatabaseError(error), 500);
    const [{ data: settings }, { data: display }] = await Promise.all([
      client.from("event_settings").select("leaderboard_enabled").eq("event_id", event.id).single() as unknown as Promise<{ data: { leaderboard_enabled: boolean } | null }>,
      client.from("display_settings").select("show_amount").eq("event_id", event.id).maybeSingle() as unknown as Promise<{ data: { show_amount: boolean } | null }>,
    ]);
    return Response.json({
      updated_at: new Date().toISOString(),
      leaderboard_enabled: settings?.leaderboard_enabled ?? true,
      entries: redactAmounts((data ?? []) as LeaderboardEntry[], display?.show_amount !== false),
    });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
