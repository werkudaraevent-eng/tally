import { after } from "next/server";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { serverOrigin } from "@/lib/pesan/alamat";
import { idSchema, invitationBlastState, loadBlast, pesanBelumAda } from "@/lib/pesan/api";
import { drainQueue } from "@/lib/pesan/mesin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { invitationSendingReady } from "@/lib/undangan/data";

/**
 * Lanjutkan kiriman Invitation yang dijeda mulai pelan (pantulan tinggi,
 * laporan spam, atau kabar pengiriman belum cukup). Panitia yang memutuskan,
 * dan setelah ini kiriman tersebut tidak dinilai otomatis lagi.
 */

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!idSchema.safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const siap = invitationSendingReady();
  if (!siap.ok) return apiError("INVITATION_SENDING_LOCKED", 409, { missing: siap.missing });

  const { blast, error } = await loadBlast(auth.scope.event.id, id);
  if (pesanBelumAda(error)) return apiError("MESSAGES_NOT_READY", 409);
  if (!blast) return apiError("MESSAGE_NOT_FOUND", 404);
  if (blast.status !== "dijeda") return apiError("MESSAGE_NOT_PAUSED", 409);

  const client = getSupabaseServiceClient();
  const { paused_reason } = await invitationBlastState(id);
  const { data, error: galat } = await client.rpc("resume_invitation_blast" as never, { p_event_id: auth.scope.event.id, p_blast: id } as never);
  if (galat) return apiError("INTERNAL_ERROR", 500);
  if ((data as number) < 0) return apiError("MESSAGE_NOT_PAUSED", 409);
  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "message_resume",
    payload: { id, released: data, reason: paused_reason },
  } as never);

  const origin = blast.site_origin ?? serverOrigin(request);
  after(() => drainQueue(45_000, { origin, onlyBlast: id }).then(() => undefined));
  return Response.json({ ok: true, released: data });
}
