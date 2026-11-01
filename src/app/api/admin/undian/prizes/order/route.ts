import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Urutan undi hadiah.
//
// Urutan ini adalah run of show: panel operator menampilkan hadiah dalam urutan
// yang sama, dan "Hadiah berikutnya" mengikutinya. Satu hadiah dipindah satu
// langkah, lalu seluruh daftar dinomori ulang 0..n-1, supaya hadiah lama yang
// semuanya bernilai 0 (urutan dibuat) langsung mendapat nomor yang berurutan.

const schema = z.object({ id: z.number().int().positive(), move: z.enum(["up", "down"]) });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("undian_prizes")
    .select("id,sort_order,name")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("id");
  if (error || !data) return apiError("INTERNAL_ERROR", 500);

  const rows = data as { id: number; sort_order: number; name: string }[];
  const from = rows.findIndex((row) => Number(row.id) === parsed.data.id);
  if (from < 0) return apiError("UNDIAN_PRIZE_NOT_FOUND", 404);
  const to = parsed.data.move === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= rows.length) return Response.json({ order: rows.map((row) => Number(row.id)) });

  const next = [...rows];
  [next[from], next[to]] = [next[to], next[from]];

  // Hanya baris yang nomornya berubah yang ditulis. Setiap tulisan tetap dibatasi
  // event_id: id saja tidak cukup untuk menjamin baris itu milik event ini.
  const now = new Date().toISOString();
  for (const [index, row] of next.entries()) {
    if (row.sort_order === index) continue;
    const { error: updateError } = await client
      .from("undian_prizes")
      .update({ sort_order: index, updated_at: now, updated_by: auth.user.id } as never)
      .eq("event_id", eventId)
      .eq("id", row.id);
    if (updateError) return apiError("INTERNAL_ERROR", 500);
  }

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "undian_prize_reorder",
    payload: { prize: rows[from].name, move: parsed.data.move, order: next.map((row) => row.name) },
  } as never);
  return Response.json({ order: next.map((row) => Number(row.id)) });
}
