import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const querySchema = z.object({
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  let query = getSupabaseServiceClient()
    .from("participants")
    .select("id,qr_code,name,company,title,participant_type,rsvp_status,source_checked_in,source_total_scans,source_synced_at", { count: "exact" })
    .order("name", { ascending: true })
    .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);
  if (parsed.data.q) query = query.or(`name.ilike.%${parsed.data.q}%,qr_code.ilike.%${parsed.data.q}%,company.ilike.%${parsed.data.q}%`);

  const result = await query;
  if (result.error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({
    total: result.count ?? 0,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    participants: result.data ?? [],
  });
}
