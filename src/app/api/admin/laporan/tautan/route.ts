import { randomBytes } from "node:crypto";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { muatLaporan, simpanConfig } from "@/lib/laporan/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Link highlight tanpa login (Admin > Event report > Daily highlights).
 * Body `{ aksi: "buat" | "matikan", updated_at }` (compare-and-swap).
 * "buat" selalu membuat token baru, jadi link lama ikut mati. Token 18 byte
 * acak (base64url), disimpan di event_reports.config.tautan.
 */
export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const body = (await request.json().catch(() => null)) as { aksi?: unknown; updated_at?: unknown } | null;
  if (!body || (body.aksi !== "buat" && body.aksi !== "matikan") || !(body.updated_at === null || typeof body.updated_at === "string")) return apiError("VALIDATION_ERROR", 422);
  const laporan = await muatLaporan(event.id).catch(() => null);
  if (!laporan) return apiError("INTERNAL_ERROR", 500);
  if (!laporan.siap) return Response.json({ siap: false });
  const tautan = body.aksi === "buat" ? { token: randomBytes(18).toString("base64url"), dibuat: new Date().toISOString() } : null;
  const hasil = await simpanConfig(event.id, { ...laporan.config, tautan }, body.updated_at, auth.user.id);
  if (!hasil.ok) {
    if (hasil.alasan === "belum_siap") return Response.json({ siap: false });
    if (hasil.alasan === "basi") return apiError("CONFLICT", 409);
    return apiError("INTERNAL_ERROR", 500);
  }
  await getSupabaseServiceClient()
    .from("audit_logs")
    .insert({ event_id: event.id, user_id: auth.user.id, action: tautan ? "event_report_link_on" : "event_report_link_off", payload: {} } as never);
  return Response.json({ ok: true, updated_at: hasil.updated_at, tautan });
}
