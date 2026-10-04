import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { BLAST_COLUMNS, type BlastRow } from "./mesin";

/** Tabel Pesan peserta belum ada: migrasi 202610030003 belum dijalankan. */
export function pesanBelumAda(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || /message_blast/.test(error.message ?? "");
}

export const idSchema = z.string().uuid();

export async function loadBlast(eventId: string, id: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("message_blasts")
    .select(BLAST_COLUMNS)
    .eq("id", id)
    .eq("event_id", eventId)
    .maybeSingle();
  return { blast: data as BlastRow | null, error };
}

/**
 * Mulai pelan Invitation: batas tahan dan alasan jeda. Dibaca terpisah dari
 * BLAST_COLUMNS supaya Pesan peserta tetap jalan sebelum migrasi 202610040007.
 */
export async function invitationBlastState(blastId: string): Promise<{ hold_until: string | null; paused_reason: string | null }> {
  const { data, error } = await getSupabaseServiceClient().from("message_blasts").select("hold_until,paused_reason").eq("id", blastId).maybeSingle();
  if (error || !data) return { hold_until: null, paused_reason: null };
  return data as unknown as { hold_until: string | null; paused_reason: string | null };
}

/** Hitungan status penerima satu kiriman, per status. */
export async function recipientCounts(blastId: string) {
  const client = getSupabaseServiceClient();
  const status = ["antre", "ditahan", "mengirim", "terkirim", "diterima", "dibaca", "tidak_pasti", "gagal_sementara", "gagal_tetap", "dilewati"] as const;
  const hasil = await Promise.all(
    status.map((s) => client.from("message_blast_recipients").select("id", { count: "exact", head: true }).eq("blast_id", blastId).eq("status", s)),
  );
  return Object.fromEntries(status.map((s, i) => [s, hasil[i].count ?? 0])) as Record<(typeof status)[number], number>;
}

/**
 * "Sudah masuk": penerima kiriman ini yang masuk ke area peserta setelah
 * kiriman berangkat, lewat tautan maupun kata sandi.
 */
export async function signedInCount(blast: Pick<BlastRow, "id" | "event_id" | "sent_at" | "kind">) {
  if (!blast.sent_at) return 0;
  const client = getSupabaseServiceClient();
  // Invitation: "Sudah daftar", tamu yang mendaftar setelah kiriman berangkat.
  if (blast.kind === "invitation") {
    const undangan: string[] = [];
    for (let dari = 0; ; dari += 1000) {
      const { data } = await client
        .from("message_blast_recipients")
        .select("invitation_id")
        .eq("blast_id", blast.id)
        .neq("status", "dilewati")
        .not("invitation_id", "is", null)
        .range(dari, dari + 999);
      undangan.push(...((data ?? []) as { invitation_id: string }[]).map((r) => r.invitation_id));
      if ((data ?? []).length < 1000) break;
    }
    let daftar = 0;
    for (let i = 0; i < undangan.length; i += 300) {
      const { count } = await client
        .from("event_invitations")
        .select("id", { count: "exact", head: true })
        .eq("event_id", blast.event_id)
        .in("id", undangan.slice(i, i + 300))
        .gte("registered_at", blast.sent_at);
      daftar += count ?? 0;
    }
    return daftar;
  }
  const ids: string[] = [];
  for (let dari = 0; ; dari += 1000) {
    const { data } = await client
      .from("message_blast_recipients")
      .select("participant_id")
      .eq("blast_id", blast.id)
      .neq("status", "dilewati")
      .not("participant_id", "is", null)
      .range(dari, dari + 999);
    ids.push(...((data ?? []) as { participant_id: string }[]).map((r) => r.participant_id));
    if ((data ?? []).length < 1000) break;
  }
  let jumlah = 0;
  for (let i = 0; i < ids.length; i += 300) {
    const { count } = await client
      .from("participant_accounts")
      .select("id", { count: "exact", head: true })
      .eq("event_id", blast.event_id)
      .in("participant_id", ids.slice(i, i + 300))
      .gte("last_login_at", blast.sent_at);
    jumlah += count ?? 0;
  }
  return jumlah;
}
