import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { hitungLaporan, muatLaporan, simpanBagikan } from "@/lib/laporan/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Share with client. Body `{ aksi: "bagikan" | "tarik", updated_at }`.
 * "bagikan" mengunci deck saat ini: angka di tampilan klien tidak bergerak
 * sampai panitia membagikan ulang. "tarik" menghapus snapshot dari klien.
 */
export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const body = (await request.json().catch(() => null)) as { aksi?: unknown; updated_at?: unknown } | null;
  if (!body || (body.aksi !== "bagikan" && body.aksi !== "tarik") || !(body.updated_at === null || typeof body.updated_at === "string")) return apiError("VALIDATION_ERROR", 422);

  const laporan = await muatLaporan(event.id).catch(() => null);
  if (!laporan) return apiError("INTERNAL_ERROR", 500);
  if (!laporan.siap) return Response.json({ siap: false });
  let deck = null;
  if (body.aksi === "bagikan") {
    const susun = await hitungLaporan(event, laporan.config).catch(() => null);
    if (!susun) return apiError("INTERNAL_ERROR", 500);
    deck = susun.deck;
  }
  const hasil = await simpanBagikan(event.id, deck, body.updated_at, auth.user.id);
  if (!hasil.ok) {
    if (hasil.alasan === "belum_siap") return Response.json({ siap: false });
    if (hasil.alasan === "basi") return apiError("CONFLICT", 409);
    return apiError("INTERNAL_ERROR", 500);
  }
  await getSupabaseServiceClient()
    .from("audit_logs")
    .insert({ event_id: event.id, user_id: auth.user.id, action: body.aksi === "bagikan" ? "event_report_share" : "event_report_unshare", payload: {} } as never);
  return Response.json({ ok: true, updated_at: hasil.updated_at, shared_at: deck ? hasil.updated_at : null });
}
