import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { muatPantauCheckin } from "@/lib/pantau-checkin-server";

/**
 * Check-in per checkpoint untuk Dashboard: hadir dari yang diharapkan, per
 * titik (lihat src/lib/pantau-checkin.ts). Admin saja; hanya membaca, jadi
 * tetap jalan di acara Completed atau Archived. Dashboard memanggilnya tiap
 * 30 detik selama tab terlihat.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const rows = await muatPantauCheckin(auth.scope.event);
  if (!rows) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ rows, time_zone: auth.scope.event.time_zone, updated_at: new Date().toISOString() });
}
