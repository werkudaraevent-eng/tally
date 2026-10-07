import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationFormConfig } from "@/lib/domain";
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
 */
const bodySchema = z.object({ keys: z.array(z.string().max(64)).max(100) });

export async function PUT(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  for (let percobaan = 0; percobaan < 2; percobaan++) {
    const { data: segar, error: galatBaca } = await client.from("events").select("registration_form_config,updated_at").eq("id", auth.scope.event.id).single();
    if (galatBaca || !segar) { console.error("Baca form gagal:", galatBaca); return apiError("INTERNAL_ERROR", 500); }
    const baca = segar as { registration_form_config: RegistrationFormConfig | null; updated_at: string };
    const config = (baca.registration_form_config ?? {}) as RegistrationFormConfig;

    const { approvals, unknown } = setujuiKunci(config, parsed.data.keys);
    if (unknown.length > 0) return apiError("VALIDATION_ERROR", 422, { fieldErrors: { keys: [`Unknown question: ${unknown.join(", ")}`] } });

    const { data: tertulis, error } = await client
      .from("events")
      .update({ registration_form_config: { ...config, client_fields: approvals }, updated_at: new Date().toISOString() } as never)
      .eq("id", auth.scope.event.id)
      .eq("updated_at", baca.updated_at)
      .select("id");
    if (error) { console.error("Simpan kolom klien gagal:", error); return apiError("INTERNAL_ERROR", 500); }
    if (!tertulis || tertulis.length === 0) continue; // disimpan pihak lain sejak dibaca

    await client.from("audit_logs").insert({
      event_id: auth.scope.event.id,
      user_id: auth.user.id,
      action: "client_columns_update",
      payload: { client_fields: approvals },
    } as never);
    return Response.json({ client_fields: approvals });
  }
  return apiError("CONFLICT", 409);
}
