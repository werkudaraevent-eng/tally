import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { bolehJadiNomorBagasi, kunciBaruNomorBagasi, setelanNomorBagasi } from "@/lib/bagasi/nomor";
import type { RegistrationField, RegistrationFormConfig } from "@/lib/domain";
import { MAX_CUSTOM_FIELDS } from "@/lib/registration-fields";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Check-in > sesi > Luggage > Luggage number. Admin saja, dibatasi ke event
// permintaan. Menunjuk satu pertanyaan sebagai nomor bagasi acara ini
// (`luggage_number_field` di registration_form_config), atau membuat
// pertanyaan "Luggage number" baru (khusus panitia, teks) lalu menunjuknya.
// Tidak perlu migrasi. Lihat src/lib/bagasi/nomor.ts.
//
//   PATCH {field: "<kunci>" | null}   pilih atau lepas
//   PATCH {create: true}              buat pertanyaan baru dan pilih

const patchSchema = z.union([
  z.object({ field: z.string().regex(/^[a-z0-9_]{1,64}$/).nullable() }),
  z.object({ create: z.literal(true) }),
]);

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  // registration_form_config juga ditulis Registration, CMS halaman acara,
  // Agenda dan Client view, masing-masing seluruh JSON-nya: tulis hanya bila
  // updated_at masih sama dengan yang dibaca, kalau berubah baca ulang dan coba
  // sekali lagi (pola rundown/items/label).
  let tersimpan = (event.registration_form_config ?? {}) as RegistrationFormConfig;
  let versi = event.updated_at;
  let baru: RegistrationFormConfig;
  let dibuat: string | null = null;
  for (let percobaan = 0; ; percobaan++) {
    const fields = tersimpan.fields ?? [];
    if ("create" in parsed.data) {
      if (fields.length >= MAX_CUSTOM_FIELDS) {
        return apiError("VALIDATION_ERROR", 422, { message: `This event already has ${MAX_CUSTOM_FIELDS} questions. Choose one of them, or remove one in Registration.` });
      }
      dibuat = kunciBaruNomorBagasi(tersimpan);
      const pertanyaan: RegistrationField = { key: dibuat, label: "Luggage number", type: "text", required: false, on_form: false };
      baru = { ...tersimpan, fields: [...fields, pertanyaan], luggage_number_field: dibuat };
    } else if (parsed.data.field === null) {
      const { luggage_number_field: _lama, ...tanpa } = tersimpan;
      void _lama;
      if (!tersimpan.luggage_number_field) return Response.json(setelanNomorBagasi(tersimpan));
      baru = tanpa;
    } else {
      const kunci = parsed.data.field;
      const kolom = fields.find((isi) => isi.key === kunci);
      if (!kolom || !bolehJadiNomorBagasi(kolom)) {
        return apiError("VALIDATION_ERROR", 422, { message: "Choose a short text, number, dropdown or single-choice question." });
      }
      if (tersimpan.luggage_number_field === kunci) return Response.json(setelanNomorBagasi(tersimpan));
      baru = { ...tersimpan, luggage_number_field: kunci };
    }
    const hasil = await client
      .from("events")
      .update({ registration_form_config: baru, updated_at: new Date().toISOString() } as never)
      .eq("id", event.id)
      .eq("updated_at", versi)
      .select("id")
      .maybeSingle();
    if (hasil.error) return apiError("INTERNAL_ERROR", 500);
    if (hasil.data) break;
    if (percobaan >= 1) return apiError("CONFLICT", 409);
    const { data: segar, error: galatBaca } = await client.from("events").select("registration_form_config,updated_at").eq("id", event.id).single();
    if (galatBaca || !segar) return apiError("INTERNAL_ERROR", 500);
    tersimpan = ((segar as { registration_form_config: RegistrationFormConfig | null }).registration_form_config ?? {}) as RegistrationFormConfig;
    versi = (segar as { updated_at: string }).updated_at;
  }

  await client.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "luggage_number_field_update",
    payload: { field: baru.luggage_number_field ?? null, ...(dibuat ? { created: dibuat } : {}) },
  } as never);
  return Response.json(setelanNomorBagasi(baru));
}
