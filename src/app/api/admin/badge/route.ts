import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { kvUrlDari, loadBadgeLayout, loadBadgeRundown, tabelBadgeBelumAda } from "@/lib/badge/load";
import { badgeLayoutSchema } from "@/lib/badge/schema";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Susunan badge kertas, plus bahan yang dibutuhkan pratinjau dan halaman cetak:
 * nama acara, KV halaman acara, dan rundown yang sudah terbit. Satu permintaan,
 * supaya halaman cetak 247 badge tidak membuka tiga koneksi lalu menggambar
 * badge yang setengahnya kosong ketika salah satunya terlambat.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const [{ layout, migrasi }, rundown] = await Promise.all([loadBadgeLayout(event.id), loadBadgeRundown(event.id)]);
  return Response.json({
    layout,
    migrasi,
    event: { name: event.name, slug: event.slug, kv_url: kvUrlDari(event.landing_config) },
    rundown,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = badgeLayoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { error } = await getSupabaseServiceClient()
    .from("badge_settings")
    .upsert(
      { event_id: auth.scope.event.id, layout: parsed.data, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never,
      { onConflict: "event_id" },
    );
  if (error) {
    // Tabel belum ada: migrasi belum dijalankan di database ini. Dibedakan dari
    // galat lain supaya penyunting bisa mengatakannya dengan jujur.
    if (tabelBadgeBelumAda(error)) return apiError("BADGE_NOT_READY", 409);
    return apiError("INTERNAL_ERROR", 500);
  }
  const { layout } = await loadBadgeLayout(auth.scope.event.id);
  return Response.json({ layout, migrasi: true });
}
