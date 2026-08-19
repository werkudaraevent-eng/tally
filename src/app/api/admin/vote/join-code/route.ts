import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Kode gabung acara: lihat dan ganti.
 *
 * Terpisah dari `/api/admin/vote/settings` meski dipakai di panel yang sama.
 * Alasannya bukan kerapian: kodenya milik baris `events`, bukan milik tampilan
 * layar voting, dan kelak dipakai juga oleh layar publik lain. Menaruhnya di
 * endpoint setelan voting akan membuat rundown atau denah yang ingin memakainya
 * harus melewati alamat bernama "setelan voting".
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;

  const { data } = await getSupabaseServiceClient()
    .from("events").select("join_code").eq("id", auth.scope.event.id).maybeSingle();

  return Response.json({ join_code: (data as { join_code: string | null } | null)?.join_code ?? null });
}

/**
 * Terbitkan kode baru.
 *
 * POST dan bukan PATCH ber-nilai: kodenya dibuat server, bukan dipilih klien.
 * Membiarkan admin mengetik kode sendiri membuka dua masalah sekaligus — angka
 * yang mudah ditebak ("1234567") dan tabrakan yang harus dijelaskan lewat pesan
 * galat, padahal tidak ada yang benar-benar peduli pada angkanya.
 */
export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const { data, error } = await getSupabaseServiceClient().rpc("set_event_join_code" as never, {
    p_event_id: auth.scope.event.id,
    p_actor: auth.user.id,
  } as never);
  if (error) return apiError(mapDatabaseError(error), 500);

  return Response.json({ join_code: data });
}
