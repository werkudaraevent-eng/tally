import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { ITEM_COLUMNS } from "@/lib/rundown";
import { susunUlangSlot, type BarisUrut } from "@/lib/rundown-urutan";

// Urutan baris yang berjam mulai sama (sesi paralel). Admin saja.
//
// Jadwal tetap diurutkan menurut jam; yang bisa diatur admin hanya urutan di
// dalam satu slot jam. Klien mengirim seluruh id slot dalam urutan barunya,
// bukan "pindahkan X ke posisi N": dengan begitu server bisa menolak susunan
// yang dibuat dari data basi (jam baris sudah diubah di tab lain).

const orderSchema = z.object({
  section_id: z.number().int().positive(),
  ids: z.array(z.number().int().positive()).min(2).max(100),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data: rows, error: readError } = await client
    .from("rundown_items")
    .select("id,start_time,sort_order")
    .eq("event_id", eventId)
    .eq("section_id", parsed.data.section_id);
  if (readError) return apiError("INTERNAL_ERROR", 500);

  const baris = (rows ?? []) as unknown as BarisUrut[];
  if (baris.length === 0) return apiError("RUNDOWN_SECTION_NOT_FOUND", 404);

  const perubahan = susunUlangSlot(baris, parsed.data.ids);
  if (!perubahan) {
    return apiError("VALIDATION_ERROR", 422, { message: "These rows no longer share a start time. Reload the page and try again." });
  }

  // Satu UPDATE per baris yang berubah. Tanpa .select(): PostgREST lama bisa
  // mengembalikan [] untuk PATCH+select walau barisnya tertulis.
  for (const row of perubahan) {
    const { error } = await client
      .from("rundown_items")
      .update({ sort_order: row.sort_order, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
      .eq("event_id", eventId)
      .eq("section_id", parsed.data.section_id)
      .eq("id", row.id);
    if (error) return apiError("INTERNAL_ERROR", 500);
  }

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "rundown_item_reorder",
    payload: { section_id: parsed.data.section_id, ids: parsed.data.ids, changes: perubahan },
  } as never);

  const { data: items, error } = await client
    .from("rundown_items")
    .select(ITEM_COLUMNS)
    .eq("event_id", eventId)
    .eq("section_id", parsed.data.section_id);
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ items });
}
