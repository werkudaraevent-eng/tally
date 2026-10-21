import { adaTautan, bacaOutfit, labelTabOutfit, segarkanIsianBaris, tabTerlihatOutfit, tanpaIsianBaris, type BarisOutfit, type OutfitEntry } from "./outfit";
import { getSupabaseServiceClient } from "./supabase/service";

type TabDb = { id: number; name: string | null; title: string | null; event_date: string | null; is_published: boolean };
type ButirDb = BarisOutfit & { id: number; section_id: number };

/** Butir tab-tab itu di acara ini, atau null bila gagal dibaca. */
async function bacaButir(eventId: string, tabIds: number[]): Promise<ButirDb[] | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("rundown_items")
    .select("id,section_id,start_time,title,is_published")
    .eq("event_id", eventId)
    .in("section_id", tabIds);
  return error || !data ? null : (data as unknown as ButirDb[]);
}

/**
 * Bahan Save dress code untuk satu tab: label batchnya seperti segmen Batch di
 * portal (dari tab bertanggal sama yang dibuka peserta, ditambah tab ini) dan
 * baris tab ini menurut id. Null bila gagal dibaca.
 */
export async function konteksTautan(eventId: string, tab: { id: number; event_date: string | null }): Promise<{ label: string | null; baris: Map<number, ButirDb> } | null> {
  const kueri = getSupabaseServiceClient().from("rundown_sections").select("id,name,title,event_date,is_published").eq("event_id", eventId);
  const { data, error } = await (tab.event_date ? kueri.eq("event_date", tab.event_date) : kueri.eq("id", tab.id));
  if (error || !data) return null;
  const tabs = data as unknown as TabDb[];
  const butir = await bacaButir(eventId, tabs.map((isi) => isi.id));
  if (!butir) return null;
  return {
    label: labelTabOutfit(tabs, tab.id, tabTerlihatOutfit(tabs, butir)),
    baris: new Map(butir.filter((item) => item.section_id === tab.id).map((item) => [item.id, item])),
  };
}

/**
 * Baca, ubah, tulis outfit satu tab, hanya bila `updated_at` masih sama dengan
 * yang dibaca. Save dress code yang masuk di antaranya tidak tertimpa daftar
 * lama: bacaan ulang, lalu coba sekali lagi (pola PATCH Participant area).
 * Hasil: isian sesudah ditulis, atau null bila tidak ada yang ditulis.
 */
async function tulisOutfit(
  eventId: string,
  userId: string,
  sectionId: number,
  ubah: (daftar: readonly unknown[]) => unknown[],
  jejak: Record<string, unknown>,
): Promise<OutfitEntry[] | null> {
  const client = getSupabaseServiceClient();
  for (let percobaan = 0; ; percobaan++) {
    const { data, error } = await client.from("rundown_sections").select("id,outfit,updated_at").eq("event_id", eventId).eq("id", sectionId).maybeSingle();
    if (error || !data) return null;
    const baris = data as unknown as { outfit?: unknown; updated_at: string };
    if (!Array.isArray(baris.outfit)) return null;
    const baru = ubah(baris.outfit);
    if (JSON.stringify(baru) === JSON.stringify(baris.outfit)) return null;
    const { data: hasil, error: galat } = await client
      .from("rundown_sections")
      .update({ outfit: baru, updated_at: new Date().toISOString(), updated_by: userId } as never)
      .eq("event_id", eventId)
      .eq("id", sectionId)
      .eq("updated_at", baris.updated_at)
      .select("id,outfit")
      .maybeSingle();
    if (galat) return null;
    if (hasil) {
      await client.from("audit_logs").insert({
        event_id: eventId,
        user_id: userId,
        action: "rundown_section_outfit_update",
        payload: { id: sectionId, ...jejak, old: baris.outfit, new: baru },
      } as never);
      return bacaOutfit((hasil as unknown as { outfit?: unknown }).outfit);
    }
    if (percobaan >= 1) return null;
  }
}

type AlasanSegarkan = "item_created" | "item_updated" | "item_deleted" | "section_updated" | "section_deleted";

