import { requireRequestEvent } from "@/lib/auth/request-event";
import { apiError, mapDatabaseError } from "@/lib/api";
import { ScannerNotConfiguredError, fetchExternalParticipants } from "@/lib/external/scanner-api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const { event } = auth.scope;

  // Event bersumber manual/form tidak punya apa pun untuk ditarik. Ditolak di
  // sini supaya pesannya bisa ditindaklanjuti, bukan galat konfigurasi env.
  if (!event.scanner_api_event_slug) {
    return apiError("VALIDATION_ERROR", 422, {
      message: "Event ini tidak memakai Scanner API. Atur slug-nya di konfigurasi event lebih dulu.",
    });
  }

  // Kredensial dibaca ulang dari baris event, bukan dari `auth.scope.event`:
  // cakupan event di-cache untuk permintaan ini dan kolom kuncinya sengaja
  // tidak ikut di-select ke sana supaya tidak pernah tersangkut di respons lain.
  const client = getSupabaseServiceClient();
  const { data: credentials } = await client
    .from("events")
    .select("scanner_api_base_url,scanner_api_key,scanner_api_event_slug")
    .eq("id", event.id)
    .maybeSingle();

  try {
    const external = await fetchExternalParticipants(
      (credentials ?? { scanner_api_event_slug: event.scanner_api_event_slug }) as {
        scanner_api_base_url?: string | null;
        scanner_api_key?: string | null;
        scanner_api_event_slug?: string | null;
      },
    );
    const { data, error } = await client.rpc("upsert_external_participants" as never, { p_event_id: event.id, p_participants: external.participants } as never);
    if (error) return apiError(mapDatabaseError(error), 500);
    await client.from("audit_logs").insert({ event_id: event.id, user_id: auth.user.id, action: "participant_sync", payload: { source: "scanner_api", scanner_slug: event.scanner_api_event_slug, fetched: external.participants.length, total: external.total, synced: data } } as never);
    return Response.json({ source_total: external.total, fetched: external.participants.length, synced: data ?? external.participants.length, synced_at: new Date().toISOString() });
  } catch (error) {
    // Dipisah dari 502: setelan yang belum lengkap bukan kegagalan jaringan, dan
    // "coba lagi" tidak akan pernah menyelesaikannya.
    if (error instanceof ScannerNotConfiguredError) return apiError("SCANNER_NOT_CONFIGURED", 422);
    return apiError("INTERNAL_ERROR", 502, process.env.NODE_ENV === "development" ? String(error) : undefined);
  }
}
