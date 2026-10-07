import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationFormConfig } from "@/lib/domain";
import { pertanyaanUntukKlien } from "@/lib/live/data";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Pertanyaan form tambahan mana yang jawabannya boleh dilihat klien (Viewer).
 *
 * Hanya admin. Disimpan di registration_form_config.client_fields, tanpa
 * migrasi. Kunci divalidasi terhadap pertanyaan yang ADA di form sekarang dan
 * bukan unggahan berkas: berkas tidak pernah dibuka ke klien.
 *
 * Konfigurasi form dibaca ulang tepat sebelum ditulis (bukan dari salinan di
 * requireRequestEvent) supaya simpanan penyunting form yang baru saja masuk
 * tidak tertimpa versi lama.
 */
const bodySchema = z.object({ keys: z.array(z.string().max(64)).max(100) });

export async function PUT(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data: segar, error: galatBaca } = await client.from("events").select("registration_form_config").eq("id", auth.scope.event.id).single();
  if (galatBaca || !segar) { console.error("Baca form gagal:", galatBaca); return apiError("INTERNAL_ERROR", 500); }
  const config = ((segar as { registration_form_config: RegistrationFormConfig | null }).registration_form_config ?? {}) as RegistrationFormConfig;

  const boleh = new Set(pertanyaanUntukKlien(config).map((field) => field.key));
  const asing = parsed.data.keys.filter((key) => !boleh.has(key));
  if (asing.length > 0) return apiError("VALIDATION_ERROR", 422, { fieldErrors: { keys: [`Unknown question: ${asing.join(", ")}`] } });
  // Disimpan dalam urutan form, tanpa duplikat.
  const dipilih = new Set(parsed.data.keys);
  const client_fields = pertanyaanUntukKlien(config).map((field) => field.key).filter((key) => dipilih.has(key));

  const { error } = await client
    .from("events")
    .update({ registration_form_config: { ...config, client_fields }, updated_at: new Date().toISOString() } as never)
    .eq("id", auth.scope.event.id);
  if (error) { console.error("Simpan kolom klien gagal:", error); return apiError("INTERNAL_ERROR", 500); }

  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "client_columns_update",
    payload: { client_fields },
  } as never);

  return Response.json({ client_fields });
}
