import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { gatheringHorizon, type EventLandingConfig } from "@/lib/domain";
import { bacaOutfit, kolomOutfitBelumAda, outfitSchema, tautkanOutfit, type BarisOutfit } from "@/lib/outfit";
import { konteksTautan } from "@/lib/outfit-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Outfit per bagian Agenda (kolom rundown_sections.outfit, migrasi 202610160001).
// Admin saja, dibatasi ke event permintaan, sama dengan /sections.
//
// Rute sendiri, bukan kolom tambahan di SECTION_COLUMNS: sebelum migrasinya
// dijalankan, kolom yang disebut di SECTION_COLUMNS menggagalkan seluruh CMS
// Agenda dan halaman /rundown. Di sini kolom yang belum ada hanya berarti
// `available: false` (GET) atau 409 (PATCH).

const patchSchema = z.object({
  id: z.number().int().positive(),
  outfit: outfitSchema,
});

/** 422 dengan alasan yang dibaca admin di kaki panel dan toast. */
const tolak = (message: string) => apiError("VALIDATION_ERROR", 422, { message });

/** Outfit tiap bagian event ini, label halamannya, dan apakah acaranya Gathering Horizon. */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const landing = (auth.scope.event.landing_config ?? {}) as EventLandingConfig;
  const dasar = { horizon: gatheringHorizon(landing), label: landing.member?.outfit_label ?? null };

  const { data, error } = await getSupabaseServiceClient().from("rundown_sections").select("id,outfit").eq("event_id", auth.scope.event.id);
  if (error) {
    if (kolomOutfitBelumAda(error)) return Response.json({ ...dasar, available: false, sections: [] });
    return apiError("INTERNAL_ERROR", 500);
  }
  return Response.json({
    ...dasar,
    available: true,
    sections: ((data ?? []) as unknown as Array<{ id: number; outfit?: unknown }>).map((baris) => ({ id: baris.id, outfit: bacaOutfit(baris.outfit) })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, outfit } = parsed.data;

  const client = getSupabaseServiceClient();
  const { data: current, error: galatBaca } = await client.from("rundown_sections").select("id,outfit,event_date").eq("event_id", eventId).eq("id", id).maybeSingle();
  if (galatBaca) return kolomOutfitBelumAda(galatBaca) ? apiError("OUTFIT_NOT_READY", 409) : apiError("INTERNAL_ERROR", 500);
  if (!current) return apiError("RUNDOWN_SECTION_NOT_FOUND", 404);
  const bagian = current as unknown as { outfit?: unknown; event_date: string | null };

  // Baris yang ditautkan dicari hanya di bagian ini dan acara ini: baris tab
  // lain, atau id dari acara asal sebuah salinan, tidak ditemukan. Label batch
  // dari tab bertanggal sama yang dibuka peserta, sama dengan portal.
  let barisTab: ReadonlyMap<number, BarisOutfit> = new Map();
  let label: string | null = null;
  if (outfit.some((isian) => isian.item_id)) {
    const konteks = await konteksTautan(eventId, { id, event_date: bagian.event_date });
    if (!konteks) return apiError("INTERNAL_ERROR", 500);
    ({ baris: barisTab, label } = konteks);
  }

  // Aturan per isian di tautkanOutfit (diuji di outfit.check.ts).
  const tersimpan = new Map(bacaOutfit(bagian.outfit).flatMap((isian) => (isian.item_id ? [[isian.item_id, isian.when] as const] : [])));
  const keputusan = tautkanOutfit(outfit, tersimpan, barisTab, label);
  if ("alasan" in keputusan) return tolak(keputusan.alasan);
  const simpan = keputusan.isian;

  const { data, error } = await client
    .from("rundown_sections")
    .update({ outfit: simpan, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
    .eq("event_id", eventId)
    .eq("id", id)
    .select("id,outfit")
    .single();
  if (error) {
    if (kolomOutfitBelumAda(error)) return apiError("OUTFIT_NOT_READY", 409);
    // 23514: constraint rundown_sections_outfit_check (lebih dari tiga isian).
    return error.code === "23514" ? apiError("VALIDATION_ERROR", 422) : apiError("INTERNAL_ERROR", 500);
  }

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "rundown_section_outfit_update",
    payload: { id, old: bagian.outfit ?? null, new: simpan },
  } as never);
  const baris = data as unknown as { id: number; outfit?: unknown };
  return Response.json({ id: baris.id, outfit: bacaOutfit(baris.outfit) });
}
