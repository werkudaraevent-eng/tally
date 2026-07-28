import { z } from "zod";
import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/guards";

const patchSchema = z.object({
  pickup_mode: z.enum(["after_payment", "immediate"]).optional(),
  name_display_mode: z.enum(["full", "initials", "company_only", "hidden"]).optional(),
  leaderboard_enabled: z.boolean().optional(),
  pending_auto_void_minutes: z.number().int().min(5).max(1440).optional(),
});

export async function GET() {
  const auth = await requireUser(["booth", "cashier", "admin"]);
  if (auth.response) return auth.response;
  const { data, error } = await getSupabaseServiceClient().from("event_settings").select("pickup_mode,name_display_mode,leaderboard_enabled,pending_auto_void_minutes,updated_at").eq("id", 1).single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422, parsed.success ? undefined : parsed.error.flatten());
  const client = getSupabaseServiceClient();
  const { data: current, error: currentError } = await client.from("event_settings").select("*").eq("id", 1).single();
  if (currentError) return apiError("INTERNAL_ERROR", 500);
  const { data, error } = await client.from("event_settings").update({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never).eq("id", 1).select("pickup_mode,name_display_mode,leaderboard_enabled,pending_auto_void_minutes,updated_at").single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "settings_update", payload: { old: current, new: data } } as never);
  return Response.json(data);
}
