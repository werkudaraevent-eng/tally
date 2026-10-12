import { apiError } from "@/lib/api";
import { hitungKehadiran } from "@/lib/attendance-progress";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Angka hadir seluruh meja, dibaca ulang layar pemindai tiap 30 detik.
 *
 * Terpisah dari /api/attendance/sessions karena dipanggil berulang: yang itu
 * ikut memuat setelan label, stasiun cetak, dan jalur, yang tidak berubah di
 * tengah antrean. Isinya hanya angka (lihat lib/attendance-progress.ts).
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  // Hanya sesi yang sedang dibuka, sama dengan daftar sesi layar pemindai.
  const { data: sesi, error } = await getSupabaseServiceClient()
    .from("attendance_sessions")
    .select("id")
    .eq("event_id", auth.scope.event.id)
    .eq("is_active", true);
  if (error) return apiError("INTERNAL_ERROR", 500);

  try {
    const angka = await hitungKehadiran(auth.scope.event.id, ((sesi ?? []) as Array<{ id: number }>).map((baris) => baris.id));
    return Response.json(angka, { headers: { "cache-control": "no-store" } });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
