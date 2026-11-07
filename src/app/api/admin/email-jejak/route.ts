import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Sakelar Email tracking acara ini (Messages > Automated emails), terpisah
 * dari /api/settings supaya halaman Settings tidak bergantung pada kolom
 * baru: sebelum migrasi 202611070030 kolomnya belum ada, dan GET menjawab
 * siap: false. Milik panitia (tidak tercantum di izin-modul).
 */

const schema = z.object({ email_tracking: z.boolean() });

const belumAda = (galat: { code?: string } | null) => galat?.code === "42703" || galat?.code === "PGRST204" || galat?.code === "42P01" || galat?.code === "PGRST205";

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const { data, error } = await getSupabaseServiceClient().from("event_settings").select("email_tracking").eq("event_id", auth.scope.event.id).maybeSingle();
  if (belumAda(error)) return Response.json({ siap: false, email_tracking: false });
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ siap: true, email_tracking: (data as { email_tracking?: boolean } | null)?.email_tracking === true });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const client = getSupabaseServiceClient();
  // Tanpa .select() pada PATCH: PostgREST lama menjawab [] di sana. Dibaca ulang.
  const { error } = await client
    .from("event_settings")
    .update({ email_tracking: parsed.data.email_tracking, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
    .eq("event_id", auth.scope.event.id);
  if (belumAda(error)) return apiError("TRACKING_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  const { data, error: galatBaca } = await client.from("event_settings").select("email_tracking").eq("event_id", auth.scope.event.id).maybeSingle();
  if (galatBaca || !data) return apiError("INTERNAL_ERROR", 500);
  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "email_tracking",
    payload: { email_tracking: parsed.data.email_tracking },
  } as never);
  return Response.json({ siap: true, email_tracking: (data as { email_tracking: boolean }).email_tracking });
}
