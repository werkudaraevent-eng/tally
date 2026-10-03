import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { galatRpc } from "@/lib/logistik/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Daftar centang barang di layar pemindai.
 *
 * GET dipanggil setelah pemindaian kehadiran berhasil: barang yang diperiksa
 * di sesi ini, ukuran peserta, dan apakah sudah pernah diambil (di sesi mana
 * pun). POST mencatat barang yang dicentang petugas.
 *
 * Terpisah dari `/api/attendance/scan` dengan sengaja: pemindaian kehadiran
 * adalah jalur hari-H yang sudah teruji, dan barang bisa diserahkan belakangan
 * (stok habis, ukuran ditukar) tanpa memindai ulang kehadirannya.
 *
 * Petugas scan tidak bisa membatalkan penyerahan. Yang bisa membatalkan juga
 * bisa menyerahkan dua kali; pembatalan hanya dari admin.
 */
const query = z.object({
  session_id: z.coerce.number().int().positive(),
  participant_id: z.string().uuid(),
});

const body = z.object({
  session_id: z.number().int().positive(),
  participant_id: z.string().uuid(),
  item_ids: z.array(z.number().int().positive()).min(1).max(30),
  lane_id: z.number().int().positive().nullish(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await getSupabaseServiceClient().rpc("pickup_checklist" as never, {
    p_event_id: auth.scope.event.id,
    p_session_id: parsed.data.session_id,
    p_participant_id: parsed.data.participant_id,
  } as never);
  if (error) return galatRpc(error);
  return Response.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { data, error } = await getSupabaseServiceClient().rpc("record_item_pickup" as never, {
    p_event_id: auth.scope.event.id,
    p_session_id: parsed.data.session_id,
    p_participant_id: parsed.data.participant_id,
    p_item_ids: parsed.data.item_ids,
    p_actor: auth.user.id,
    p_lane_id: parsed.data.lane_id ?? null,
  } as never);
  if (error) return galatRpc(error);
  return Response.json(data);
}
