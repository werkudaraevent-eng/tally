import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { stasiunBelumAda } from "@/lib/badge/stasiun-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Satu putaran polling stasiun: perpanjang lease, sapu antrean, ambil satu.
 *
 * Data peserta ikut di jawaban yang sama: stasiun harus bisa menggambar badge
 * begitu pekerjaannya diambil, dan permintaan kedua di jaringan venue adalah
 * kesempatan kedua untuk gagal setelah pekerjaan sudah berstatus `diambil`.
 */
const bodySchema = z.object({
  stasiun_id: z.number().int().positive(),
  token: z.string().uuid(),
});

type Ambil =
  | { status: "ok"; job: { id: number; participant_id: string | null; jenis: string; created_at: string } }
  | { status: "tidak_ada" | "kosong" | "sibuk" | "dijeda" }
  | { status: "lease_hilang"; sejak: string | null };

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data, error, status } = await client.rpc("badge_cetak_ambil" as never, {
    p_event_id: auth.scope.event.id,
    p_stasiun_id: parsed.data.stasiun_id,
    p_token: parsed.data.token,
  } as never);
  if (error) return stasiunBelumAda(error, status) ? apiError("STASIUN_NOT_READY", 409) : apiError("INTERNAL_ERROR", 500);

  const hasil = data as Ambil;
  if (hasil.status !== "ok" || !hasil.job.participant_id) return Response.json({ ...hasil, peserta: null });

  const { data: peserta } = await client
    .from("participants")
    .select("id,name,company,title,qr_code")
    .eq("event_id", auth.scope.event.id)
    .eq("id", hasil.job.participant_id)
    .maybeSingle();
  return Response.json({ ...hasil, peserta: peserta ?? null });
}
