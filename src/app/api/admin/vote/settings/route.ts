import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { BRANDING_COLUMNS } from "@/lib/branding";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Tampilan layar panggung voting.
 *
 * Kolomnya dibaca dan ditulis dengan nama yang sama persis seperti
 * `display_settings` dan `seat_map_sessions`, sehingga `normalizeBranding` dan
 * `<BrandingEditor>` yang sudah ada melayaninya tanpa cabang khusus.
 */
export const VOTE_SETTINGS_ROW =
  `page_title,page_subtitle,background_color,text_color,accent_color,panel_color,background_image_url,${BRANDING_COLUMNS}`;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format #RRGGBB");
const scale = z.number().min(0.5).max(2);

const bodySchema = z.object({
  page_title: z.string().trim().min(1).max(120),
  page_subtitle: z.string().trim().max(200).nullish(),
  background_color: hex.nullish(),
  text_color: hex.nullish(),
  accent_color: hex.nullish(),
  // NULL = dihitung dari warna latar. Lihat panelOn() di lib/color.
  panel_color: hex.nullish(),
  background_image_url: z.string().trim().url().max(500).nullish(),
  logo_url: z.string().trim().url().max(500).nullish(),
  logo_scale: scale.default(1),
  footer_image_url: z.string().trim().url().max(500).nullish(),
  footer_image_scale: scale.default(1),
  footer_text: z.string().trim().max(300).nullish(),
  heading_font: z.enum(["sans", "geometric", "condensed", "grotesk", "serif", "mono"]).default("sans"),
  title_scale: scale.default(1),
  subtitle_scale: scale.default(1),
  footer_scale: scale.default(1),
  title_color: hex.nullish(),
  subtitle_color: hex.nullish(),
  footer_text_color: hex.nullish(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;

  const { data } = await getSupabaseServiceClient()
    .from("vote_settings").select(VOTE_SETTINGS_ROW).eq("event_id", auth.scope.event.id).maybeSingle();

  // Baris dibuat saat pertama kali disimpan, bukan disiapkan lewat trigger pada
  // pembuatan event: event yang tidak pernah memakai voting tidak perlu punya
  // barisnya. Sampai itu terjadi, nilai bawaan dikirim apa adanya.
  return Response.json({ settings: data ?? null });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const blank = (value: string | null | undefined) => (value == null || value === "" ? null : value);

  const { error } = await getSupabaseServiceClient().from("vote_settings").upsert({
    event_id: auth.scope.event.id,
    ...body.data,
    // Semua kolom opsional dinormalkan ke null: string kosong yang tersimpan
    // membuat pemeriksaan `?? bawaan` di layar gagal, dan hasilnya judul atau
    // warna kosong alih-alih nilai bawaan.
    page_subtitle: blank(body.data.page_subtitle),
    background_color: blank(body.data.background_color),
    text_color: blank(body.data.text_color),
    accent_color: blank(body.data.accent_color),
    panel_color: blank(body.data.panel_color),
    background_image_url: blank(body.data.background_image_url),
    logo_url: blank(body.data.logo_url),
    footer_image_url: blank(body.data.footer_image_url),
    footer_text: blank(body.data.footer_text),
    title_color: blank(body.data.title_color),
    subtitle_color: blank(body.data.subtitle_color),
    footer_text_color: blank(body.data.footer_text_color),
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id,
  } as never, { onConflict: "event_id" });
  if (error) return apiError("INTERNAL_ERROR", 500);

  return Response.json({ ok: true });
}
