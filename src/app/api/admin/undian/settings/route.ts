import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { BRANDING_COLUMNS, BRANDING_FONTS, SCALE_MAX, SCALE_MIN, type BrandingFont } from "@/lib/branding";

// Setelan panggung undian: judul, privasi nama, suara, confetti, dan branding.
//
// Bentuk validasinya disalin dari /api/admin/rundown/header supaya keempat CMS
// branding menerima aturan yang sama persis. Warna boleh null, dan null berarti
// "ikut tema bawaan halaman", bukan "tanpa warna".

export const UNDIAN_SETTINGS_COLUMNS =
  `page_title,page_subtitle,name_display,show_company,show_seat,sound_enabled,confetti_enabled,` +
  `reveal_delay_seconds,background_color,text_color,accent_color,background_image_url,${BRANDING_COLUMNS},updated_at`;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex #RRGGBB");
const scale = z.number().min(SCALE_MIN).max(SCALE_MAX);
const assetUrl = z.string().trim().url().max(600).nullable().optional();

const patchSchema = z.object({
  page_title: z.string().trim().min(1).max(160).optional(),
  page_subtitle: z.string().trim().max(200).nullable().optional(),
  name_display: z.enum(["full", "follow_event"]).optional(),
  show_company: z.boolean().optional(),
  show_seat: z.boolean().optional(),
  sound_enabled: z.boolean().optional(),
  confetti_enabled: z.boolean().optional(),
  reveal_delay_seconds: z.number().min(0).max(10).optional(),
  background_color: hex.nullable().optional(),
  text_color: hex.nullable().optional(),
  accent_color: hex.nullable().optional(),
  background_image_url: assetUrl,
  logo_url: assetUrl,
  logo_scale: scale.optional(),
  footer_image_url: assetUrl,
  footer_image_scale: scale.optional(),
  footer_text: z.string().trim().max(200).nullable().optional(),
  heading_font: z.enum(BRANDING_FONTS.map((item) => item.value) as [BrandingFont, ...BrandingFont[]]).optional(),
  title_scale: scale.optional(),
  subtitle_scale: scale.optional(),
  footer_scale: scale.optional(),
  title_color: hex.nullable().optional(),
  subtitle_color: hex.nullable().optional(),
  footer_text_color: hex.nullable().optional(),
});

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("undian_settings").select(UNDIAN_SETTINGS_COLUMNS).eq("id", 1).maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", 500);

  // Baris singleton dibuat migrasi. Bila hilang, ia dipasang ulang di sini
  // alih-alih menolak: CMS yang gagal memuat lebih buruk daripada CMS yang
  // menampilkan nilai bawaan dan langsung bisa disimpan.
  if (!data) {
    const inserted = await client.from("undian_settings").insert({ id: 1 } as never).select(UNDIAN_SETTINGS_COLUMNS).single();
    if (inserted.error) return apiError("INTERNAL_ERROR", 500);
    return Response.json(inserted.data);
  }
  return Response.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("undian_settings").select(UNDIAN_SETTINGS_COLUMNS).eq("id", 1).maybeSingle();

  const { data, error } = await client
    .from("undian_settings")
    .update({
      ...parsed.data,
      // String kosong dari form berarti "tidak dipakai", bukan teks kosong yang
      // tetap dirender sebagai baris kosong di bawah judul.
      ...(parsed.data.page_subtitle !== undefined ? { page_subtitle: parsed.data.page_subtitle?.trim() || null } : {}),
      ...(parsed.data.footer_text !== undefined ? { footer_text: parsed.data.footer_text?.trim() || null } : {}),
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    } as never)
    .eq("id", 1)
    .select(UNDIAN_SETTINGS_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "undian_settings_update",
    payload: { old: current, new: data },
  } as never);
  return Response.json(data);
}
