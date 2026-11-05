import { apiError } from "@/lib/api";
import { hitungKehadiran } from "@/lib/attendance-progress";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { muatSasaranSesi, sasaranUntukPemindai } from "@/lib/pantau-checkin-server";
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
    // `sasaran`: sesi yang dipakai checkpoint bertautan baris Agenda dengan Who
    // sees it (lib/pantau-checkin.ts sasaranSesi). Layar pemindai menghitung
    // dari yang diharapkan di sana, sama dengan halaman Kehadiran panitia.
    // Gagal membacanya tidak menggagalkan angka biasa.
    const [angka, sasaran] = await Promise.all([
      hitungKehadiran(auth.scope.event.id, ((sesi ?? []) as Array<{ id: number }>).map((baris) => baris.id)),
      muatSasaranSesi(auth.scope.event).catch(() => null),
    ]);
    return Response.json({ ...angka, sasaran: sasaran ? sasaranUntukPemindai(sasaran.sasaran) : null }, { headers: { "cache-control": "no-store" } });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
