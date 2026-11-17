import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationFormConfig } from "@/lib/domain";
import { BATAS_CHECKPOINT_KLIEN, setujuiCheckpoint } from "@/lib/live/checkpoint-klien";
import { setujuiKunci } from "@/lib/live/kolom-klien";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Pertanyaan form tambahan mana yang jawabannya boleh dilihat klien (Viewer).
 *
 * Hanya admin. Disimpan di registration_form_config.client_fields sebagai
 * persetujuan {key, label, type} (lihat src/lib/live/kolom-klien.ts), tanpa
 * migrasi. Kunci divalidasi terhadap pertanyaan yang ADA di form sekarang dan
 * bukan unggahan berkas.
 *
 * registration_form_config juga ditulis penyunting form dan CMS halaman acara,
 * masing-masing menulis ulang seluruh JSON-nya. Supaya simpanan yang tumpang
 * tindih tidak saling menimpa (QA PR #102, H2), penulisan hanya terjadi kalau
 * updated_at masih sama dengan yang dibaca; kalau sudah berubah, baca ulang dan
 * terapkan sekali lagi, lalu menyerah dengan 409.
 *
 * `checkpoints` (opsional): id check-in point yang tampil sebagai kolom klien,
 * disimpan di registration_form_config.client_checkpoints dalam tulis yang
 * sama. Tidak dikirim = pilihan lama dibiarkan. Id divalidasi terhadap
 * attendance_sessions acara ini (lib/live/checkpoint-klien.ts).
 */
const bodySchema = z.object({
  keys: z.array(z.string().max(64)).max(100),
  checkpoints: z.array(z.number().int().positive()).max(BATAS_CHECKPOINT_KLIEN).optional(),
});

export async function PUT(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  let checkpoints: number[] | undefined;
  if (parsed.data.checkpoints) {
    const { data: sesi, error: galatSesi } = await client
      .from("attendance_sessions")
      .select("id")
      .eq("event_id", auth.scope.event.id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(1000);
    if (galatSesi) { console.error("Baca check-in point gagal:", galatSesi); return apiError("INTERNAL_ERROR", 500); }
    const hasil = setujuiCheckpoint(parsed.data.checkpoints, (sesi ?? []) as Array<{ id: number }>);
    if (hasil.unknown.length > 0) return apiError("VALIDATION_ERROR", 422, { message: "A check-in point you picked was deleted. Reload the page." });
    checkpoints = hasil.ids;
  }
  for (let percobaan = 0; percobaan < 2; percobaan++) {
    const { data: segar, error: galatBaca } = await client.from("events").select("registration_form_config,updated_at").eq("id", auth.scope.event.id).single();
    if (galatBaca || !segar) { console.error("Baca form gagal:", galatBaca); return apiError("INTERNAL_ERROR", 500); }
    const baca = segar as { registration_form_config: RegistrationFormConfig | null; updated_at: string };
    const config = (baca.registration_form_config ?? {}) as RegistrationFormConfig;

    const { approvals, unknown } = setujuiKunci(config, parsed.data.keys);
    if (unknown.length > 0) return apiError("VALIDATION_ERROR", 422, { fieldErrors: { keys: [`Unknown question: ${unknown.join(", ")}`] } });

    const { data: tertulis, error } = await client
      .from("events")
      .update({ registration_form_config: { ...config, client_fields: approvals, ...(checkpoints ? { client_checkpoints: checkpoints } : {}) }, updated_at: new Date().toISOString() } as never)
      .eq("id", auth.scope.event.id)
      .eq("updated_at", baca.updated_at)
      .select("id");
    if (error) { console.error("Simpan kolom klien gagal:", error); return apiError("INTERNAL_ERROR", 500); }
    if (!tertulis || tertulis.length === 0) continue; // disimpan pihak lain sejak dibaca

    await client.from("audit_logs").insert({
      event_id: auth.scope.event.id,
      user_id: auth.user.id,
      action: "client_columns_update",
      payload: { client_fields: approvals, ...(checkpoints ? { client_checkpoints: checkpoints } : {}) },
    } as never);
    return Response.json({ client_fields: approvals, client_checkpoints: checkpoints ?? null });
  }
  return apiError("CONFLICT", 409);
}
