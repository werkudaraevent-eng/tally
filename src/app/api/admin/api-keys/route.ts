import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { buatKunci, IZIN } from "@/lib/api-keys";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Event settings > Integrations > API keys.
 *
 * Admin acara ini saja (akun kustom tertolak oleh izin-modul.ts karena route
 * ini tidak tercantum). Kunci asli dikembalikan SEKALI di jawaban POST dan
 * tidak pernah lagi; GET hanya memberi awalan untuk dikenali.
 */

const KOLOM = "id,name,scopes,key_prefix,created_at,created_by,expires_at,last_used_at,revoked_at";
const MAKS_KUNCI_AKTIF = 10;

const buat = z.object({
  name: z.string().trim().min(1, "Give the key a name, such as Hermes.").max(40),
  scopes: z.array(z.enum(IZIN.map((izin) => izin.key) as [string, ...string[]])).min(1, "Choose at least one permission.").max(10),
  /** Hari sampai kedaluwarsa; null = tidak kedaluwarsa. */
  expires_in_days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90), z.null()]),
}).strict();

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const db = getSupabaseServiceClient();
  const [kunci, users] = await Promise.all([
    db.from("api_keys").select(KOLOM).eq("event_id", auth.scope.event.id).order("created_at", { ascending: false }).limit(200),
    db.from("users").select("id,username"),
  ]);
  if (kunci.error) {
    // Tabel belum ada: migrasi 202611050020 belum dijalankan.
    if (["PGRST205", "42P01"].includes(String((kunci.error as { code?: string }).code))) return Response.json({ keys: [], not_ready: true });
    return apiError("INTERNAL_ERROR", 500);
  }
  const nama = new Map(((users.data ?? []) as Array<{ id: string; username: string }>).map((u) => [u.id, u.username]));
  return Response.json({
    keys: ((kunci.data ?? []) as Array<Record<string, unknown> & { created_by: string | null }>).map(({ created_by, ...baris }) => ({
      ...baris,
      created_by_name: created_by ? nama.get(created_by) ?? null : null,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = buat.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const db = getSupabaseServiceClient();
  const eventId = auth.scope.event.id;
  const { count } = await db.from("api_keys").select("id", { head: true, count: "exact" })
    .eq("event_id", eventId).is("revoked_at", null);
  if ((count ?? 0) >= MAKS_KUNCI_AKTIF) {
    return apiError("VALIDATION_ERROR", 422, { formErrors: [`This event already has ${MAKS_KUNCI_AKTIF} active keys. Revoke one first.`], fieldErrors: {} });
  }

  const { kunci, hash, awalan } = buatKunci();
  const kedaluwarsa = parsed.data.expires_in_days
    ? new Date(Date.now() + parsed.data.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const { data, error } = await db.from("api_keys").insert({
    event_id: eventId,
    name: parsed.data.name,
    scopes: [...new Set(parsed.data.scopes)],
    key_prefix: awalan,
    key_hash: hash,
    created_by: auth.user.id,
    expires_at: kedaluwarsa,
  } as never).select(KOLOM).single();
  if (error || !data) return apiError("INTERNAL_ERROR", 500);

  const baris = data as { id: string; name: string; scopes: string[]; expires_at: string | null };
  await db.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "api_key_create",
    payload: { id: baris.id, name: baris.name, scopes: baris.scopes, key_prefix: awalan, expires_at: baris.expires_at },
  } as never);

  return Response.json({ key: { ...(data as object), created_by_name: auth.user.username }, secret: kunci }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) return apiError("VALIDATION_ERROR", 422);

  const db = getSupabaseServiceClient();
  const { data, error } = await db.from("api_keys")
    .update({ revoked_at: new Date().toISOString(), revoked_by: auth.user.id } as never)
    .eq("event_id", auth.scope.event.id).eq("id", id).is("revoked_at", null)
    .select("id,name,key_prefix");
  if (error) return apiError("INTERNAL_ERROR", 500);
  const dicabut = (data ?? [])[0] as { id: string; name: string; key_prefix: string } | undefined;
  if (!dicabut) return apiError("VALIDATION_ERROR", 404, { formErrors: ["This key was not found or is already revoked. Reload the page."], fieldErrors: {} });

  await db.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "api_key_revoke",
    payload: dicabut,
  } as never);
  return Response.json({ ok: true });
}
