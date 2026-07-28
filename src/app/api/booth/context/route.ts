import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const auth = await requireUser(["booth", "admin"]);
  if (auth.response) return auth.response;

  const client = getSupabaseServiceClient();

  // Booth operator: resolve their assigned booth. Admin: pick the first active booth as a working default.
  let boothId = auth.user.booth_id;
  if (!boothId) {
    const { data: firstBooth } = await client.from("booths").select("id").eq("is_active", true).order("id", { ascending: true }).limit(1).maybeSingle() as { data: { id: number } | null };
    boothId = firstBooth?.id ?? null;
  }
  if (!boothId) return apiError("BOOTH_NOT_FOUND", 404);

  const { data: booth, error } = await client.from("booths").select("id,code,name,discount_item_name,discount_item_stock,is_active").eq("id", boothId).single() as { data: { id: number; code: string; name: string; discount_item_name: string; discount_item_stock: number | null; is_active: boolean } | null; error: unknown };
  if (error || !booth) return apiError("BOOTH_NOT_FOUND", 404);

  // Suggest the next sticker number by continuing from the highest used code at this booth.
  const { data: codes } = await client.from("orders").select("code").eq("booth_id", boothId) as { data: Array<{ code: string }> | null };
  const prefix = `${booth.code}-`;
  const highest = (codes ?? []).reduce((max, row) => {
    if (!row.code.startsWith(prefix)) return max;
    const value = Number.parseInt(row.code.slice(prefix.length), 10);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
  const nextSticker = String(highest + 1).padStart(3, "0");

  return Response.json({
    booth,
    operator: { username: auth.user.username, role: auth.user.role },
    next_sticker: nextSticker,
  });
}
