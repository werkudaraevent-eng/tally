import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { hapusFotoBagasi, titipanPeserta } from "@/lib/bagasi/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Bagasi satu peserta di panel detail daftar peserta.
 *
 * GET           semua catatan titipnya di acara ini, dari meja mana pun (juga
 *               meja yang saklarnya sudah dimatikan), dengan foto lewat signed
 *               URL lima menit seperti layar pemindai.
 * DELETE ?drop= hapus satu catatan, untuk uji coba yang diulang atau salah
 *               pindai. Isinya disalin ke `audit_logs` dulu, lalu fotonya ikut
 *               dihapus dari bucket. Check-in di sesi itu tidak disentuh.
 */

const paramsSchema = z.string().uuid();
const querySchema = z.object({ drop: z.string().regex(/^[1-9]\d{0,15}$/).transform(Number) });

async function pesertaAcara(eventId: string, id: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("participants").select("id,name").eq("event_id", eventId).eq("id", id).maybeSingle();
  if (error) return { response: apiError("INTERNAL_ERROR", 500) } as const;
  if (!data) return { response: apiError("PARTICIPANT_NOT_FOUND", 404) } as const;
  return { peserta: data as { id: string; name: string } } as const;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", 422);
  const hasil = await pesertaAcara(auth.scope.event.id, id.data);
  if ("response" in hasil) return hasil.response;
  try {
    const drops = await titipanPeserta(auth.scope.event.id, id.data, auth.user.id);
    // `mine` hanya berarti di meja ambil (Undo milik petugas itu).
    const tanpaMilik = drops.map((item) => ({ ...item, mine: undefined }));
    return Response.json({ drops: tanpaMilik }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!id.success || !query.success) return apiError("VALIDATION_ERROR", 422);
  const eventId = auth.scope.event.id;
  const hasil = await pesertaAcara(eventId, id.data);
  if ("response" in hasil) return hasil.response;

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("luggage_drops")
    .select("*")
    .eq("event_id", eventId)
    .eq("participant_id", id.data)
    .eq("id", query.data.drop)
    .maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", 500);
  // Sudah terhapus (tab lain, atau reset check-in): hasilnya sama dengan yang diminta.
  if (!data) return Response.json({ deleted: 0 });
  const baris = data as { id: number; session_id: number; bag_count: number; photo_path: string | null; recorded_at: string; recorded_by: string | null; handed_over_at?: string | null; handed_over_by?: string | null };

  // Audit dulu: kalau penulisannya gagal, tidak ada yang dihapus tanpa jejak.
  const { error: galatAudit } = await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "participant_luggage_reset",
    payload: {
      participant_id: hasil.peserta.id,
      participant_name: hasil.peserta.name,
      luggage: [{
        session_id: baris.session_id,
        bag_count: baris.bag_count,
        photo: Boolean(baris.photo_path),
        recorded_at: baris.recorded_at,
        recorded_by: baris.recorded_by,
        handed_over_at: baris.handed_over_at ?? null,
        handed_over_by: baris.handed_over_by ?? null,
      }],
    },
  } as never);
  if (galatAudit) return apiError("INTERNAL_ERROR", 500);

  const { data: terhapus, error: galat } = await client
    .from("luggage_drops").delete().eq("event_id", eventId).eq("id", baris.id).select("id");
  if (galat) return apiError("INTERNAL_ERROR", 500);
  await hapusFotoBagasi([baris.photo_path]);
  return Response.json({ deleted: terhapus?.length ?? 0 });
}
