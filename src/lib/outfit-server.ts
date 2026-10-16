import { bacaOutfit, type OutfitEntry } from "./outfit";
import { getSupabaseServiceClient } from "./supabase/service";

/**
 * Outfit per bagian Agenda yang diterbitkan, menurut id bagian.
 *
 * Kueri terpisah dari SECTION_COLUMNS, dan kembali kosong pada galat apa pun:
 * sebelum migrasi 202610160001 dijalankan kolomnya belum ada (42703), dan itu
 * tidak boleh menggagalkan portal peserta. Hanya dipanggil untuk Gathering
 * Horizon, jadi preset lain tidak mendapat kueri tambahan.
 */
export async function loadOutfitBagian(eventId: string): Promise<Map<number, OutfitEntry[]>> {
  try {
    const { data, error } = await getSupabaseServiceClient().from("rundown_sections").select("id,outfit").eq("event_id", eventId).eq("is_published", true);
    if (error || !data) return new Map();
    return new Map((data as unknown as Array<{ id: number; outfit?: unknown }>).map((baris) => [baris.id, bacaOutfit(baris.outfit)]));
  } catch {
    return new Map();
  }
}
