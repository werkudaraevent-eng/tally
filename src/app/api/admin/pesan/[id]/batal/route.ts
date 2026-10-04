import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { idSchema, pesanBelumAda } from "@/lib/pesan/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Batalkan kiriman terjadwal yang belum berangkat, atau sisa kiriman
 * Invitation yang dijeda. Kiriman yang sedang berjalan tidak bisa dibatalkan
 * dari sini.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!idSchema.safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("message_blasts")
    .update({ status: "dibatalkan", updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .or("and(status.eq.terjadwal,scheduled_at.not.is.null),status.eq.dijeda")
    .select("id")
    .maybeSingle();
  if (pesanBelumAda(error)) return apiError("MESSAGES_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) return apiError("MESSAGE_NOT_DRAFT", 409);
  // Tautan undangan kiriman ini tidak pernah terkirim: hapus, dan antreannya
  // ditutup supaya laporan tidak menampilkan "Antre" selamanya. Undangan lama
  // peserta tetap berlaku karena hanya dicabut saat undangan baru terkirim.
  await client.from("participant_account_tokens").delete().eq("blast_id", id).is("used_at", null);
  await client
    .from("message_blast_recipients")
    .update({ status: "dilewati", reason_code: "jadwal_dibatalkan", reason: "Kiriman dibatalkan", updated_at: new Date().toISOString() } as never)
    .eq("blast_id", id)
    .in("status", ["antre", "ditahan"]);
  await client.from("audit_logs").insert({ event_id: auth.scope.event.id, user_id: auth.user.id, action: "message_cancel", payload: { id } } as never);
  return Response.json({ ok: true });
}
