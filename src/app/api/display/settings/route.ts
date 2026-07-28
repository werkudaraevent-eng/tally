import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const SELECT = "event_title,headline,tagline,background_color,text_color,accent_color,background_image_url,leaderboard_limit,show_company,show_booth_progress,show_ticker,ticker_text,refresh_seconds,updated_at";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex #RRGGBB");
const patchSchema = z.object({
  event_title: z.string().trim().min(1).max(120).optional(),
  headline: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().trim().min(1).max(160).optional(),
  background_color: hex.optional(),
  text_color: hex.optional(),
  accent_color: hex.optional(),
  background_image_url: z.string().trim().url().max(600).nullable().optional(),
  leaderboard_limit: z.number().int().min(3).max(50).optional(),
  show_company: z.boolean().optional(),
  show_booth_progress: z.boolean().optional(),
  show_ticker: z.boolean().optional(),
  ticker_text: z.string().trim().max(300).nullable().optional(),
  refresh_seconds: z.number().int().min(5).max(300).optional(),
});

// Public read: the Live Display runs without a logged-in operator.
export async function GET() {
  const { data, error } = await getSupabaseServiceClient().from("display_settings").select(SELECT).eq("id", 1).single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422, parsed.success ? undefined : parsed.error.flatten());
  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("display_settings").select("*").eq("id", 1).single();
  const { data, error } = await client.from("display_settings").update({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never).eq("id", 1).select(SELECT).single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "display_settings_update", payload: { old: current, new: data } } as never);
  return Response.json(data);
}
