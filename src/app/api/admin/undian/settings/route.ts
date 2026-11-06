import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { BRANDING_COLUMNS, BRANDING_FONTS, SCALE_MAX, SCALE_MIN, type BrandingFont } from "@/lib/branding";
import { musikSah } from "@/lib/undian-musik";

// Setelan panggung undian: judul, privasi nama, suara, confetti, dan branding.
//
// Bentuk validasinya disalin dari /api/admin/rundown/header supaya keempat CMS
// branding menerima aturan yang sama persis. Warna boleh null, dan null berarti
// "ikut tema bawaan halaman", bukan "tanpa warna".

export const UNDIAN_SETTINGS_COLUMNS =
  `page_title,page_subtitle,name_display,show_company,show_seat,show_lineup,show_pool_size,sound_enabled,confetti_enabled,` +
  `reveal_delay_seconds,background_color,text_color,accent_color,background_image_url,${BRANDING_COLUMNS},updated_at`;

// Kolom musik (migrasi 202611060003_undian_musik) dibaca terpisah: sebelum
// migrasi itu dijalankan, select dengan kolom ini gagal (42703) dan CMS harus
// tetap memuat setelan lainnya, dengan musik dianggap mati.
const MUSIC_COLUMNS = "music_enabled,music_waiting_url,music_drawing_url,music_winner_url,music_volume";
// `music_available: false` menyembunyikan bagian Music di CMS sampai kolomnya ada.
const MUSIC_OFF = { music_enabled: false, music_waiting_url: null, music_drawing_url: null, music_winner_url: null, music_volume: 80, music_available: false };
const KOLOM_BELUM_ADA = "42703";
// PostgREST menolak kolom tak dikenal di payload update dengan PGRST204.
const KOLOM_TAK_DIKENAL = "PGRST204";

async function bacaSetelan(client: ReturnType<typeof getSupabaseServiceClient>, eventId: string) {
  const lengkap = await client.from("undian_settings").select(`${UNDIAN_SETTINGS_COLUMNS},${MUSIC_COLUMNS}`).eq("event_id", eventId).maybeSingle();
  if (lengkap.error?.code !== KOLOM_BELUM_ADA) return { ...lengkap, data: lengkap.data ? { ...(lengkap.data as Record<string, unknown>), music_available: true } : null };
  const dasar = await client.from("undian_settings").select(UNDIAN_SETTINGS_COLUMNS).eq("event_id", eventId).maybeSingle();
  return { ...dasar, data: dasar.data ? { ...(dasar.data as Record<string, unknown>), ...MUSIC_OFF } : null };
}

const musicUrl = z.string().trim().max(1000)
  .refine((nilai) => musikSah(nilai, process.env.NEXT_PUBLIC_SUPABASE_URL), "Upload the music file again.")
  .nullable().optional();

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex #RRGGBB");
const scale = z.number().min(SCALE_MIN).max(SCALE_MAX);
const assetUrl = z.string().trim().url().max(600).nullable().optional();

const patchSchema = z.object({
  page_title: z.string().trim().min(1).max(160).optional(),
  page_subtitle: z.string().trim().max(200).nullable().optional(),
  name_display: z.enum(["full", "follow_event"]).optional(),
  show_company: z.boolean().optional(),
  show_seat: z.boolean().optional(),
  show_lineup: z.boolean().optional(),
  show_pool_size: z.boolean().optional(),
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
  music_enabled: z.boolean().optional(),
  music_waiting_url: musicUrl,
  music_drawing_url: musicUrl,
  music_winner_url: musicUrl,
  music_volume: z.number().int().min(0).max(100).optional(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const client = getSupabaseServiceClient();
  const { data, error } = await bacaSetelan(client, eventId);
  if (error) return apiError("INTERNAL_ERROR", 500);

  // Baris dibuat saat event dibuat. Bila hilang, ia dipasang ulang di sini
  // alih-alih menolak: CMS yang gagal memuat lebih buruk daripada CMS yang
  // menampilkan nilai bawaan dan langsung bisa disimpan.
  // `id` TIDAK ditulis tangan lagi — kini satu baris per event dengan id sequence.
  if (!data) {
    const inserted = await client.from("undian_settings").insert({ event_id: eventId } as never).select(UNDIAN_SETTINGS_COLUMNS).single();
    if (inserted.error) return apiError("INTERNAL_ERROR", 500);
    const baru = await bacaSetelan(client, eventId);
    return Response.json(baru.data ?? { ...(inserted.data as Record<string, unknown>), ...MUSIC_OFF });
  }
  return Response.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await bacaSetelan(client, eventId);

  const ubahan: Record<string, unknown> = {
    ...parsed.data,
    // String kosong dari form berarti "tidak dipakai", bukan teks kosong yang
    // tetap dirender sebagai baris kosong di bawah judul.
    ...(parsed.data.page_subtitle !== undefined ? { page_subtitle: parsed.data.page_subtitle?.trim() || null } : {}),
    ...(parsed.data.footer_text !== undefined ? { footer_text: parsed.data.footer_text?.trim() || null } : {}),
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id,
  };
  let hasil = await client.from("undian_settings").update(ubahan as never).eq("event_id", eventId).select("event_id").single();
  // Sebelum migrasi musik: simpan setelan lainnya tanpa kolom musik.
  if (hasil.error && [KOLOM_BELUM_ADA, KOLOM_TAK_DIKENAL].includes(hasil.error.code)) {
    for (const kolom of MUSIC_COLUMNS.split(",")) delete ubahan[kolom];
    hasil = await client.from("undian_settings").update(ubahan as never).eq("event_id", eventId).select("event_id").single();
  }
  if (hasil.error) return apiError("INTERNAL_ERROR", 500);
  const { data, error } = await bacaSetelan(client, eventId);
  if (error || !data) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "undian_settings_update",
    payload: { old: current, new: data },
  } as never);
  return Response.json(data);
}
