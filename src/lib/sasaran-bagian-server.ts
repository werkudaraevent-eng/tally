import { bacaSasaran, type SasaranBagian } from "./sasaran-bagian";
import { getSupabaseServiceClient } from "./supabase/service";

/**
 * Sasaran tiap bagian Agenda yang diterbitkan, menurut id bagian.
 *
 * Kueri terpisah dari loadAgendaPreview (halaman publik tidak perlu tahu
 * sasarannya), dan kembali kosong pada galat apa pun: sebelum migrasi
 * 202610180002 dijalankan kolomnya belum ada (42703), dan itu tidak boleh
 * menggagalkan portal peserta.
 */
export async function loadSasaranBagian(eventId: string): Promise<Map<number, SasaranBagian>> {
  try {
    const { data, error } = await getSupabaseServiceClient().from("rundown_sections").select("id,audience").eq("event_id", eventId).eq("is_published", true);
    if (error || !data) return new Map();
    const hasil = new Map<number, SasaranBagian>();
    for (const baris of data as unknown as Array<{ id: number; audience?: unknown }>) {
      const sasaran = bacaSasaran(baris.audience);
      if (sasaran) hasil.set(baris.id, sasaran);
    }
    return hasil;
  } catch {
    return new Map();
  }
}

/**
 * Sasaran bagian dan jawaban peserta di kolom-kolom yang dipakai sasaran,
 * dibaca bersamaan. Hanya kunci itu yang dikembalikan, bukan seluruh `extra`,
 * jadi kolom staf lain tidak pernah sampai ke halaman peserta.
 */
export async function loadSasaranPeserta(eventId: string, participantId: string): Promise<{ sasaran: Map<number, SasaranBagian>; jawaban: Record<string, unknown> }> {
  const [sasaran, extra] = await Promise.all([loadSasaranBagian(eventId), loadExtraPeserta(eventId, participantId)]);
  const kunci = new Set([...sasaran.values()].map((isi) => isi.field));
  return { sasaran, jawaban: Object.fromEntries(Object.entries(extra).filter(([key]) => kunci.has(key))) };
}

export async function loadExtraPeserta(eventId: string, participantId: string): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await getSupabaseServiceClient().from("participants").select("extra").eq("id", participantId).eq("event_id", eventId).maybeSingle();
    if (error || !data) return {};
    return ((data as { extra?: Record<string, unknown> | null }).extra ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}
