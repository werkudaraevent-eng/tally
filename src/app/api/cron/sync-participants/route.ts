import { apiError, mapDatabaseError } from "@/lib/api";
import { fetchExternalParticipants } from "@/lib/external/scanner-api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

function verifyCronSecret(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET;
  const suppliedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configuredSecret || !suppliedSecret || suppliedSecret.length !== configuredSecret.length) return false;
  let matches = true;
  for (let index = 0; index < configuredSecret.length; index += 1) matches = matches && suppliedSecret.charCodeAt(index) === configuredSecret.charCodeAt(index);
  return matches;
}

/**
 * Sinkronisasi peserta untuk SETIAP event yang memang menariknya dari Scanner API.
 *
 * Dipanggil penjadwal tanpa konteks event, jadi ia TIDAK boleh memakai
 * `resolve_event_id` (yang melempar saat lebih dari satu event aktif) dan tidak
 * boleh memilih satu event saja. Pola yang sama dengan
 * `auto_void_expired_orders`: satu putaran per event, masing-masing memakai slug
 * Scanner API miliknya sendiri.
 *
 * Kegagalan satu event TIDAK menghentikan yang lain. Kalau satu slug salah ketik
 * atau API-nya menolak, event lain tetap tersinkron dan hasilnya dilaporkan per
 * event — sebelumnya satu kesalahan menghentikan seluruh sinkronisasi.
 */
async function runSync(request: Request) {
  if (!verifyCronSecret(request)) return apiError("FORBIDDEN", 403);

  const client = getSupabaseServiceClient();
  const { data: events, error: eventError } = await client
    .from("events")
    .select("id,slug,scanner_api_event_slug")
    .in("participant_source", ["scanner_api", "hybrid"])
    .in("status", ["active", "draft"])
    .not("scanner_api_event_slug", "is", null);
  if (eventError) return apiError("INTERNAL_ERROR", 500);

  const targets = (events ?? []) as Array<{ id: string; slug: string; scanner_api_event_slug: string }>;
  const results: Array<Record<string, unknown>> = [];

  for (const target of targets) {
    try {
      const external = await fetchExternalParticipants(target.scanner_api_event_slug);
      const { data, error } = await client.rpc("upsert_external_participants" as never, { p_event_id: target.id, p_participants: external.participants } as never);
      if (error) {
        results.push({ event: target.slug, ok: false, error: mapDatabaseError(error) });
        continue;
      }
      // `synced` juga membawa newly_removed / restored / total_removed dari RPC,
      // supaya penandaan peserta yang hilang di sumber ikut terekam di log.
      await client.from("audit_logs").insert({ event_id: target.id, user_id: null, action: "participant_sync", payload: { source: "cron", scanner_slug: target.scanner_api_event_slug, fetched: external.participants.length, total: external.total, synced: data } } as never);
      results.push({ event: target.slug, ok: true, source_total: external.total, fetched: external.participants.length, synced: data ?? external.participants.length });
    } catch (error) {
      results.push({ event: target.slug, ok: false, error: process.env.NODE_ENV === "development" ? String(error) : "FETCH_FAILED" });
    }
  }

  return Response.json({ events: targets.length, results, synced_at: new Date().toISOString() });
}

export async function GET(request: Request) {
  return runSync(request);
}

export async function POST(request: Request) {
  return runSync(request);
}