/**
 * Tulisan kedua sesudah agenda berubah: `when` isian bertaut di setiap tab
 * pada tanggal pilihan ditulis ulang dari barisnya dengan label batch terkini,
 * dan isian yang menaut ke baris yang baru dihapus (`hapus`) ikut dibuang.
 * Label batch bergantung pada tab lain bertanggal sama (nama, tanggal, terbit,
 * butir publik), jadi perubahan satu tab bisa mengubah teks tab lain. Hanya
 * tab acara ini: acara salinan membawa id baris acara asal.
 *
 * Tanpa transaksi dan tanpa foreign key, jadi gagal tidak menggagalkan
 * permintaan: peserta tetap membaca teks tersimpan, dan editor menyebut baris
 * yang hilang "Item not found". Hasil: isian tiap tab yang ditulis.
 */
async function segarkan(
  eventId: string,
  userId: string,
  pilihTanggal: (tabs: readonly TabDb[]) => ReadonlySet<string>,
  alasan: AlasanSegarkan,
  hapus?: { section_id: number; item_id: number },
): Promise<Map<number, OutfitEntry[]>> {
  const hasil = new Map<number, OutfitEntry[]>();
  try {
    const { data, error } = await getSupabaseServiceClient().from("rundown_sections").select("id,name,title,event_date,is_published,outfit").eq("event_id", eventId);
    // Kolom outfit belum ada (migrasi 202610160001): tidak ada tautan.
    if (error || !data) return hasil;
    const semua = data as unknown as Array<TabDb & { outfit?: unknown }>;
    const tanggal = pilihTanggal(semua);
    const diTanggal = semua.filter((tab) => tab.event_date !== null && tanggal.has(tab.event_date));
    const bertaut = diTanggal.filter((tab) => adaTautan(tab.outfit));
    if (bertaut.length === 0) return hasil;
    const butir = await bacaButir(eventId, diTanggal.map((tab) => tab.id));
    if (!butir) return hasil;
    const terlihat = tabTerlihatOutfit(diTanggal, butir);
    for (const tab of bertaut) {
      // Label dan baris dihitung sebelum outfit dibaca untuk ditulis, jadi
      // jendela baca-tulis di tulisOutfit hanya hitungan murni.
      const label = labelTabOutfit(diTanggal, tab.id, terlihat);
      const barisTab = new Map(butir.filter((item) => item.section_id === tab.id).map((item) => [item.id, item]));
      const buang = hapus?.section_id === tab.id ? hapus.item_id : null;
      const ubah = (daftar: readonly unknown[]) => segarkanIsianBaris(buang === null ? daftar : tanpaIsianBaris(daftar, buang), barisTab, label);
      // Tidak ada yang berubah menurut bacaan tadi: tab ini tidak dibaca ulang.
      if (JSON.stringify(ubah(tab.outfit as unknown[])) === JSON.stringify(tab.outfit)) continue;
      const tertulis = await tulisOutfit(eventId, userId, tab.id, ubah, { reason: alasan, ...(buang !== null ? { item_id: buang } : {}) });
      if (tertulis) hasil.set(tab.id, tertulis);
    }
  } catch {
    // Tulisan kedua tidak pernah menggagalkan permintaannya.
  }
  return hasil;
}

/** Sesudah tab diubah (nama, tanggal, terbit) atau dihapus: semua tab di tanggal lama dan barunya. */
export function segarkanOutfitTanggal(eventId: string, userId: string, tanggal: readonly (string | null | undefined)[], alasan: "section_updated" | "section_deleted") {
  const pilihan = new Set(tanggal.filter((isi): isi is string => Boolean(isi)));
  return segarkan(eventId, userId, () => pilihan, alasan);
}

/**
 * Sesudah satu baris ditambah, diubah atau dihapus: tab baris itu dan tab lain
 * bertanggal sama (butir publik pertama atau terakhir mengubah tab mana yang
 * dibuka peserta). Baris yang dihapus: isian yang menaut ke sana ikut dibuang.
 */
export function segarkanOutfitBaris(eventId: string, userId: string, item: { id: number; section_id: number }, alasan: "item_created" | "item_updated" | "item_deleted") {
  return segarkan(
    eventId,
    userId,
    (tabs) => new Set(tabs.flatMap((tab) => (tab.id === item.section_id && tab.event_date ? [tab.event_date] : []))),
    alasan,
    alasan === "item_deleted" ? { section_id: item.section_id, item_id: item.id } : undefined,
  );
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
