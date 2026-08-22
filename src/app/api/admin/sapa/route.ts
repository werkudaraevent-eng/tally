import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { normalizeBranding } from "@/lib/branding";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { DEFAULT_GREETING, GREETING_COLUMNS, type GreetingConfig } from "@/lib/greeting-config";

/**
 * CMS Layar sapa.
 *
 * Barisnya dibuat lewat `upsert`, bukan disiapkan oleh migrasi. Acara yang
 * ditambahkan setelah fitur ini rilis — termasuk hasil "duplikat event" — tidak
 * akan punya baris yang diseed, dan CMS yang mengandalkan baris yang sudah ada
 * akan gagal menyimpan pada acara terbaru saja. Itu jenis kegagalan yang baru
 * ketahuan di hari-H acara berikutnya.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = z.string().regex(HEX, "Warna harus format #rrggbb.");
const skala = z.number().min(0.5).max(2);
const gambar = z.string().trim().max(500).nullable();

const patchSchema = z
  .object({
    is_enabled: z.boolean(),
    orientation: z.enum(["landscape", "portrait"]),
    headline: z.string().trim().min(1).max(80),
    idle_message: z.string().trim().min(1).max(160),
    session_id: z.number().int().positive().nullable(),
    greet_duplicates: z.boolean(),
    hold_seconds: z.number().int().min(3).max(60),
    show_company: z.boolean(),
    show_recent: z.boolean(),
    recent_limit: z.number().int().min(1).max(12),
    background_color: hex,
    text_color: hex,
    accent_color: hex,
    background_image_url: gambar,
    logo_url: gambar,
    logo_scale: skala,
    footer_image_url: gambar,
    footer_image_scale: skala,
    footer_text: z.string().trim().max(160).nullable(),
    heading_font: z.enum(["sans", "geometric", "condensed", "grotesk", "serif", "mono"]),
    title_scale: skala,
    subtitle_scale: skala,
    footer_scale: skala,
    title_color: hex.nullable(),
    subtitle_color: hex.nullable(),
    footer_text_color: hex.nullable(),
  })
  .partial();

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const client = getSupabaseServiceClient();
  const eventId = auth.scope.event.id;

  const [setelan, sesi, layar] = await Promise.all([
    client.from("greeting_settings").select(GREETING_COLUMNS).eq("event_id", eventId).maybeSingle(),
    // Seluruh sesi ikut, termasuk yang ditutup: admin menyiapkan layar sapa
    // sebelum acara dimulai, dan sesi yang belum dibuka justru yang paling
    // mungkin ingin dipilih di sana.
    client
      .from("attendance_sessions")
      .select("id,name,is_active")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    // Layar yang pernah mendaftarkan diri, terbaru dulu. Ini satu-satunya tempat
    // panitia bisa melihat TV mana yang sudah mati — layar yang kabelnya
    // tersenggol tidak mengeluh, ia hanya berhenti berdenyut.
    client
      .from("greeting_screens")
      .select("id,lane_id,claimed_at,last_seen_at,attendance_lanes(name,slug)")
      .eq("event_id", eventId)
      .order("last_seen_at", { ascending: false })
      .limit(30),
  ]);

  const row = setelan.data;
  const config: GreetingConfig = {
    ...DEFAULT_GREETING,
    ...((row ?? {}) as Partial<GreetingConfig>),
    ...normalizeBranding((row ?? null) as Record<string, unknown> | null),
  };

  return Response.json({
    config,
    sessions: sesi.data ?? [],
    // "Masih menyala" dan "sudah berapa lama diam" dihitung di SINI, bukan di
    // komponen. Keduanya membaca jam sekarang, dan jam sekarang yang dibaca saat
    // menggambar membuat komponen menghasilkan keluaran berbeda pada render yang
    // sama — React memang melarangnya, dan hasilnya memang berubah-ubah tanpa
    // ada yang mengubah data.
    //
    // Dua menit: sepuluh kali lebih longgar daripada jeda denyut layar (2 detik),
    // supaya Wi-Fi lobi yang tersendat sesaat tidak membuat seluruh daftar
    // berkedip mati.
    screens: (layar.data ?? []).map((row) => {
      const baris = row as unknown as {
        id: number;
        lane_id: number | null;
        claimed_at: string | null;
        last_seen_at: string;
        attendance_lanes: { name: string; slug: string } | null;
      };
      const diam = Date.now() - new Date(baris.last_seen_at).getTime();
      return {
        id: baris.id,
        lane: baris.attendance_lanes ? { ...baris.attendance_lanes, id: baris.lane_id } : null,
        claimed_at: baris.claimed_at,
        last_seen_at: baris.last_seen_at,
        alive: diam < 2 * 60 * 1000,
        idle_minutes: Math.floor(diam / 60_000),
      };
    }),
    // Alamat layarnya ikut dikirim supaya CMS tidak merakitnya sendiri dari
    // potongan slug — dua tempat yang merakit alamat yang sama akan menyimpang
    // pada perubahan rute berikutnya.
    url: `/e/${auth.scope.event.slug}/sapa`,
  });
}

/**
 * Melepas satu layar dari jalurnya.
 *
 * Barisnya DIHAPUS, bukan hanya dikosongkan jalurnya. Layar yang bersangkutan
 * masih memegang `device_token` di localStorage-nya; pada denyut berikutnya ia
 * mendaftar ulang dan langsung menampilkan kode baru. Kalau barisnya disisakan
 * dengan jalur kosong, hasilnya sama persis — tetapi daftar di CMS perlahan
 * terisi baris layar yang sudah dibongkar tiga acara lalu.
 */
export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const id = Number(new URL(request.url).searchParams.get("screen"));
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const { error } = await getSupabaseServiceClient()
    .from("greeting_screens")
    .delete()
    .eq("id", id)
    .eq("event_id", auth.scope.event.id);

  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();

  // Sesi milik acara lain ditolak. Nomor sesi datang dari klien, dan tanpa
  // pemeriksaan ini layar sapa satu acara bisa dikunci ke checkpoint acara lain
  // — yang tampil sebagai layar sapa yang tidak pernah menyapa siapa pun.
  if (parsed.data.session_id != null) {
    const { data: sesi } = await client
      .from("attendance_sessions")
      .select("id")
      .eq("id", parsed.data.session_id)
      .eq("event_id", auth.scope.event.id)
      .maybeSingle();
    if (!sesi) return apiError("VALIDATION_ERROR", 422, { session_id: "Sesi tidak ada di acara ini." });
  }

  const { data, error } = await client
    .from("greeting_settings")
    .upsert(
      {
        event_id: auth.scope.event.id,
        ...parsed.data,
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id,
      } as never,
      { onConflict: "event_id" },
    )
    .select(GREETING_COLUMNS)
    .single();

  if (error) return apiError("INTERNAL_ERROR", 500);

  const config: GreetingConfig = {
    ...DEFAULT_GREETING,
    ...((data ?? {}) as Partial<GreetingConfig>),
    ...normalizeBranding((data ?? null) as Record<string, unknown> | null),
  };
  return Response.json({ config });
}
