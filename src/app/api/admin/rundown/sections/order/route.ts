import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { SECTION_COLUMNS } from "@/lib/rundown";
import { susunUlangBagian } from "@/lib/rundown-urutan";

// Urutan bagian (tab) rundown. Admin saja.
//
// Klien mengirim seluruh id bagian acara dalam urutan barunya, sama seperti
// susun ulang baris: server menolak susunan dari data basi (bagian ditambah
// atau dihapus di tab lain) alih-alih menebak maksudnya.

const orderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(2).max(200),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data: rows, error: readError } = await client
    .from("rundown_sections")
    .select("id,sort_order")
    .eq("event_id", eventId);
  if (readError) return apiError("INTERNAL_ERROR", 500);

  const perubahan = susunUlangBagian((rows ?? []) as unknown as Array<{ id: number; sort_order: number }>, parsed.data.ids);
  if (!perubahan) {
    return apiError("VALIDATION_ERROR", 422, { message: "Sections were added or deleted elsewhere. Reload the page and try again." });
  }

  // Satu UPDATE per bagian yang berubah. Tanpa .select(): PostgREST lama bisa
  // mengembalikan [] untuk PATCH+select walau barisnya tertulis.
  for (const row of perubahan) {
    const { error } = await client
      .from("rundown_sections")
      .update({ sort_order: row.sort_order, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
      .eq("event_id", eventId)
      .eq("id", row.id);
    if (error) return apiError("INTERNAL_ERROR", 500);
  }

  if (perubahan.length > 0) {
    await client.from("audit_logs").insert({
      event_id: eventId,
      user_id: auth.user.id,
      action: "rundown_section_reorder",
      payload: { ids: parsed.data.ids, changes: perubahan },
    } as never);
  }

  const { data: sections, error } = await client
    .from("rundown_sections")
    .select(SECTION_COLUMNS)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ sections });
}
