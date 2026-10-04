import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import type { EventRow } from "@/lib/domain";
import { publicEventName } from "@/lib/domain";
import { isEmailConfigured } from "@/lib/email/client";
import { memberConfig } from "@/lib/member/account";
import { messagingAllowlist } from "@/lib/pesan/alamat";
import { idSchema, loadBlast, pesanBelumAda, recipientCounts, signedInCount } from "@/lib/pesan/api";
import { fieldValues, renderEmail, unknownFields } from "@/lib/pesan/isi";
import { BLAST_COLUMNS, type BlastRow } from "@/lib/pesan/mesin";
import { audienceSchema, companies, countAudience, resolveAudience } from "@/lib/pesan/penerima";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { linkOrigin } from "@/lib/domain-klien/asal";

/**
 * Satu kiriman. Draf: isi penyusun, hitungan penerima, dan pratinjau email.
 * Sudah dikirim: ringkasan status untuk laporan.
 */

const ubahSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(["undangan", "info"]).optional(),
  audience: audienceSchema.optional(),
  email_subject: z.string().max(200).optional(),
  email_body: z.string().max(5000).optional(),
});

type Konteks = { params: Promise<{ id: string }> };

/** Hitungan penerima + pratinjau untuk penyusun dan dialog konfirmasi. */
async function ringkasDraf(event: EventRow, blast: BlastRow, origin: string, sebagai: string | null) {
  const audience = audienceSchema.parse(blast.audience ?? {});
  const penerima = await resolveAudience(event, blast.kind, audience);
  const hitung = countAudience(penerima);
  const contoh = penerima.find((p) => p.participant.id === sebagai) ?? penerima.find((p) => !p.skip) ?? penerima[0] ?? null;
  const nama = publicEventName(event);
  const pratinjau = renderEmail({
    kind: blast.kind,
    subject: blast.email_subject,
    body: blast.email_body,
    eventName: nama,
    values: fieldValues(event, { name: contoh?.participant.name ?? "Budi Santoso", company: contoh?.participant.company ?? null }),
    actionUrl: `${origin}/e/${encodeURIComponent(event.slug)}${blast.kind === "undangan" ? "/masuk?sandi=contoh-tidak-berlaku" : ""}`,
    unsubscribeUrl: `${origin}/api/pesan/berhenti?contoh`,
  });
  return {
    counts: hitung,
    sample: contoh ? { id: contoh.participant.id, name: contoh.participant.name, email: contoh.email } : null,
    sample_options: penerima.filter((p) => !p.skip).slice(0, 50).map((p) => ({ id: p.participant.id, name: p.participant.name })),
    preview: pratinjau,
    unknown_fields: [...unknownFields(blast.email_subject), ...unknownFields(blast.email_body)],
  };
}

export async function GET(request: Request, context: Konteks) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!idSchema.safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const event = auth.scope.event;
  const { blast, error } = await loadBlast(event.id, id);
  if (pesanBelumAda(error)) return apiError("MESSAGES_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!blast) return apiError("MESSAGE_NOT_FOUND", 404);

  const dasar = {
    blast,
    email_configured: isEmailConfigured(),
    member_enabled: Boolean(memberConfig(event)),
    test_mode: messagingAllowlist().mode,
    time_zone: event.time_zone,
  };
  if (blast.status === "draf") {
    const sebagai = new URL(request.url).searchParams.get("sebagai");
    const [ringkas, perusahaan] = await Promise.all([ringkasDraf(event, blast, await linkOrigin(request, event.id), sebagai), companies(event.id)]);
    return Response.json({ ...dasar, draft: ringkas, companies: perusahaan });
  }
  const [counts, masuk] = await Promise.all([recipientCounts(blast.id), signedInCount(blast)]);
  return Response.json({ ...dasar, counts, signed_in: masuk });
}

export async function PATCH(request: Request, context: Konteks) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!idSchema.safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const parsed = ubahSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const event = auth.scope.event;
  const { data, error } = await getSupabaseServiceClient()
    .from("message_blasts")
    .update({ ...parsed.data, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("event_id", event.id)
    .eq("status", "draf")
    .select(BLAST_COLUMNS)
    .maybeSingle();
  if (pesanBelumAda(error)) return apiError("MESSAGES_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) {
    const { blast } = await loadBlast(event.id, id);
    return blast ? apiError("MESSAGE_NOT_DRAFT", 409) : apiError("MESSAGE_NOT_FOUND", 404);
  }
  const blast = data as BlastRow;
  const sebagai = new URL(request.url).searchParams.get("sebagai");
  return Response.json({ blast, draft: await ringkasDraf(event, blast, await linkOrigin(request, event.id), sebagai) });
}

export async function DELETE(request: Request, context: Konteks) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!idSchema.safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const { data, error } = await getSupabaseServiceClient()
    .from("message_blasts")
    .delete()
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .eq("status", "draf")
    .select("id")
    .maybeSingle();
  if (pesanBelumAda(error)) return apiError("MESSAGES_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) return apiError("MESSAGE_NOT_DRAFT", 409);
  return Response.json({ ok: true });
}
