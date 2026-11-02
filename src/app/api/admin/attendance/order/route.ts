import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Urutan sesi check-in.
//
// Satu urutan dipakai di mana-mana: pilihan "Check-in point" di pemindai,
// daftar sesi di admin, Dashboard, dan saringan peserta. Semua sudah membaca
// `sort_order, id`; yang belum ada hanya cara mengubahnya. Satu sesi dipindah
// satu langkah, lalu seluruh daftar dinomori ulang 0..n-1, supaya sesi lama
// yang bernomor sama (atau berlubang setelah dihapus) langsung berurutan.
// Pola yang sama dengan urutan undi hadiah (undian/prizes/order).

const schema = z.object({ id: z.number().int().positive(), move: z.enum(["up", "down"]) });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("attendance_sessions")
    .select("id,sort_order,name")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("id");
  if (error || !data) return apiError("INTERNAL_ERROR", 500);

  const rows = data as { id: number; sort_order: number; name: string }[];
  const from = rows.findIndex((row) => Number(row.id) === parsed.data.id);
  if (from < 0) return apiError("VALIDATION_ERROR", 404, { message: "This session no longer exists. Reload the page." });
  const to = parsed.data.move === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= rows.length) return Response.json({ order: rows.map((row) => Number(row.id)) });

  const next = [...rows];
  [next[from], next[to]] = [next[to], next[from]];

  // Hanya baris yang nomornya berubah yang ditulis, tetap dibatasi event_id.
  const now = new Date().toISOString();
  for (const [index, row] of next.entries()) {
    if (row.sort_order === index) continue;
    const { error: updateError } = await client
      .from("attendance_sessions")
      .update({ sort_order: index, updated_at: now } as never)
      .eq("event_id", eventId)
      .eq("id", row.id);
    if (updateError) return apiError("INTERNAL_ERROR", 500);
  }

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "attendance_session_reorder",
    payload: { session: rows[from].name, move: parsed.data.move, order: next.map((row) => row.name) },
  } as never);
  return Response.json({ order: next.map((row) => Number(row.id)) });
}
