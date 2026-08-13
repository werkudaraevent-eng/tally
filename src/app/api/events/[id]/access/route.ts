import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const idSchema = z.string().uuid();

/**
 * `super_admin` sengaja TIDAK boleh diberi baris di sini. Invariannya:
 * "super_admin tanpa baris user_event_access = akses semua event". Menulis satu
 * baris untuk satu event akan membuat GET /api/events berhenti memakai jalur
 * short-circuit-nya dan diam-diam menyembunyikan event lain dari orang yang
 * seharusnya melihat semuanya.
 */
const grantSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["booth", "cashier", "admin"]),
  booth_id: z.number().int().positive().nullable().optional(),
});

const revokeSchema = z.object({ user_id: z.string().uuid() });

async function loadEvent(id: string) {
  const client = getSupabaseServiceClient();
  const { data } = await client.from("events").select("id,name,slug,status").eq("id", id).maybeSingle();
  return data as { id: string; name: string; slug: string; status: string } | null;
}

const eventMissing = () =>
  apiError("VALIDATION_ERROR", 404, { message: "Event tidak ditemukan. Muat ulang daftarnya." });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const id = idSchema.safeParse((await context.params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", 422);

  const event = await loadEvent(id.data);
  if (!event) return eventMissing();

  const client = getSupabaseServiceClient();
  const [access, users, booths] = await Promise.all([
    client.from("user_event_access").select("user_id,role,booth_id,granted_at").eq("event_id", id.data),
    client.from("users").select("id,username,role,is_active").order("username"),
    // Booth WAJIB difilter per event: FK komposit (event_id, booth_id) menolak
    // booth milik event lain dengan 23503, dan dropdown yang menawarkannya
    // hanya memindahkan kegagalan ke saat simpan.
    client.from("booths").select("id,code,name").eq("event_id", id.data).order("code"),
  ]);
  if (access.error || users.error || booths.error) return apiError("INTERNAL_ERROR", 500);

  return Response.json({
    event,
    access: access.data ?? [],
    users: users.data ?? [],
    booths: booths.data ?? [],
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const id = idSchema.safeParse((await context.params).id);
  const body = grantSchema.safeParse(await request.json().catch(() => null));
  if (!id.success) return apiError("VALIDATION_ERROR", 422);
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const event = await loadEvent(id.data);
  if (!event) return eventMissing();

  const client = getSupabaseServiceClient();
  const { data: user } = await client
    .from("users")
    .select("id,username,role")
    .eq("id", body.data.user_id)
    .maybeSingle();
  if (!user) return apiError("USER_NOT_FOUND", 404);
  if ((user as { role: string }).role === "super_admin") {
    return apiError("VALIDATION_ERROR", 422, {
      message: "Super admin sudah otomatis punya akses ke semua event. Tidak perlu didaftarkan di sini.",
    });
  }

  // Constraint DB (`user_event_access_booth_required`, 23514) menolak ini juga,
  // tapi pesannya sampai ke layar sebagai "kesalahan server".
  const boothId = body.data.role === "booth" ? (body.data.booth_id ?? null) : null;
  if (body.data.role === "booth" && boothId === null) {
    return apiError("VALIDATION_ERROR", 422, { message: "Peran Admin Booth wajib memilih booth." });
  }
  if (boothId !== null) {
    const { data: booth } = await client
      .from("booths")
      .select("id")
      .eq("event_id", id.data)
      .eq("id", boothId)
      .maybeSingle();
    if (!booth) return apiError("BOOTH_NOT_FOUND", 404);
  }

  const { data, error } = await client
    .from("user_event_access")
    .upsert(
      {
        user_id: body.data.user_id,
        event_id: id.data,
        role: body.data.role,
        booth_id: boothId,
        granted_by: auth.user.id,
      } as never,
      { onConflict: "user_id,event_id" },
    )
    .select("user_id,role,booth_id,granted_at")
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: id.data,
    user_id: auth.user.id,
    action: "event_access_grant",
    payload: { target_user: user, role: body.data.role, booth_id: boothId },
  } as never);
  return Response.json({ access: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const id = idSchema.safeParse((await context.params).id);
  const body = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("user_event_access")
    .delete()
    .eq("event_id", id.data)
    .eq("user_id", body.data.user_id)
    .select("user_id")
    .maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) return apiError("USER_NOT_FOUND", 404);

  await client.from("audit_logs").insert({
    event_id: id.data,
    user_id: auth.user.id,
    action: "event_access_revoke",
    payload: { target_user_id: body.data.user_id },
  } as never);
  return Response.json({ ok: true });
}
