import { after } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { messagingAllowlist, serverOrigin } from "@/lib/pesan/alamat";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { idSchema, loadBlast, pesanBelumAda } from "@/lib/pesan/api";
import { drainQueue, enqueueBlast } from "@/lib/pesan/mesin";
import { audienceSchema, countAudience, resolveAudience } from "@/lib/pesan/penerima";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { blastLinkOrigin } from "@/lib/domain-klien/asal";
import { invitationSendingReady } from "@/lib/undangan/data";

/**
 * Kirim (atau jadwalkan) satu draf, setelah panitia mengonfirmasi jumlahnya.
 *
 * `expected` adalah angka yang dilihat panitia di dialog. Bila jumlah penerima
 * sekarang berbeda, kiriman ditolak dan dialog memuat angka baru: email yang
 * sudah terkirim tidak bisa ditarik, jadi yang terkirim harus persis yang
 * disetujui.
 *
 * Pengiriman dimulai segera lewat `after` (setelah jawaban dikirim), tanpa
 * menunggu pg_cron; cron hanya jaring pengaman dan pelaksana jadwal.
 */

export const maxDuration = 60;

const schema = z.object({
  expected: z.number().int().min(0),
  scheduled_at: z.string().datetime({ offset: true }).nullable().default(null),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!idSchema.safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (!isEmailConfigured()) return apiError("EMAIL_NOT_CONFIGURED", 503);

  const event = auth.scope.event;
  const { blast, error } = await loadBlast(event.id, id);
  if (pesanBelumAda(error)) return apiError("MESSAGES_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!blast) return apiError("MESSAGE_NOT_FOUND", 404);
  if (blast.status !== "draf") return apiError("MESSAGE_NOT_DRAFT", 409);
  if (blast.channel !== "email") return apiError("MESSAGE_WHATSAPP_NOT_READY", 409);
  if (blast.kind === "invitation") {
    const siap = invitationSendingReady();
    if (!siap.ok) return apiError("INVITATION_SENDING_LOCKED", 409, { missing: siap.missing });
  }
  // Jadwal dikirim nanti oleh cron PRODUKSI dengan env produksi. Dari preview,
  // tautan undangannya dibuat dengan SESSION_SECRET preview dan bisa mati.
  if (parsed.data.scheduled_at && messagingAllowlist().mode !== "off") return apiError("MESSAGE_SCHEDULE_NOT_ALLOWED", 403);

  const hitung = countAudience(await resolveAudience(event, blast.kind, audienceSchema.parse(blast.audience ?? {})));
  if (hitung.email !== parsed.data.expected) return apiError("MESSAGE_COUNT_CHANGED", 409, { counts: hitung });
  if (parsed.data.scheduled_at && new Date(parsed.data.scheduled_at).getTime() < Date.now() - 60_000) {
    return apiError("VALIDATION_ERROR", 422, { scheduled_at: "Waktu kirim sudah lewat." });
  }

  const origin = serverOrigin(request);
  const hasil = await enqueueBlast(id, event, { scheduledAt: parsed.data.scheduled_at, origin, linkOrigin: await blastLinkOrigin(event.id) });
  if (hasil.status === "not_draft") return apiError("MESSAGE_NOT_DRAFT", 409);
  if (hasil.status === "empty") return apiError("MESSAGE_EMPTY", 409);

  await getSupabaseServiceClient().from("audit_logs").insert({
    event_id: event.id,
    user_id: auth.user.id,
    action: parsed.data.scheduled_at ? "message_schedule" : "message_send",
    payload: { id, title: blast.title, queued: hasil.queued, skipped: hasil.skipped, scheduled_at: parsed.data.scheduled_at },
  } as never);

  if (!parsed.data.scheduled_at) after(() => drainQueue(45_000, { origin, onlyBlast: id }).then(() => undefined));
  return Response.json(hasil);
}
