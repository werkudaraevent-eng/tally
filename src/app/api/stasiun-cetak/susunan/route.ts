import { requireRequestEvent } from "@/lib/auth/request-event";
import { kvUrlDari, loadBadgeLayout, loadBadgeRundown } from "@/lib/badge/load";

/**
 * Susunan badge untuk laptop stasiun. Sama dengan GET /api/admin/badge, tetapi
 * terbuka untuk akun pemindai: stasiun dijalankan dengan akun pemindai khusus,
 * dan akun itu tidak boleh membaca rute admin lainnya.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const [{ layout }, rundown] = await Promise.all([loadBadgeLayout(event.id), loadBadgeRundown(event.id)]);
  return Response.json({
    layout,
    event: { name: event.name, slug: event.slug, kv_url: kvUrlDari(event.landing_config) },
    rundown,
    time_zone: event.time_zone,
  });
}
