import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * "Undo import" untuk Import peserta (berkas biasa dan Read with AI).
 *
 * Jejaknya ditulis `import_participants` ke `participant_imports` (migrasi
 * 202611130030). Aturannya dijalankan `undo_participant_import` di database:
 * hanya impor terakhir yang belum dibatalkan, paling lama 7 hari, sekali.
 * Sebelum migrasi tabelnya tidak ada dan semua fungsi di sini menjawab
 * "tidak ada impor", jadi dialog impor tidak berubah.
 */

export type ImporPeserta = {
  id: number;
  file_name: string | null;
  created_at: string;
  user_name: string | null;
  ai: boolean;
  /** Hitungan dari impor itu: ditambah dan diubah. */
  inserted: number;
  updated: number;
};

export type AlasanTetap = "removed" | "changed" | "has_records";
export type HasilBatalPeserta = {
  removed: number;
  restored: number;
  kept: number;
  kept_list: Array<{ name: string | null; reason: AlasanTetap }>;
  kept_truncated: boolean;
};

const db = () => getSupabaseServiceClient();
const TUJUH_HARI = 7 * 24 * 60 * 60 * 1000;

type Baris = { id: number; file_name: string | null; created_at: string; user_id: string | null; ai_run_id: number | null; undone_at: string | null; counts: Record<string, number> | null };

export async function imporPesertaTerakhir(eventId: string): Promise<ImporPeserta | null> {
  const { data, error } = await db().from("participant_imports" as never)
    .select("id,file_name,created_at,user_id,ai_run_id,undone_at,counts")
    .eq("event_id", eventId).order("id", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const baris = data as Baris;
  if (baris.undone_at || Date.now() - new Date(baris.created_at).getTime() > TUJUH_HARI) return null;
  let nama: string | null = null;
  if (baris.user_id) {
    const { data: user } = await db().from("users").select("username").eq("id", baris.user_id).maybeSingle();
    nama = (user as { username?: string | null } | null)?.username ?? null;
  }
  return {
    id: baris.id,
    file_name: baris.file_name,
    created_at: baris.created_at,
    user_name: nama,
    ai: baris.ai_run_id !== null,
    inserted: Number(baris.counts?.inserted ?? 0),
    updated: Number(baris.counts?.updated ?? 0) + Number(baris.counts?.source_locked ?? 0),
  };
}

const BASI = ["IMPORT_NOT_FOUND", "IMPORT_ALREADY_UNDONE", "IMPORT_TOO_OLD", "IMPORT_NOT_LATEST"];

/** Pratinjau (`terapkan` false) atau undo. "STALE" = impor itu sudah tidak bisa di-undo. */
export async function batalkanImporPeserta(eventId: string, actor: string, id: number, terapkan: boolean): Promise<HasilBatalPeserta | "STALE" | "galat"> {
  const { data, error } = await db().rpc("undo_participant_import" as never, {
    p_event_id: eventId, p_import_id: id, p_dry_run: !terapkan, p_actor: actor,
  } as never);
  if (error) return BASI.some((kode) => String(error.message ?? "").includes(kode)) ? "STALE" : "galat";
  const hasil = data as HasilBatalPeserta;
  if (terapkan) {
    // Impor dari Read with AI dihitung "undone" di halaman AI.
    const { data: baris } = await db().from("participant_imports" as never).select("ai_run_id").eq("id", id).eq("event_id", eventId).maybeSingle();
    const run = (baris as { ai_run_id?: number | null } | null)?.ai_run_id;
    if (run) await db().from("ai_runs").update({ status: "undone", updated_at: new Date().toISOString() } as never).eq("id", run).eq("event_id", eventId);
  }
  return hasil;
}
