import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { gatheringHorizon, type EventLandingConfig } from "@/lib/domain";
import { kolomOutfitBelumAda } from "@/lib/outfit";
import { bacaSasaran, kolomSasaran, SASARAN_NILAI_MAX, SASARAN_NILAI_PANJANG } from "@/lib/sasaran-bagian";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Untuk siapa tiap bagian Agenda (kolom rundown_sections.audience, migrasi
// 202610180002). Admin saja, dibatasi ke event permintaan, sama dengan /outfit.
//
// Rute sendiri dengan alasan yang sama dengan /outfit: sebelum migrasinya
// dijalankan, kolom yang belum ada hanya berarti `available: false` (GET) atau
// 409 (PATCH), bukan CMS Agenda yang gagal dimuat. Kode galat kolom hilang
// sama dengan outfit (42703 / PGRST204).

const patchSchema = z.object({
  id: z.number().int().positive(),
  audience: z
    .object({
      field: z.string().regex(/^[a-z0-9_]{1,64}$/),
      values: z.array(z.string().trim().min(1).max(SASARAN_NILAI_PANJANG)).min(1).max(SASARAN_NILAI_MAX),
    })
    .nullable(),
});

/**
 * Sasaran tiap bagian, dan kolom peserta yang bisa dipakai: pertanyaan pilihan
 * (dropdown atau radio) beserta pilihannya, termasuk kolom khusus staf.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const dasar = {
    horizon: gatheringHorizon((event.landing_config ?? {}) as EventLandingConfig),
    fields: kolomSasaran(event.registration_form_config),
  };

  const { data, error } = await getSupabaseServiceClient().from("rundown_sections").select("id,audience").eq("event_id", event.id);
  if (error) {
    if (kolomOutfitBelumAda(error)) return Response.json({ ...dasar, available: false, sections: [] });
    return apiError("INTERNAL_ERROR", 500);
  }
  return Response.json({
    ...dasar,
    available: true,
    sections: ((data ?? []) as unknown as Array<{ id: number; audience?: unknown }>).map((baris) => ({ id: baris.id, audience: bacaSasaran(baris.audience) })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id } = parsed.data;
  // Hanya kolom pilihan acara ini, dan hanya pilihannya: kunci lain bisa
  // menampilkan jawaban kolom staf yang tidak dimaksudkan untuk peserta.
  let audience = parsed.data.audience ? bacaSasaran(parsed.data.audience) : null;
  if (audience) {
    const kolom = kolomSasaran(event.registration_form_config).find((isi) => isi.key === audience!.field);
    if (!kolom) return apiError("VALIDATION_ERROR", 422, { field: "unknown" });
    const values = audience.values.filter((nilai) => kolom.options.includes(nilai));
    if (values.length !== audience.values.length) return apiError("VALIDATION_ERROR", 422, { values: "unknown" });
    audience = { field: audience.field, values };
  }

  const client = getSupabaseServiceClient();
  const { data: current, error: galatBaca } = await client.from("rundown_sections").select("id,audience").eq("event_id", event.id).eq("id", id).maybeSingle();
  if (galatBaca) return kolomOutfitBelumAda(galatBaca) ? apiError("AUDIENCE_NOT_READY", 409) : apiError("INTERNAL_ERROR", 500);
  if (!current) return apiError("RUNDOWN_SECTION_NOT_FOUND", 404);

  const { data, error } = await client
    .from("rundown_sections")
    .update({ audience, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
    .eq("event_id", event.id)
    .eq("id", id)
    .select("id,audience")
    .single();
  if (error) {
    if (kolomOutfitBelumAda(error)) return apiError("AUDIENCE_NOT_READY", 409);
    return error.code === "23514" ? apiError("VALIDATION_ERROR", 422) : apiError("INTERNAL_ERROR", 500);
  }

  await client.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "rundown_section_audience_update",
    payload: { id, old: (current as { audience?: unknown }).audience ?? null, new: audience },
  } as never);
  const baris = data as unknown as { id: number; audience?: unknown };
  return Response.json({ id: baris.id, audience: bacaSasaran(baris.audience) });
}
