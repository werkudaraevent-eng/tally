import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { InviteStatus } from "@/lib/pesan/label";
import { inviteLinkToken, inviteSecretReady } from "./tanda";

/**
 * Data tamu undangan di server. Tabelnya hanya bisa dibaca service role.
 *
 * Kolom setelan (`events.registration_access`, `invitation_auto_approve`)
 * sengaja TIDAK ditambahkan ke EVENT_COLUMNS: kode ini bisa tayang sebelum
 * migrasi 202610040007 dijalankan, dan EVENT_COLUMNS ikut di setiap resolusi
 * acara. Dibaca terpisah, dengan nilai bawaan bila kolomnya belum ada.
 */

export type InvitationRow = {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  email_norm: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  link_nonce: string;
  link_opened_at: string | null;
  registration_id: string | null;
  registered_at: string | null;
  participant_id: string | null;
  opted_out_at: string | null;
  email_invalid_at: string | null;
  rejected_at: string | null;
  deleted_at: string | null;
  is_test: boolean;
  created_at: string;
};

export const INVITATION_COLUMNS =
  "id,event_id,name,email,email_norm,company,title,phone,link_nonce,link_opened_at,registration_id,registered_at,participant_id,opted_out_at,email_invalid_at,rejected_at,deleted_at,is_test,created_at";

export type InvitationSettings = {
  /** Migrasi 202610040007 sudah dijalankan. */
  ready: boolean;
  access: "terbuka" | "undangan";
  autoApprove: boolean;
};

/** Tabel undangan belum ada: migrasi 202610040007 belum dijalankan. */
export function undanganBelumAda(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || error.code === "PGRST204" || /event_invitations|registration_access|invitation_auto_approve/.test(error.message ?? "");
}

export async function invitationSettings(eventId: string): Promise<InvitationSettings> {
  const { data, error } = await getSupabaseServiceClient()
    .from("events")
    .select("registration_access,invitation_auto_approve")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return { ready: false, access: "terbuka", autoApprove: true };
  const row = data as unknown as { registration_access: string; invitation_auto_approve: boolean };
  return { ready: true, access: row.registration_access === "undangan" ? "undangan" : "terbuka", autoApprove: row.invitation_auto_approve };
}

export async function loadInvitation(eventId: string, id: string): Promise<InvitationRow | null> {
  const { data } = await getSupabaseServiceClient()
    .from("event_invitations")
    .select(INVITATION_COLUMNS)
    .eq("id", id)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as InvitationRow | null) ?? null;
}

export function invitationUrl(origin: string, slug: string, inv: Pick<InvitationRow, "id" | "event_id" | "link_nonce">) {
  return `${origin}/e/${encodeURIComponent(slug)}/daftar?undangan=${inviteLinkToken(inv.event_id, inv.id, inv.link_nonce)}`;
}

/**
 * Invitation boleh dikirim lewat email: subdomain pengirim terpisah sudah diisi
 * (setelah Resend Pro) dan rahasia tautan ada. Webhook wajib, karena mulai
 * pelan menilai daftar dari kabar pantulan dan laporan spam.
 */
export function invitationSendingReady(): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.EMAIL_FROM_UNDANGAN?.trim()) missing.push("EMAIL_FROM_UNDANGAN");
  if (!inviteSecretReady()) missing.push("INVITE_LINK_SECRET");
  if (!process.env.RESEND_WEBHOOK_SECRET?.trim()) missing.push("RESEND_WEBHOOK_SECRET");
  return missing.length ? { ok: false, missing } : { ok: true };
}

const HALAMAN = 1000;

export async function allInvitations(eventId: string): Promise<InvitationRow[]> {
  const client = getSupabaseServiceClient();
  const hasil: InvitationRow[] = [];
  for (let dari = 0; ; dari += HALAMAN) {
    const { data, error } = await client
      .from("event_invitations")
      .select(INVITATION_COLUMNS)
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .order("created_at")
      .order("id")
      .range(dari, dari + HALAMAN - 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    hasil.push(...((data ?? []) as InvitationRow[]));
    if ((data ?? []).length < HALAMAN) return hasil;
  }
}

export type SendState = {
  /** Kiriman terakhir yang punya hasil gagal (bukan dilewati). */
  lastFailed: { reason: string | null } | null;
  sent: boolean;
  queued: boolean;
};

/**
 * Keadaan kiriman per undangan, dari baris `message_blast_recipients` (bukan
 * kolom salinan), supaya tidak meleset saat kirim ulang. Baris dilewati
 * diabaikan.
 */
export async function sendStates(eventId: string): Promise<Map<string, SendState>> {
  const client = getSupabaseServiceClient();
  const peta = new Map<string, SendState>();
  for (let dari = 0; ; dari += HALAMAN) {
    const { data, error } = await client
      .from("message_blast_recipients")
      .select("id,invitation_id,status,reason")
      .eq("event_id", eventId)
      .not("invitation_id", "is", null)
      .neq("status", "dilewati")
      .order("id")
      .range(dari, dari + HALAMAN - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: number; invitation_id: string; status: string; reason: string | null }[];
    for (const r of rows) {
      const s = peta.get(r.invitation_id) ?? { lastFailed: null, sent: false, queued: false };
      if (["antre", "ditahan", "mengirim"].includes(r.status)) s.queued = true;
      else if (["terkirim", "diterima", "dibaca"].includes(r.status)) {
        s.sent = true;
        s.lastFailed = null;
      } else if (["gagal_tetap", "gagal_sementara", "tidak_pasti"].includes(r.status)) s.lastFailed = { reason: r.reason };
      peta.set(r.invitation_id, s);
    }
    if (rows.length < HALAMAN) return peta;
  }
}

/** Status yang ditampilkan, mengikuti urutan di rekomendasi (Sudah daftar paling atas). */
export function invitationStatus(inv: Pick<InvitationRow, "registered_at" | "rejected_at" | "link_opened_at">, s: SendState | undefined): InviteStatus {
  if (inv.rejected_at) return "ditolak";
  if (inv.registered_at) return "sudah_daftar";
  if (s?.lastFailed) return "gagal";
  if (inv.link_opened_at) return "membuka";
  if (s?.sent) return "terkirim";
  if (s?.queued) return "terjadwal";
  return "belum_dikirim";
}
