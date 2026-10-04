import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { publicEventName } from "@/lib/domain";
import { sendEmail } from "@/lib/email/client";
import { allowedByList, normalizeAddress } from "@/lib/pesan/alamat";
import { idSchema, loadBlast, pesanBelumAda } from "@/lib/pesan/api";
import { fieldValues, renderEmail } from "@/lib/pesan/isi";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { linkOrigin } from "@/lib/domain-klien/asal";

/**
 * "Kirim tes…": satu email ke alamat yang diketik panitia.
 *
 * Akun admin tidak punya email, jadi alamatnya selalu diketik. Isinya memakai
 * data satu peserta sungguhan (supaya kolom isian terlihat terisi), tetapi
 * tautannya contoh yang tidak bisa dipakai masuk, subjeknya berawalan [TES],
 * dan tidak ada baris antrean atau token yang dibuat. Di luar produksi alamat
 * tes harus ada di MESSAGING_ALLOWLIST.
 */

const schema = z.object({ blast_id: z.string().uuid(), email: z.string().trim().email().max(200), sebagai: z.string().uuid().nullable().optional() });

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (!idSchema.safeParse(parsed.data.blast_id).success) return apiError("VALIDATION_ERROR", 422);

  const alamat = normalizeAddress(parsed.data.email);
  if (!alamat) return apiError("VALIDATION_ERROR", 422);
  if (!allowedByList(alamat)) return apiError("MESSAGE_TEST_NOT_ALLOWED", 403);

  const event = auth.scope.event;
  const { blast, error } = await loadBlast(event.id, parsed.data.blast_id);
  if (pesanBelumAda(error)) return apiError("MESSAGES_NOT_READY", 409);
  if (!blast) return apiError("MESSAGE_NOT_FOUND", 404);

  let contoh: { name: string; company: string | null } = { name: "Budi Santoso", company: null };
  if (parsed.data.sebagai) {
    const { data } = await getSupabaseServiceClient()
      .from("participants")
      .select("name,company")
      .eq("id", parsed.data.sebagai)
      .eq("event_id", event.id)
      .maybeSingle();
    if (data) contoh = data as typeof contoh;
  }

  const origin = await linkOrigin(request, event.id);
  const isi = renderEmail({
    kind: blast.kind,
    subject: blast.email_subject,
    body: blast.email_body,
    eventName: publicEventName(event),
    values: fieldValues(event, contoh),
    actionUrl: `${origin}/e/${encodeURIComponent(event.slug)}${blast.kind === "undangan" ? "/masuk?sandi=contoh-tidak-berlaku" : ""}`,
    unsubscribeUrl: null,
    test: true,
  });
  const hasil = await sendEmail({ eventId: event.id, to: alamat, ...isi });
  if (!hasil.ok) return hasil.error === "EMAIL_NOT_CONFIGURED" ? apiError("EMAIL_NOT_CONFIGURED", 503) : apiError("EMAIL_SEND_FAILED", 502, { error: hasil.error });
  return Response.json({ ok: true, to: alamat });
}
