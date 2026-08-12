import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Hapus satu daftar entri beserta isinya (ON DELETE CASCADE).
//
// Hadiah yang menunjuk daftar ini tidak ikut terhapus: kolomnya ON DELETE SET
// NULL, sehingga hadiahnya bertahan tanpa daftar dan tombol undi menolak dengan
// pesan yang jelas. Ini lebih baik daripada menghapus hadiah beserta seluruh
// setelan syarat dan brandingnya hanya karena daftar entrinya dibersihkan.

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: group } = await client.from("undian_entry_groups").select("id,name,note").eq("event_id", eventId).eq("id", id).maybeSingle();
  if (!group) return apiError("UNDIAN_ENTRY_GROUP_NOT_FOUND", 404);

  const { error } = await client.from("undian_entry_groups").delete().eq("event_id", eventId).eq("id", id);
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "undian_entry_group_delete",
    payload: { old: group, new: null },
  } as never);
  return Response.json({ ok: true });
}
