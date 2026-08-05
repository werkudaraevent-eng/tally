import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { SESSION_COLUMNS } from "../route";

// Tutup sesi (arsip) dan hapus permanen.
//
// -------------------------------------------------------------------------
// DUA OPERASI, DUA TINGKAT IZIN
// -------------------------------------------------------------------------
// PATCH close  — admin. Hasil TETAP tersimpan dan tetap bisa diekspor; yang
//                berubah hanya statusnya, sehingga pemenangnya berhenti
//                menghalangi undian sesi berikutnya. Tidak ada yang hilang, jadi
//                aman dijalankan operator acara.
//
// DELETE       — super_admin. Baris pemenang benar-benar dibuang. Dipakai hanya
//                untuk membersihkan sisa gladi bersih.
//
// Pemisahan izin ini mengikuti /api/admin/reset yang sudah ada: klien memegang
// role `admin` dan tidak membutuhkan operasi yang tidak dapat dibalik untuk
// menjalankan acara.

const patchSchema = z.object({
  action: z.literal("close"),
  note: z.string().trim().max(300).optional(),
});

const deleteSchema = z.object({
  // Frasa konfirmasi, pola yang sama dengan /api/admin/reset. Tombol yang bisa
  // ditekan tidak sengaja tidak boleh menghapus catatan serah terima hadiah.
  confirm: z.literal("HAPUS HASIL UNDIAN"),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("undian_sessions").select(SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (!current) return apiError("UNDIAN_SESSION_NOT_FOUND", 404);
  if ((current as { status: string }).status === "closed") return apiError("UNDIAN_SESSION_CLOSED", 409);

  // Pemenang yang masih `pending` dilaporkan, bukan diubah otomatis.
  //
  // Menutup sesi sambil diam-diam menandai semuanya sah akan mencatat hadiah
  // sebagai terserahkan padahal orangnya mungkin tidak pernah naik panggung.
  // Angka ini dikembalikan supaya layar dapat memperingatkan sebelum konfirmasi.
  const { count: pendingCount } = await client
    .from("undian_winners")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id)
    .eq("status", "pending");

  const now = new Date().toISOString();
  const { data, error } = await client
    .from("undian_sessions")
    .update({
      status: "closed",
      closed_at: now,
      closed_by: auth.user.id,
      ...(parsed.data.note !== undefined ? { note: parsed.data.note.trim() || null } : {}),
    } as never)
    .eq("id", id)
    .select(SESSION_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  // Layar panggung dikembalikan ke keadaan diam. Membiarkan pemenang sesi yang
  // baru ditutup tetap tampil membuat penonton mengira undian masih berlangsung.
  await client
    .from("undian_state")
    .update({
      mode: "off", phase: "idle", session_id: null, active_prize_id: null,
      pending: null, pool: null, pool_frozen_at: null, pool_size: 0,
      spin_started_at: null, reveal_at: null,
      updated_at: now, updated_by: auth.user.id,
    } as never)
    .eq("id", 1);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "undian_session_close",
    payload: { old: current, new: { ...(data as object), pending_winners: pendingCount ?? 0 } },
  } as never);

  return Response.json({ ...(data as object), pending_winners: pendingCount ?? 0 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  // super_admin saja: menghapus catatan serah terima hadiah tidak dapat dibalik,
  // dan klien tidak membutuhkannya untuk menjalankan acara. Aturan yang sama
  // dengan /api/admin/reset.
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("undian_sessions").select(SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (!current) return apiError("UNDIAN_SESSION_NOT_FOUND", 404);

  // Seluruh isi disalin ke audit SEBELUM dihapus.
  //
  // Ini satu-satunya jejak yang tersisa sesudahnya. Tanpa itu, "siapa menghapus
  // hasil undian dan apa isinya" tidak dapat dijawab siapa pun — dan justru
  // pertanyaan itulah yang muncul ketika ada yang mempersoalkan hasil.
  const { data: winners } = await client
    .from("undian_winners")
    .select("id,prize_id,draw_round,display_name,company,seat_label,is_backup,slot_order,status,drawn_at")
    .eq("session_id", id)
    .order("drawn_at");

  const { error, count } = await client
    .from("undian_winners")
    .delete({ count: "exact" })
    .eq("session_id", id);
  if (error) return apiError("INTERNAL_ERROR", 500);

  const { error: sessionError } = await client.from("undian_sessions").delete().eq("id", id);
  if (sessionError) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "undian_session_delete",
    payload: { old: { session: current, winners: winners ?? [] }, new: null },
  } as never);

  return Response.json({ ok: true, deleted_winners: count ?? 0 });
}
