import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { tabelBelumAda } from "@/lib/member/pengumuman";

/**
 * Pengumuman panitia untuk area peserta (menu admin "Pengumuman").
 *
 * GET daftar semua pengumuman acara + jumlah akun per penerima (untuk kalimat
 * "Kirim ke N akun" sebelum salinan email dikirim). POST membuat, PATCH
 * menyunting, DELETE menghapus. Salinan email dikirim terpisah lewat
 * /api/admin/pengumuman/email, setelah panitia mengonfirmasi.
 */

const KOLOM = "id,title,body,link_url,link_label,audience,pinned,published_at,email_summary,created_at,updated_at";

const tautanSchema = z
  .string()
  .trim()
  .max(500)
  .refine((nilai) => nilai === "" || /^https?:\/\//i.test(nilai), "Tautan harus diawali http:// atau https://")
  .transform((nilai) => nilai || null);

const isiSchema = z.object({
  title: z.string().trim().min(1, "Judul wajib diisi").max(120),
  body: z.string().trim().max(2000).default(""),
  link_url: tautanSchema.nullable().optional(),
  link_label: z
    .string()
    .trim()
    .max(60)
    .transform((nilai) => nilai || null)
    .nullable()
    .optional(),
  audience: z.enum(["semua", "disetujui"]).default("semua"),
  pinned: z.boolean().default(false),
});

const ubahSchema = isiSchema.partial().extend({ id: z.string().uuid() });

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();

  const [daftar, semua, disetujui] = await Promise.all([
    client
      .from("event_announcements")
      .select(KOLOM)
      .eq("event_id", eventId)
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false }),
    client.from("participant_accounts").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    client
      .from("participant_accounts")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .not("participant_id", "is", null),
  ]);
  if (tabelBelumAda(daftar.error)) return Response.json({ ready: false, items: [], recipients: { semua: 0, disetujui: 0 }, email_configured: isEmailConfigured() });
  if (daftar.error) return apiError("INTERNAL_ERROR", 500);

  const landing = (auth.scope.event.landing_config ?? {}) as { member?: { enabled?: boolean } };
  return Response.json({
    ready: true,
    items: daftar.data ?? [],
    recipients: { semua: semua.count ?? 0, disetujui: disetujui.count ?? 0 },
    email_configured: isEmailConfigured(),
    member_enabled: Boolean(landing.member?.enabled),
    time_zone: auth.scope.event.time_zone,
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = isiSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("event_announcements")
    .insert({ ...parsed.data, event_id: auth.scope.event.id, created_by: auth.user.id } as never)
    .select(KOLOM)
    .single();
  if (tabelBelumAda(error)) return apiError("ANNOUNCEMENTS_NOT_READY", 409);
  if (error || !data) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "announcement_create",
    payload: { new: data },
  } as never);
  return Response.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = ubahSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, ...ubah } = parsed.data;

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("event_announcements")
    .update({ ...ubah, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .select(KOLOM)
    .maybeSingle();
  if (tabelBelumAda(error)) return apiError("ANNOUNCEMENTS_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) return apiError("ANNOUNCEMENT_NOT_FOUND", 404);

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "announcement_update",
    payload: { id, changes: ubah },
  } as never);
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("event_announcements")
    .delete()
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .select("id,title")
    .maybeSingle();
  if (tabelBelumAda(error)) return apiError("ANNOUNCEMENTS_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) return apiError("ANNOUNCEMENT_NOT_FOUND", 404);

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "announcement_delete",
    payload: { old: data },
  } as never);
  return Response.json({ ok: true });
}
