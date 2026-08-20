import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { createEvent, generateEventSlug, listEvents } from "@/lib/supabase/events";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  event_date: z.string().date().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  time_zone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
  participant_source: z.enum(["scanner_api", "manual", "public_form", "hybrid"]),
  scanner_api_event_slug: z.string().trim().min(1).max(120).nullable().optional(),
});

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  try {
    if (auth.user.role === "super_admin") {
      return Response.json({ events: await listEvents({ includeArchived: true }) });
    }

    const client = getSupabaseServiceClient();
    const { data: access, error } = await client
      .from("user_event_access")
      .select("event_id")
      .eq("user_id", auth.user.id);
    if (error) return apiError("INTERNAL_ERROR", 500);

    const ids = ((access as Array<{ event_id: string }> | null) ?? []).map((row) => row.event_id);
    if (ids.length === 0) return Response.json({ events: [] });

    const { data, error: eventError } = await client
      .from("events")
      .select("id,slug,name,description,event_date,status,participant_source,scanner_api_event_slug,registration_enabled,registration_form_config,time_zone,end_date,start_time,end_time,tagline,venue_name,venue_address,venue_map_url,landing_config,created_at,updated_at,archived_at")
      .in("id", ids)
      .order("event_date", { ascending: false, nullsFirst: false });
    if (eventError) return apiError("INTERNAL_ERROR", 500);
    return Response.json({ events: data ?? [] });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  if (
    ["scanner_api", "hybrid"].includes(parsed.data.participant_source) &&
    !parsed.data.scanner_api_event_slug
  ) {
    return apiError("VALIDATION_ERROR", 422, { scanner_api_event_slug: ["Slug Scanner API wajib diisi."] });
  }

  try {
    const event = await createEvent({
      ...parsed.data,
      slug: await generateEventSlug(parsed.data.name),
      status: "draft",
      created_by: auth.user.id,
    });

    // Setiap tabel settings kini satu baris PER EVENT. Dibuat segera saat event
    // dibuat supaya CMS tidak perlu punya tujuh cabang "kalau belum ada, insert".
    const client = getSupabaseServiceClient();
    const settings = await Promise.all([
      client.from("event_settings").insert({ event_id: event.id, time_zone: event.time_zone } as never),
      client.from("display_settings").insert({ event_id: event.id } as never),
      client.from("seat_maps").insert({ event_id: event.id } as never),
      client.from("rundown_settings").insert({ event_id: event.id, event_title: event.name } as never),
      client.from("leaderboard_reveal").insert({ event_id: event.id } as never),
      client.from("undian_settings").insert({ event_id: event.id } as never),
      client.from("undian_state").insert({ event_id: event.id } as never),
    ]);
    const settingsError = settings.find((result) => result.error)?.error;
    if (settingsError) {
      // Event draft tanpa settings tidak dapat dipakai. Hapus kembali agar
      // pengguna tidak melihat workspace setengah jadi.
      await client.from("events").delete().eq("id", event.id);
      throw settingsError;
    }

    await client.from("audit_logs").insert({
      user_id: auth.user.id,
      event_id: event.id,
      action: "event_create",
      payload: { event },
    } as never);

    return Response.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Membuat event gagal:", error);
    return apiError("INTERNAL_ERROR", 500);
  }
}