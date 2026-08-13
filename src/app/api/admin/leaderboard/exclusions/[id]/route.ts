import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Ubah dan hapus satu aturan pengecualian leaderboard.
//
// PATCH sengaja hanya mengizinkan `is_active` dan `reason`. Sasarannya (kata
// kunci / peserta) tidak bisa diubah: mengubah sasaran adalah keputusan yang
// berbeda, dan menimpanya di baris yang sama menghapus jejak siapa pernah
// menggugurkan siapa. Untuk ganti sasaran, hapus lalu buat baru.

const COLUMNS = "id,company_keyword,participant_id,reason,is_active,created_at,created_by";

const patchSchema = z.object({
  is_active: z.boolean().optional(),
  reason: z.string().trim().max(300).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  // Filter event digabung ke query pencarian, bukan diperiksa terpisah sesudahnya:
  // baris milik event lain jadi "tidak ditemukan" dengan sendirinya, dan tidak ada
  // pemeriksaan yang bisa terlupa saat handler ini diubah nanti.
  const { data: current } = await client.from("leaderboard_exclusions").select(COLUMNS).eq("event_id", eventId).eq("id", id).maybeSingle();
  if (!current) return apiError("VALIDATION_ERROR", 404);

  const { data, error } = await client
    .from("leaderboard_exclusions")
    .update({
      ...parsed.data,
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason?.trim() || null } : {}),
    } as never)
    .eq("event_id", eventId)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) return apiError(mapDatabaseError(error), 500);

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "leaderboard_exclusion_update",
    payload: { old: current, new: data },
  } as never);
  return Response.json(data);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("leaderboard_exclusions").select(COLUMNS).eq("event_id", eventId).eq("id", id).maybeSingle();
  if (!current) return apiError("VALIDATION_ERROR", 404);

  const { error } = await client.from("leaderboard_exclusions").delete().eq("event_id", eventId).eq("id", id);
  if (error) return apiError(mapDatabaseError(error), 500);

  // Isi baris yang dihapus disimpan utuh di payload audit. Setelah acara,
  // "kenapa perusahaan X ikut tampil" hanya bisa dijawab kalau aturan yang
  // pernah ada — dan siapa yang mencabutnya — masih terbaca.
  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "leaderboard_exclusion_delete",
    payload: { old: current, new: null },
  } as never);
  return Response.json({ ok: true });
}
