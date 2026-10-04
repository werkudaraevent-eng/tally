import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { messagingAllowlist, normalizePhone } from "@/lib/pesan/alamat";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { undanganBelumAda } from "@/lib/undangan/data";
import { normalizeInviteEmail } from "@/lib/undangan/email";
import { emailHash, inviteSecretReady } from "@/lib/undangan/tanda";

/**
 * Tambah satu tamu undangan tanpa berkas. Memakai fungsi database yang sama
 * dengan Impor (satu baris, langsung disimpan), jadi aturan "sudah peserta",
 * "sudah diundang" dan penekanan tetap satu sumber. Tidak mengirim apa pun.
 */

const isian = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(254).optional().default(""),
  company: z.string().trim().max(160).optional().default(""),
  title: z.string().trim().max(160).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  attested: z.literal(true),
});

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  if (!inviteSecretReady()) return apiError("VALIDATION_ERROR", 503, { message: "INVITE_LINK_SECRET belum diisi di server." });

  const parsed = isian.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const salah = parsed.error.flatten().fieldErrors;
    const message = salah.attested ? "Centang pernyataan dulu." : salah.name ? "Nama wajib diisi." : "Periksa isian lagi.";
    return apiError("VALIDATION_ERROR", 422, { message });
  }
  const email = normalizeInviteEmail(parsed.data.email);
  if (!email.ok) return apiError("VALIDATION_ERROR", 422, { message: "Email tidak sah.", field: "email" });
  const hp = parsed.data.phone;
  if (hp && (/[a-z]/i.test(hp) || !normalizePhone(hp))) return apiError("VALIDATION_ERROR", 422, { message: "Nomor HP tidak sah.", field: "phone" });

  // Situs uji memakai database produksi: hanya untuk acara draf, ditandai uji.
  const situsUji = messagingAllowlist().mode !== "off";
  if (situsUji && auth.scope.event.status !== "draft") {
    return apiError("FORBIDDEN", 403, { message: "Dari situs uji, tamu hanya bisa ditambahkan ke acara draf, karena situs uji memakai database produksi." });
  }

  const { data, error } = await getSupabaseServiceClient().rpc("import_event_invitations" as never, {
    p_event_id: auth.scope.event.id,
    p_rows: [{
      row: 1,
      name: parsed.data.name.replace(/\s+/g, " "),
      email: email.email,
      company: parsed.data.company || null,
      title: parsed.data.title || null,
      phone: parsed.data.phone || null,
      email_hash: email.email ? emailHash(email.email) : null,
    }],
    p_dry_run: false,
    p_actor: auth.user.id,
    p_test: situsUji,
  } as never);
  if (undanganBelumAda(error)) return apiError("INVITATIONS_NOT_READY", 409);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }
  const hasil = data as { inserted: number; merged: number; already_participant: number; suppressed: number; possible_duplicates: number };
  const status = hasil.already_participant ? "sudah_peserta" : hasil.merged ? "digabung" : "ditambahkan";
  return Response.json({ status, suppressed: hasil.suppressed > 0, possible_duplicate: hasil.possible_duplicates > 0, test: situsUji });
}
