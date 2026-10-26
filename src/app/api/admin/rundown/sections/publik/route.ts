import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { kolomOutfitBelumAda } from "@/lib/outfit";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Show before sign-in tiap bagian Agenda (kolom rundown_sections.show_before_sign_in,
// migrasi 202610260001). Admin saja, dibatasi ke event permintaan, sama dengan /sasaran.
//
// Rute sendiri dengan alasan yang sama dengan /outfit dan /sasaran: sebelum
// migrasinya dijalankan, kolom yang belum ada hanya berarti `available: false`
// (GET) atau 409 (PATCH), bukan CMS Agenda yang gagal dimuat.

const patchSchema = z.object({
  id: z.number().int().positive(),
  show_before_sign_in: z.boolean(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const { data, error } = await getSupabaseServiceClient().from("rundown_sections").select("id,show_before_sign_in").eq("event_id", auth.scope.event.id);
  if (error) {
    if (kolomOutfitBelumAda(error)) return Response.json({ available: false, sections: [] });
    return apiError("INTERNAL_ERROR", 500);
  }
  return Response.json({
    available: true,
    sections: ((data ?? []) as unknown as Array<{ id: number; show_before_sign_in?: boolean | null }>).map((baris) => ({ id: baris.id, show_before_sign_in: baris.show_before_sign_in !== false })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, show_before_sign_in } = parsed.data;

  const client = getSupabaseServiceClient();
  const { data: current, error: galatBaca } = await client.from("rundown_sections").select("id,show_before_sign_in").eq("event_id", event.id).eq("id", id).maybeSingle();
  if (galatBaca) return kolomOutfitBelumAda(galatBaca) ? apiError("PUBLIC_DAY_NOT_READY", 409) : apiError("INTERNAL_ERROR", 500);
  if (!current) return apiError("RUNDOWN_SECTION_NOT_FOUND", 404);

  const { data, error } = await client
    .from("rundown_sections")
    .update({ show_before_sign_in, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
    .eq("event_id", event.id)
    .eq("id", id)
    .select("id,show_before_sign_in")
    .single();
  if (error) return kolomOutfitBelumAda(error) ? apiError("PUBLIC_DAY_NOT_READY", 409) : apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "rundown_section_public_update",
    payload: { id, old: (current as { show_before_sign_in?: boolean | null }).show_before_sign_in ?? null, new: show_before_sign_in },
  } as never);
  const baris = data as unknown as { id: number; show_before_sign_in?: boolean | null };
  return Response.json({ id: baris.id, show_before_sign_in: baris.show_before_sign_in !== false });
}
