import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

export async function GET(request: Request) {
  const auth = await requireUser(["booth", "admin"]);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const query = getSupabaseServiceClient()
    .from("audit_logs")
    .select("id,order_id,created_at,payload")
    .eq("action", "booth_order_created")
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);
  const { data, error } = await query;
  if (error) return apiError("INTERNAL_ERROR", 500);
  const rows = (data ?? []) as Array<{ id: number; created_at: string; order_id: string | null; payload: { participant_id?: string; booth_id?: number } | null }>;
  const filtered = auth.user.role === "booth" ? rows.filter((row) => row.payload?.booth_id === auth.user.booth_id) : rows;
  const participantIds = filtered.map((row) => row.payload?.participant_id).filter((id): id is string => Boolean(id));
  const { data: participants } = participantIds.length ? await getSupabaseServiceClient().from("participants").select("id,name,company").in("id", participantIds) : { data: [] as Array<{ id: string; name: string; company: string | null }> };
  const participantMap = new Map((participants ?? []).map((participant) => [participant.id, participant]));
  return Response.json({ scans: filtered.map((row) => ({ id: row.id, created_at: row.created_at, order_id: row.order_id, participant: participantMap.get(row.payload?.participant_id ?? "") ?? null })) });
}
