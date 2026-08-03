import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { BRANDING_FONTS, SCALE_MAX, SCALE_MIN, type BrandingFont } from "@/lib/branding";
import { DEFAULT_HEADER, HEADER_COLUMNS } from "@/lib/rundown";

// Header halaman /rundown: judul acara, sub judul, dan branding. Admin saja.
//
// Endpoint terpisah dari /api/admin/rundown/sections karena datanya memang
// terpisah: satu baris singleton untuk seluruh acara, bukan satu baris per tab.
// Sebelumnya branding menempel di section, dan berpindah tab mengubah seluruh
// identitas halaman — judul, warna, dan logo sekaligus.
//
// Bentuk validasi disalin dari /api/display/settings supaya ketiga CMS branding
// menerima aturan yang sama. Warna boleh null: null berarti "ikut tema bawaan
// halaman", bukan "tanpa warna".

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex #RRGGBB");
const scale = z.number().min(SCALE_MIN).max(SCALE_MAX);
const assetUrl = z.string().trim().url().max(600).nullable().optional();

const patchSchema = z.object({
  event_title: z.string().trim().min(1).max(160).optional(),
  event_subtitle: z.string().trim().max(200).nullable().optional(),
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

  const { data, error } = await getSupabaseServiceClient()
    .from("rundown_settings")
    .select(HEADER_COLUMNS)
    .eq("id", 1)
    .maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", 500);
  // Baris singleton dibuat migrasi, tapi nilai bawaan tetap dikembalikan bila
  // hilang: CMS yang gagal memuat lebih buruk daripada CMS yang menampilkan
  // nilai kosong dan bisa langsung disimpan.
  return Response.json(data ?? DEFAULT_HEADER);
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("rundown_settings").select(HEADER_COLUMNS).eq("id", 1).maybeSingle();

  const { data, error } = await client
    .from("rundown_settings")
    .update({
      ...parsed.data,
      // String kosong dari form berarti "tidak dipakai", bukan teks kosong yang
      // tetap dirender sebagai baris kosong di bawah judul.
      ...(parsed.data.event_subtitle !== undefined ? { event_subtitle: parsed.data.event_subtitle?.trim() || null } : {}),
      ...(parsed.data.footer_text !== undefined ? { footer_text: parsed.data.footer_text?.trim() || null } : {}),
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    } as never)
    .eq("id", 1)
    .select(HEADER_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "rundown_header_update",
    payload: { old: current, new: data },
  } as never);
  return Response.json(data);
}
