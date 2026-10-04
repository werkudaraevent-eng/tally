import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { daftarStasiun, setelanMeja } from "@/lib/badge/stasiun-server";

/**
 * Stasiun cetak acara ini, untuk pemilih "Print station" di HP pemindai.
 *
 * Ditarik HP setiap beberapa detik selama panel printer meja terbuka, jadi
 * hanya membaca dua tabel kecil. `online` dihitung dari lease, bukan disimpan.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const [setelan, stasiun] = await Promise.all([setelanMeja(eventId), daftarStasiun(eventId)]);
  if (!setelan.siap || stasiun === null) return apiError("STASIUN_NOT_READY", 409);
  return Response.json({ badge: setelan.badge, menit: setelan.menit, stasiun, time_zone: auth.scope.event.time_zone });
}
