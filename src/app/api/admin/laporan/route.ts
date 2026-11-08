import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { bacaConfig } from "@/lib/laporan/config";
import { hitungLaporan, muatLaporan, simpanConfig } from "@/lib/laporan/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Admin > Event report (migrasi 202611080060).
 *
 * GET  deck dari data terbaru, daftar slide untuk editor, slide yang absen
 *      beserta alasannya, config panitia, dan status Share with client.
 * PUT  simpan config. Body `{ config, updated_at }`: updated_at yang DIMUAT
 *      (compare-and-swap). 409 bila baris sudah diubah di tab lain.
 *
 * Sebelum migrasi: `{ siap: false }`.
 */

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const laporan = await muatLaporan(event.id).catch(() => null);
  if (!laporan) return apiError("INTERNAL_ERROR", 500);
  if (!laporan.siap) return Response.json({ siap: false });

  const [hasil, klien] = await Promise.all([hitungLaporan(event, laporan.config).catch(() => null), akunKlien(event.id)]);
  if (!hasil || !klien) return apiError("INTERNAL_ERROR", 500);
  return Response.json({
    siap: true,
    config: laporan.config,
    updated_at: laporan.updated_at,
    shared_at: laporan.shared_at,
    deck: hasil.deck,
    daftar: hasil.daftar,
    absen: hasil.absen,
    semua: hasil.semua,
    pilihan: hasil.pilihan,
    slug: event.slug,
    klien,
  });
}

/**
 * Akun klien (peran Viewer untuk acara ini) yang melihat tab Report, untuk
 * dialog Share. Hanya nama pengguna dan status aktif. Null bila gagal dibaca.
 */
async function akunKlien(eventId: string): Promise<Array<{ username: string; aktif: boolean }> | null> {
  const client = getSupabaseServiceClient();
  const akses = await client.from("user_event_access").select("user_id").eq("event_id", eventId).eq("role", "viewer").limit(200);
  if (akses.error) return null;
  const ids = ((akses.data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (!ids.length) return [];
  const akun = await client.from("users").select("username,is_active").in("id", ids).order("username");
  if (akun.error) return null;
  return ((akun.data ?? []) as { username: string; is_active: boolean }[]).map((u) => ({ username: u.username, aktif: u.is_active }));
}

export async function PUT(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const body = (await request.json().catch(() => null)) as { config?: unknown; updated_at?: unknown } | null;
  if (!body || typeof body.config !== "object" || !(body.updated_at === null || typeof body.updated_at === "string")) return apiError("VALIDATION_ERROR", 422);
  // Highlight harian (termasuk salinan yang dikunci) hanya ditulis lewat
  // /api/admin/laporan/harian: deck selalu menyimpan ulang yang sudah tersimpan.
  const tersimpan = await muatLaporan(event.id).catch(() => null);
  if (!tersimpan) return apiError("INTERNAL_ERROR", 500);
  if (!tersimpan.siap) return Response.json({ siap: false });
  const config = { ...bacaConfig(body.config), harian: tersimpan.config.harian };
  const hasil = await simpanConfig(event.id, config, body.updated_at, auth.user.id);
  if (!hasil.ok) {
    if (hasil.alasan === "belum_siap") return Response.json({ siap: false });
    if (hasil.alasan === "basi") return apiError("CONFLICT", 409);
    return apiError("INTERNAL_ERROR", 500);
  }
  await getSupabaseServiceClient()
    .from("audit_logs")
    .insert({ event_id: event.id, user_id: auth.user.id, action: "event_report_save", payload: { new: { ...config, harian: undefined } } } as never);

  // Deck baru ikut dikirim supaya pratinjau langsung sama dengan yang tersimpan.
  const susun = await hitungLaporan(event, config).catch(() => null);
  return Response.json({ ok: true, updated_at: hasil.updated_at, config, ...(susun ? { deck: susun.deck, daftar: susun.daftar, absen: susun.absen, semua: susun.semua } : {}) });
}
