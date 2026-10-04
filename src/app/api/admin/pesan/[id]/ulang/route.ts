import { after } from "next/server";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { claimOrigins, serverOrigin } from "@/lib/pesan/alamat";
import { idSchema, loadBlast, pesanBelumAda } from "@/lib/pesan/api";
import { drainQueue } from "@/lib/pesan/mesin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * "Kirim ulang yang bisa dicoba": hanya penerima yang gagal sementara.
 * Gagal tetap (alamat tidak ada, berhenti berlangganan) dan tidak pasti tidak
 * pernah ikut; yang pertama perlu kontak diperbaiki, yang kedua mungkin sudah
 * menerima.
 */

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!idSchema.safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const event = auth.scope.event;
  const { blast, error } = await loadBlast(event.id, id);
  if (pesanBelumAda(error)) return apiError("MESSAGES_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!blast) return apiError("MESSAGE_NOT_FOUND", 404);
  if (blast.status === "draf" || blast.status === "dibatalkan") return apiError("MESSAGE_NOT_DRAFT", 409);
  // Kiriman hanya dikirim ulang dari server yang mengirimnya, dengan env-nya:
  // situs uji tidak menyentuh kiriman produksi, dan sebaliknya.
  const origin = serverOrigin(request);
  if (!claimOrigins(origin).includes(blast.site_origin ?? "")) {
    return apiError("MESSAGE_RETRY_NOT_ALLOWED", 403);
  }

  const client = getSupabaseServiceClient();
  const { data, error: galat } = await client.rpc("requeue_message_failures" as never, { p_blast: id } as never);
  if (galat) return apiError("INTERNAL_ERROR", 500);
  const jumlah = (data as number | null) ?? 0;
  await client.from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: "message_retry",
    payload: { id, requeued: jumlah },
  } as never);
  if (jumlah > 0) after(() => drainQueue(45_000, { origin, onlyBlast: id }).then(() => undefined));
  return Response.json({ requeued: jumlah });
}
