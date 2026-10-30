import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import type { UserRole } from "@/lib/auth/roles";
import { EVENT_VENUE_MAX } from "@/lib/domain";
import { createEvent, generateEventSlug, listEvents } from "@/lib/supabase/events";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  event_date: z.string().date().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  venue_name: z.string().trim().max(EVENT_VENUE_MAX).nullable().optional(),
  time_zone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
  participant_source: z.enum(["scanner_api", "manual", "public_form", "hybrid"]),
  scanner_api_event_slug: z.string().trim().min(1).max(120).nullable().optional(),
});

const KOLOM_ADMIN = "id,slug,name,description,event_date,status,participant_source,scanner_api_event_slug,registration_enabled,registration_form_config,time_zone,end_date,start_time,end_time,tagline,venue_name,venue_address,venue_map_url,landing_config,created_at,updated_at,archived_at";
// Peran lain (petugas, klien) hanya memakai daftar acara di /events: nama,
// tanggal, status, dan tempat. Isi CMS dan setelan formulir tetap di admin.
const KOLOM_DAFTAR = "id,slug,name,event_date,status,registration_enabled,time_zone,end_date,start_time,end_time,venue_name,created_at,updated_at,archived_at";

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
      .select("event_id,role")
      .eq("user_id", auth.user.id);
    if (error) return apiError("INTERNAL_ERROR", 500);

    // Peran DI ACARA ITU (seperti requireEventScope): admin acara A yang menjadi
    // petugas di acara B hanya mendapat baris daftar untuk acara B.
    const baris = (access as Array<{ event_id: string; role: UserRole }> | null) ?? [];
    // Akun kustom tidak pernah mendapat kolom admin, apa pun isi barisnya.
    const adminDi = (row: { role: UserRole }) => row.role === "admin" && auth.user.role !== "custom";
    const idAdmin = baris.filter(adminDi).map((row) => row.event_id);
    const idLain = baris.filter((row) => !adminDi(row)).map((row) => row.event_id);
    if (baris.length === 0) return Response.json({ events: [] });

    const muat = (ids: string[], kolom: string) => ids.length === 0
      ? Promise.resolve({ data: [] as unknown[], error: null })
      : client.from("events").select(kolom).in("id", ids);
    const [admin, lain] = await Promise.all([muat(idAdmin, KOLOM_ADMIN), muat(idLain, KOLOM_DAFTAR)]);
    if (admin.error || lain.error) return apiError("INTERNAL_ERROR", 500);
    // Urutan sama dengan sebelumnya: tanggal terbaru dulu, tanpa tanggal di akhir.
    const data = ([...(admin.data ?? []), ...(lain.data ?? [])] as Array<{ event_date: string | null }>)
      .sort((a, b) => (a.event_date === b.event_date ? 0 : a.event_date === null ? 1 : b.event_date === null ? -1 : a.event_date < b.event_date ? 1 : -1));
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