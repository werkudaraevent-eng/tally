import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { INVITATION_COLUMNS, loadInvitation, undanganBelumAda } from "@/lib/undangan/data";
import { normalizeInviteEmail } from "@/lib/undangan/email";

/** Ubah data atau hapus satu tamu undangan (menu baris). */

const ubahSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().max(200).nullable().optional(),
  company: z.string().trim().max(160).nullable().optional(),
  title: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

type Konteks = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Konteks) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!z.string().uuid().safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const parsed = ubahSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const event = auth.scope.event;
  const ada = await loadInvitation(event.id, id);
  if (!ada) return apiError("INVITATION_NOT_FOUND", 404);

  const ubah: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) ubah.name = parsed.data.name.replace(/\s+/g, " ");
  for (const kunci of ["company", "title", "phone"] as const) {
    if (parsed.data[kunci] !== undefined) ubah[kunci] = parsed.data[kunci] || null;
  }
  if (parsed.data.email !== undefined) {
    const email = normalizeInviteEmail(parsed.data.email);
    if (!email.ok) return apiError("VALIDATION_ERROR", 422, { email: email.reason === "dua_alamat" ? "Isi satu alamat saja." : "Email tidak sah." });
    if (email.email !== ada.email_norm) {
      // Alamat baru = orang yang mungkin berbeda: tanda berhenti dan memantul
      // milik alamat lama tidak ikut. Penekanan per acara tetap dicek saat kirim.
      ubah.email = email.email;
      ubah.opted_out_at = null;
      ubah.email_invalid_at = null;
    }
  }

  const { data, error } = await getSupabaseServiceClient()
    .from("event_invitations")
    .update(ubah as never)
    .eq("id", id)
    .eq("event_id", event.id)
    .is("deleted_at", null)
    .select(INVITATION_COLUMNS)
    .maybeSingle();
  if (undanganBelumAda(error)) return apiError("INVITATIONS_NOT_READY", 409);
  if (error?.code === "23505") return apiError("VALIDATION_ERROR", 422, { email: "Email ini sudah ada di daftar tamu." });
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) return apiError("INVITATION_NOT_FOUND", 404);
  return Response.json({ ok: true });
}

/**
 * Hapus = soft delete. Tautan pribadinya langsung mati (fungsi pendaftaran
 * menolak undangan yang dihapus), dan email yang sama bisa diimpor ulang.
 */
export async function DELETE(request: Request, context: Konteks) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const id = (await context.params).id;
  if (!z.string().uuid().safeParse(id).success) return apiError("VALIDATION_ERROR", 422);
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("event_invitations")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("event_id", auth.scope.event.id)
    .is("deleted_at", null)
    .select("id,name")
    .maybeSingle();
  if (undanganBelumAda(error)) return apiError("INVITATIONS_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) return apiError("INVITATION_NOT_FOUND", 404);
  await client.from("audit_logs").insert({
    event_id: auth.scope.event.id,
    user_id: auth.user.id,
    action: "invitation_delete",
    payload: { id, name: (data as { name: string }).name },
  } as never);
  return Response.json({ ok: true });
}
