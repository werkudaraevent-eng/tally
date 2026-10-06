import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

/** 500 hapus dengan 8 sekaligus selesai jauh di bawah batas ini. */
export const maxDuration = 60;
const SEKALIGUS = 8;

type Alasan = "source_locked" | "in_use" | "not_found" | "failed";

/**
 * Hapus banyak peserta sekaligus dari daftar yang dicentang.
 *
 * Satu per satu lewat `delete_participant`, bukan satu DELETE ... WHERE id IN:
 * fungsi itulah yang menolak peserta Scanner API dan peserta yang punya order
 * atau menang undian, dan menulis jejak audit per orang. Aturan yang sama dengan
 * tombol Hapus di panel detail, tidak ada jalan pintas kedua.
 *
 * Satu yang ditolak tidak membatalkan yang lain; jawabannya merinci berapa yang
 * terhapus dan kenapa sisanya dilewati.
 */
export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const client = getSupabaseServiceClient();
  const skipped: Record<Alasan, number> = { source_locked: 0, in_use: 0, not_found: 0, failed: 0 };
  let deleted = 0;

  // Beberapa sekaligus, bukan satu per satu: 500 panggilan berurutan dari
  // Vercel ke Supabase (30-60 ms sekali jalan) bisa melewati batas waktu fungsi
  // di tengah jalan. Tiap panggilan tetap transaksinya sendiri.
  const antrean = [...new Set(body.data.ids)];
  const kerja = async () => {
    for (let id = antrean.shift(); id; id = antrean.shift()) {
      const { error } = await client.rpc("delete_participant" as never, {
        p_event_id: auth.scope.event.id,
        p_id: id,
        p_actor: auth.user.id,
      } as never);
      if (!error) { deleted += 1; continue; }
      const code = mapDatabaseError(error);
      if (code === "PARTICIPANT_SOURCE_LOCKED") skipped.source_locked += 1;
      else if (code === "PARTICIPANT_IN_USE") skipped.in_use += 1;
      else if (code === "PARTICIPANT_NOT_FOUND") skipped.not_found += 1;
      else skipped.failed += 1;
    }
  };
  await Promise.all(Array.from({ length: SEKALIGUS }, kerja));

  return Response.json({ deleted, skipped });
}
