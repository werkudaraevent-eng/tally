import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { RegistrationFormConfig } from "@/lib/domain";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Agenda > Edit item > Who sees it > "Show <question> answers on the event page".
// Admin saja, dibatasi ke event permintaan. Yang diubah satu tanda per
// pertanyaan (`agenda_label` di registration_form_config), jadi berlaku untuk
// setiap baris Agenda yang memakai pertanyaan itu. Hanya dropdown dan pilihan
// tunggal. Tidak perlu migrasi.
//
//   PATCH {field, on}

const patchSchema = z.object({ field: z.string().regex(/^[a-z0-9_]{1,64}$/), on: z.boolean() });

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { field, on } = parsed.data;

  const client = getSupabaseServiceClient();
  // registration_form_config juga ditulis Registration, CMS halaman acara dan
  // Client view, masing-masing seluruh JSON-nya: tulis hanya bila updated_at
  // masih sama dengan yang dibaca, kalau berubah baca ulang dan coba sekali lagi.
  let tersimpan = event.registration_form_config as RegistrationFormConfig | null;
  let versi = event.updated_at;
  for (let percobaan = 0; ; percobaan++) {
    const fields = tersimpan?.fields ?? [];
    const indeks = fields.findIndex((isi) => isi.key === field);
    const kolom = fields[indeks];
    if (!kolom || (kolom.type !== "select" && kolom.type !== "radio")) return apiError("VALIDATION_ERROR", 422, { message: "Choose a dropdown or single-choice question." });
    if ((kolom.agenda_label === true) === on) return Response.json({ field, on });
    const { agenda_label: _lama, ...tanpa } = kolom;
    void _lama;
    const baru: RegistrationFormConfig = { ...tersimpan!, fields: fields.map((isi, i) => (i === indeks ? (on ? { ...tanpa, agenda_label: true } : tanpa) : isi)) };
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
    tersimpan = (segar as { registration_form_config: RegistrationFormConfig | null }).registration_form_config;
    versi = (segar as { updated_at: string }).updated_at;
  }

  await client.from("audit_logs").insert({ event_id: event.id, user_id: auth.user.id, action: "agenda_public_label_update", payload: { field, on } } as never);
  return Response.json({ field, on });
}
