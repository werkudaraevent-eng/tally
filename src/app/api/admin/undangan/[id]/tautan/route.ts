import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { linkOrigin } from "@/lib/domain-klien/asal";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { invitationUrl, loadInvitation } from "@/lib/undangan/data";
import { inviteSecretReady } from "@/lib/undangan/tanda";

/**
 * Tautan pribadi satu tamu: Salin tautan pribadi (`baru: false`) atau Buat
 * tautan baru (`baru: true`), yang mengganti nonce sehingga tautan lama,
 * termasuk yang sudah terkirim, berhenti bekerja.
 *
 * Buat tautan baru juga membuka lagi undangan yang pendaftarannya ditolak:
 * "tautannya mati sampai admin membukanya lagi".
 */

const schema = z.object({ baru: z.boolean().default(false) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  if (!inviteSecretReady()) return apiError("VALIDATION_ERROR", 503, { message: "INVITE_LINK_SECRET belum diisi di server." });
  const id = (await context.params).id;
  if (!z.string().uuid().safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422);

  const event = auth.scope.event;
  let inv = await loadInvitation(event.id, id);
  if (!inv) return apiError("INVITATION_NOT_FOUND", 404);
  if (inv.registered_at && !inv.rejected_at) return apiError("INVITATION_USED", 409);
  if (inv.rejected_at && !parsed.data.baru) {
    return apiError("INVITATION_USED", 409, { message: "Pendaftaran tamu ini ditolak, jadi tautannya mati. Buat tautan baru untuk membukanya lagi." });
  }

  if (parsed.data.baru) {
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const client = getSupabaseServiceClient();
    const { error } = await client
      .from("event_invitations")
      .update({
        link_nonce: nonce,
        link_opened_at: null,
        ...(inv.rejected_at ? { rejected_at: null, registered_at: null, registration_id: null, participant_id: null } : {}),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", id)
      .eq("event_id", event.id);
    if (error) return apiError("INTERNAL_ERROR", 500);
    await client.from("audit_logs").insert({
      event_id: event.id,
      user_id: auth.user.id,
      action: "invitation_new_link",
      payload: { id, reopened: Boolean(inv.rejected_at) },
    } as never);
    inv = { ...inv, link_nonce: nonce };
  }
  return Response.json({ url: invitationUrl(await linkOrigin(request, event.id), event.slug, inv) });
}
