import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Setelan kehadiran tingkat acara.
 *
 * Terpisah dari `/api/admin/attendance`, yang PATCH-nya mengubah satu SESI dan
 * karenanya selalu menuntut `id`. Menyisipkan cabang "kalau id tidak ada berarti
 * yang dimaksud setelan acara" ke dalam handler itu membuat permintaan yang
 * kehilangan `id` karena bug di klien diam-diam menulis ke tempat lain.
 *
 * Hanya `admin`. Petugas scan adalah pihak yang DIBATASI oleh setelan ini, jadi
 * ia tidak boleh menjadi pihak yang mengubahnya.
 */

const patchSchema = z.object({
  attendance_allow_walk_in: z.boolean(),
});

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("events")
    .update({ attendance_allow_walk_in: parsed.data.attendance_allow_walk_in } as never)
    .eq("id", auth.scope.event.id)
    .select("attendance_allow_walk_in")
    .single();

  if (error) return apiError("INTERNAL_ERROR", 500);

  // Dicatat, bukan diubah diam-diam: ini izin yang membolehkan akun paling
  // sempit di sistem membuat baris peserta baru. Ketika daftar peserta setelah
  // acara memuat nama yang tidak dikenali siapa pun, pertanyaan pertamanya
  // adalah kapan izin ini dinyalakan dan oleh siapa.
  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "attendance_walk_in_toggled",
    payload: { allow: parsed.data.attendance_allow_walk_in },
  } as never);

  return Response.json(data);
}
