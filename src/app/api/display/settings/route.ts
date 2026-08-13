import { z } from "zod";
import { apiError } from "@/lib/api";
import { getPublicRequestEvent, requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { BRANDING_COLUMNS, BRANDING_FONTS, SCALE_MAX, SCALE_MIN, type BrandingFont } from "@/lib/branding";
import { loadActiveBoothCodes } from "@/lib/display-booths";
import { normalizeTimeZone } from "@/lib/timezone";

const SELECT = `event_title,headline,tagline,background_color,text_color,accent_color,background_image_url,leaderboard_limit,show_company,show_booth_progress,show_ticker,show_amount,ticker_text,refresh_seconds,updated_at,${BRANDING_COLUMNS}`;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex #RRGGBB");

// Skala adalah pengali 0,5-2 terhadap rumus clamp() yang sudah ada, bukan ukuran
// piksel. Lihat `scaleClamp` di src/lib/branding.ts: ukuran absolut akan merusak
// tata letak yang seluruhnya dibangun dari clamp() berbasis viewport.
const scale = z.number().min(SCALE_MIN).max(SCALE_MAX);

// Warna per elemen boleh null, dan itu bermakna: null berarti "ikut warna dasar
// layar", bukan "tanpa warna".
const brandingSchema = {
  logo_url: z.string().trim().url().max(600).nullable().optional(),
  logo_scale: scale.optional(),
  footer_image_url: z.string().trim().url().max(600).nullable().optional(),
  footer_image_scale: scale.optional(),
  footer_text: z.string().trim().max(200).nullable().optional(),
  heading_font: z.enum(BRANDING_FONTS.map((item) => item.value) as [BrandingFont, ...BrandingFont[]]).optional(),
  title_scale: scale.optional(),
  subtitle_scale: scale.optional(),
  footer_scale: scale.optional(),
  title_color: hex.nullable().optional(),
  subtitle_color: hex.nullable().optional(),
  footer_text_color: hex.nullable().optional(),
};
const patchSchema = z.object({
  event_title: z.string().trim().min(1).max(120).optional(),
  headline: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().trim().min(1).max(160).optional(),
  background_color: hex.optional(),
  text_color: hex.optional(),
  accent_color: hex.optional(),
  background_image_url: z.string().trim().url().max(600).nullable().optional(),
  leaderboard_limit: z.number().int().min(3).max(50).optional(),
  show_company: z.boolean().optional(),
  show_booth_progress: z.boolean().optional(),
  show_ticker: z.boolean().optional(),
  show_amount: z.boolean().optional(),
  ticker_text: z.string().trim().max(300).nullable().optional(),
  refresh_seconds: z.number().int().min(5).max(300).optional(),
  ...brandingSchema,
});

// Public read: the Live Display runs without a logged-in operator.
export async function GET(request: Request) {
  const event = await getPublicRequestEvent(request);
  if (!event) return apiError("INTERNAL_ERROR", 404);
  const client = getSupabaseServiceClient();
  // Zona acara ikut dikirim di endpoint ini, bukan lewat prop dari server page:
  // Live Display menyegarkan dirinya dari sini tiap beberapa detik, jadi zona
  // yang diubah admin saat acara berjalan langsung ikut terpakai tanpa perlu
  // ada yang memuat ulang layar di panggung.
  const [displayResult, settingsResult, boothCodes] = await Promise.all([
    client.from("display_settings").select(SELECT).eq("event_id", event.id).single(),
    client.from("event_settings").select("time_zone").eq("event_id", event.id).maybeSingle(),
    loadActiveBoothCodes(event.id),
  ]);
  if (displayResult.error) return apiError("INTERNAL_ERROR", 500);
  // Cast diperlukan karena proyek ini tidak memakai tipe hasil generate Supabase,
  // sehingga `data` bertipe terlalu longgar untuk di-spread.
  return Response.json({
    ...(displayResult.data as Record<string, unknown>),
    time_zone: normalizeTimeZone((settingsResult.data as { time_zone?: string } | null)?.time_zone),
    // Bukan kolom display_settings, tapi WAJIB ikut di sini.
    //
    // Layar menyegarkan konfigurasinya dari endpoint ini tiap 30 detik dan
    // menimpa state-nya dengan hasilnya. Tanpa daftar booth di response, nilai
    // yang dikirim server page saat render pertama akan terhapus pada siklus
    // penyegaran berikutnya dan panel progress lenyap sendiri setengah menit
    // setelah layar dinyalakan — tepat setelah tidak ada lagi yang menontonnya.
    //
    // Efek sampingnya diinginkan: booth yang diaktifkan atau dinonaktifkan admin
    // saat acara berjalan ikut terpakai tanpa ada yang memuat ulang proyektor.
    active_booth_codes: boothCodes,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422, parsed.success ? undefined : parsed.error.flatten());
  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("display_settings").select("*").eq("event_id", auth.scope.event.id).single();
  const { data, error } = await client.from("display_settings").update({
    ...parsed.data,
    // String kosong dari form berarti "tidak dipakai", bukan teks kosong yang
    // tetap dirender sebagai baris kosong di footer.
    ...(parsed.data.footer_text !== undefined ? { footer_text: parsed.data.footer_text?.trim() || null } : {}),
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id,
  } as never).eq("event_id", auth.scope.event.id).select(SELECT).single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  await client.from("audit_logs").insert({ event_id: auth.scope.event.id, user_id: auth.user.id, action: "display_settings_update", payload: { old: current, new: data } } as never);
  return Response.json(data);
}
