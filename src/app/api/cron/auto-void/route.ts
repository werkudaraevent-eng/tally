import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const suppliedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configuredSecret || !suppliedSecret || suppliedSecret.length !== configuredSecret.length) return apiError("FORBIDDEN", 403);
  let matches = true;
  for (let index = 0; index < configuredSecret.length; index += 1) matches = matches && suppliedSecret.charCodeAt(index) === configuredSecret.charCodeAt(index);
  if (!matches) return apiError("FORBIDDEN", 403);
  const { data, error } = await getSupabaseServiceClient().rpc("auto_void_expired_orders" as never);
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ voided_count: data ?? 0 });
}
