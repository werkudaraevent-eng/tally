import { getSupabaseServiceClient } from "./supabase/service";
import { formatClock } from "./rundown";

/**
 * Ringkasan susunan acara untuk landing page.
 *
 * Membaca tabel rundown yang SUDAH ADA, bukan CMS agenda kedua. Dua tempat
 * menyunting jadwal yang sama adalah cara paling pasti membuat landing page dan
 * layar rundown menampilkan jam yang berbeda di hari-H — dan yang dipercaya tamu
 * adalah yang ia baca lebih dulu.
 *
 * Yang diambil hanya judul dan jamnya. Rincian per sesi tetap di `/rundown`,
 * tempat panitia memang mengelolanya; landing page menautkan ke sana.
 */
export type AgendaPreview = {
  sectionTitle: string | null;
  items: { time: string; title: string }[];
};

const MAX_ITEMS = 8;

export async function loadAgendaPreview(eventId: string): Promise<AgendaPreview[]> {
  const client = getSupabaseServiceClient();

  const { data: sections } = await client
    .from("rundown_sections")
    .select("id,title,sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  const daftarSeksi = (sections ?? []) as unknown as Array<{ id: number; title: string | null }>;
  if (daftarSeksi.length === 0) return [];

  const { data: items } = await client
    .from("rundown_items")
    .select("section_id,title,start_time,sort_order")
    .in("section_id", daftarSeksi.map((section) => section.id))
    .order("sort_order", { ascending: true });

  const daftarItem = (items ?? []) as unknown as Array<{
    section_id: number;
    title: string | null;
    start_time: string | null;
  }>;

  return daftarSeksi
    .map((section) => ({
      sectionTitle: section.title,
      items: daftarItem
        .filter((item) => item.section_id === section.id)
        .slice(0, MAX_ITEMS)
        .map((item) => ({ time: formatClock(item.start_time), title: item.title ?? "" }))
        // Baris tanpa judul adalah pemisah visual di layar rundown. Di ringkasan
        // ia hanya menjadi baris kosong yang terbaca sebagai data yang hilang.
        .filter((item) => item.title.trim().length > 0),
    }))
    .filter((section) => section.items.length > 0);
}
