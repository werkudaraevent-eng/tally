import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { redactAmounts, type LeaderboardEntry } from "@/lib/reveal";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Endpoint PUBLIK: dipakai layar tanpa operator yang login. Karena itu nominal
// wajib melewati `redactAmounts` seperti /api/display/reveal. Tanpa itu,
// mematikan "Tampilkan nominal belanja" di CMS hanya menyembunyikan angka di satu
// jalur sementara jalur ini tetap menyajikannya utuh kepada siapa pun yang tahu
// URL-nya — dan toggle yang bocor lewat pintu lain lebih buruk daripada tidak
// ada toggle, karena panitia mengira angkanya sudah aman.
export async function GET(request: Request) {
  const parsed = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("get_leaderboard" as never, { p_limit: parsed.data.limit } as never);
  if (error) return apiError(mapDatabaseError(error), 500);
  const [{ data: settings }, { data: display }] = await Promise.all([
    client.from("event_settings").select("leaderboard_enabled").eq("id", 1).single() as unknown as Promise<{ data: { leaderboard_enabled: boolean } | null }>,
    client.from("display_settings").select("show_amount").eq("id", 1).maybeSingle() as unknown as Promise<{ data: { show_amount: boolean } | null }>,
  ]);
  // `!== false`, bukan truthiness: bila baris konfigurasi gagal dibaca, nominal
  // tetap tampil sesuai default kolomnya. Kegagalan baca tidak boleh mengubah
  // tampilan yang sedang berjalan di panggung.
  const showAmount = display?.show_amount !== false;
  return Response.json({
    updated_at: new Date().toISOString(),
    leaderboard_enabled: settings?.leaderboard_enabled ?? true,
    entries: redactAmounts((data ?? []) as LeaderboardEntry[], showAmount),
  });
}
