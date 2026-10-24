import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { BAGASI_MAKS, catatanBagasiStaf, sesiBagasi } from "@/lib/bagasi/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Jumlah bagasi di layar pemindai (sesi dengan Record luggage).
 *
 * GET: catatan peserta ini di sesi ini, bila sudah ada (scan ulang, meja yang
 * sama dipakai lagi saat ambil bagasi). POST: simpan jumlahnya.
 *
 * Jumlah dikirim TERPISAH dari foto, dan lebih dulu. Ia kiriman beberapa byte
 * yang tetap lolos di sinyal venue yang buruk; foto menyusul lewat
 * `/api/attendance/luggage/photo` dan boleh gagal tanpa menghilangkan jumlahnya.
 * Scanner tidak punya antrean offline, jadi urutan inilah yang menjaga bukti
 * utamanya.
 *
 * Petugas boleh mengubah jumlah (Edit): salah ketuk di meja harus bisa
 * dibetulkan di meja. Siapa dan kapan terakhir mengubah ikut tersimpan.
 */
const query = z.object({
  session_id: z.coerce.number().int().positive(),
  participant_id: z.string().uuid(),
});

const body = z.object({
  session_id: z.number().int().positive(),
  participant_id: z.string().uuid(),
  bag_count: z.number().int().min(0).max(BAGASI_MAKS),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const eventId = auth.scope.event.id;
  if (!(await sesiBagasi(eventId, parsed.data.session_id))) {
    return apiError("VALIDATION_ERROR", 422, { message: "This check-in point does not record luggage." });
  }
  try {
    return Response.json({ luggage: await catatanBagasiStaf(eventId, parsed.data.session_id, parsed.data.participant_id) });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const eventId = auth.scope.event.id;
  const { session_id, participant_id, bag_count } = parsed.data;
  if (!(await sesiBagasi(eventId, session_id))) {
    return apiError("VALIDATION_ERROR", 422, { message: "This check-in point does not record luggage, or it is closed." });
  }

  const db = getSupabaseServiceClient();
  const sekarang = new Date().toISOString();
  // Baris lama dipertahankan (recorded_at, recorded_by, foto); hanya jumlah dan
  // penanda ubahan yang ditimpa. Upsert biasa akan mengganti recorded_by dengan
  // petugas yang mengoreksi.
  const { data: lama, error: galatBaca } = await db
    .from("luggage_drops")
    .select("id")
    .eq("event_id", eventId)
    .eq("session_id", session_id)
    .eq("participant_id", participant_id)
    .maybeSingle();
  if (galatBaca) return apiError("INTERNAL_ERROR", 500);

  const ubah = () =>
    db
      .from("luggage_drops")
      .update({ bag_count, updated_at: sekarang, updated_by: auth.user.id } as never)
      .eq("event_id", eventId)
      .eq("session_id", session_id)
      .eq("participant_id", participant_id);

  let { error } = lama
    ? await ubah()
    : await db
        .from("luggage_drops")
        .insert({ event_id: eventId, session_id, participant_id, bag_count, recorded_by: auth.user.id, updated_by: auth.user.id } as never);
  // 23505: petugas lain menyimpan orang yang sama di antara baca dan tulis di
  // atas. Jumlah dari layar ini yang terakhir ditekan, jadi ia yang berlaku.
  if (error && String(error.code) === "23505") ({ error } = await ubah());

  if (error) {
    // 23503: peserta bukan milik acara ini (FK komposit).
    if (String(error.code) === "23503") return apiError("PARTICIPANT_NOT_FOUND", 404);
    return apiError("INTERNAL_ERROR", 500);
  }

  try {
    return Response.json({ luggage: await catatanBagasiStaf(eventId, session_id, participant_id) });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
