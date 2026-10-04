import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { antrekan, muatPekerjaan, pesanGalatStasiun, setelanMeja } from "@/lib/badge/stasiun-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Pekerjaan cetak dari sisi HP pemindai (dan tombol Print again di stasiun).
 *
 * GET   ?id=1,2,3  status terbaru pekerjaan yang masih ditunggu HP ini.
 * POST            antrekan badge dengan sengaja (`ulang`): Print again,
 *                 Print badge untuk pemindaian ulang, dan Print again setelah
 *                 kedaluwarsa atau gagal. Selalu baris baru.
 * PATCH           pindahkan pekerjaan yang MASIH antre ke stasiun lain yang
 *                 tersambung. Yang sudah diambil tidak dipindah; jawabannya
 *                 adalah status sebenarnya, supaya HP menulis "already taken".
 */
const getSchema = z.object({
  id: z.string().regex(/^\d+(,\d+){0,19}$/),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"], { readOnly: true });
  if (auth.response) return auth.response;
  const parsed = getSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const ids = parsed.data.id.split(",").map(Number);
  return Response.json({ pekerjaan: await muatPekerjaan(auth.scope.event.id, ids) });
}

const postSchema = z.object({
  stasiun_id: z.number().int().positive(),
  participant_id: z.string().uuid(),
  lane_id: z.number().int().positive().nullish(),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const setelan = await setelanMeja(auth.scope.event.id);
  if (!setelan.siap) return apiError("STASIUN_NOT_READY", 409);

  const hasil = await antrekan({
    eventId: auth.scope.event.id,
    stasiunId: parsed.data.stasiun_id,
    participantId: parsed.data.participant_id,
    jenis: "ulang",
    userId: auth.user.id,
    laneId: parsed.data.lane_id ?? null,
  });
  if (hasil.galat || !hasil.pekerjaan) return apiError("VALIDATION_ERROR", 422, { message: hasil.galat ?? "The badge could not be queued." });
  return Response.json(hasil);
}

const patchSchema = z.object({
  id: z.number().int().positive(),
  stasiun_id: z.number().int().positive(),
});

export async function PATCH(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const { error } = await getSupabaseServiceClient().rpc("badge_cetak_pindah" as never, {
    p_event_id: auth.scope.event.id,
    p_job_id: parsed.data.id,
    p_stasiun_id: parsed.data.stasiun_id,
  } as never);
  if (error) return apiError("VALIDATION_ERROR", 422, { message: pesanGalatStasiun(String(error.message ?? "")) });
  const [pekerjaan] = await muatPekerjaan(auth.scope.event.id, [parsed.data.id]);
  if (!pekerjaan) return apiError("VALIDATION_ERROR", 404, { message: "This print job no longer exists." });
  return Response.json({ pekerjaan });
}
