import { bacaOutfit, labelTabOutfit, teksWaktuOutfit, type OutfitEntry } from "./outfit";
import { getSupabaseServiceClient } from "./supabase/service";

/**
 * Label batch tab ini untuk teksWaktuOutfit ("Batch 1"), dari tab bertanggal
 * sama di acara ini, termasuk yang masih draf. Gagal dibaca = tanpa label:
 * judulnya tetap utuh, bukan salah.
 */
export async function labelBatchTab(eventId: string, tab: { id: number; event_date: string | null }): Promise<string | null> {
  if (!tab.event_date) return null;
  const { data, error } = await getSupabaseServiceClient()
    .from("rundown_sections")
    .select("id,name,title,event_date")
    .eq("event_id", eventId)
    .eq("event_date", tab.event_date)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error || !data) return null;
  return labelTabOutfit(data as unknown as Array<{ id: number; name: string | null; title: string | null; event_date: string | null }>, tab.id);
}

const menautKe = (isian: unknown, itemId: number) => Boolean(isian && typeof isian === "object" && (isian as { item_id?: unknown }).item_id === itemId);

/**
 * Isian Dress code yang menaut ke satu baris, sesudah baris itu diubah atau
 * dihapus. Ditulis ke jsonb apa adanya (hanya isian bertaut yang disentuh),
 * hanya di bagian baris itu dan acara ini: acara salinan membawa id baris lama.
 *
 * Tanpa transaksi dan tanpa foreign key, jadi ini tulisan kedua sesudah
 * barisnya tersimpan. Gagal tidak menggagalkan permintaan: peserta tetap
 * membaca teks tersimpan, dan editor menyebut barisnya "Item not found".
 * Hasil: isian bagian itu sesudah ditulis, atau null bila tidak ada yang ditulis.
 */
async function ubahIsianBaris(
  eventId: string,
  userId: string,
  sectionId: number,
  itemId: number,
  alasan: "item_updated" | "item_deleted",
  ubah: (daftar: unknown[], section: { event_date: string | null }) => Promise<unknown[]>,
): Promise<OutfitEntry[] | null> {
  try {
    const client = getSupabaseServiceClient();
    const { data, error } = await client.from("rundown_sections").select("id,outfit,event_date").eq("event_id", eventId).eq("id", sectionId).maybeSingle();
    // Kolom outfit belum ada (migrasi 202610160001) atau bagiannya hilang: tidak ada tautan.
    if (error || !data) return null;
    const baris = data as unknown as { outfit?: unknown; event_date: string | null };
    const lama = baris.outfit;
    if (!Array.isArray(lama) || !lama.some((isian) => menautKe(isian, itemId))) return null;
    const baru = await ubah(lama, baris);
    if (JSON.stringify(baru) === JSON.stringify(lama)) return null;
    const { data: hasil, error: galat } = await client
      .from("rundown_sections")
      .update({ outfit: baru, updated_at: new Date().toISOString(), updated_by: userId } as never)
      .eq("event_id", eventId)
      .eq("id", sectionId)
      .select("id,outfit")
      .single();
    if (galat || !hasil) return null;
    await client.from("audit_logs").insert({
      event_id: eventId,
      user_id: userId,
      action: "rundown_section_outfit_update",
      payload: { id: sectionId, item_id: itemId, reason: alasan, old: lama, new: baru },
    } as never);
    return bacaOutfit((hasil as unknown as { outfit?: unknown }).outfit);
  } catch {
    return null;
  }
}

/** Judul atau jam mulai baris berubah: teks waktu isian yang menaut ke baris itu ditulis ulang. */
export function segarkanWaktuBaris(eventId: string, userId: string, item: { id: number; section_id: number; start_time: string; title: string }) {
  return ubahIsianBaris(eventId, userId, item.section_id, item.id, "item_updated", async (daftar, section) => {
    const teks = teksWaktuOutfit(item.start_time, item.title, await labelBatchTab(eventId, { id: item.section_id, event_date: section.event_date }));
    return daftar.map((isian) => (menautKe(isian, item.id) ? { ...(isian as object), when: teks } : isian));
  });
}

/** Baris dihapus: isian yang menaut ke baris itu ikut dihapus. */
export function hapusIsianBaris(eventId: string, userId: string, item: { id: number; section_id: number }) {
  return ubahIsianBaris(eventId, userId, item.section_id, item.id, "item_deleted", async (daftar) => daftar.filter((isian) => !menautKe(isian, item.id)));
}

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
