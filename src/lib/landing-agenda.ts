import { getSupabaseServiceClient } from "./supabase/service";
import { formatClock } from "./rundown";

/** Jam halaman publik, sama dengan baris jam di hero: "08.00" (Indonesia) atau "08:00" (English). */
function jamTitik(jam: string, bahasa: "id" | "en"): string {
  return bahasa === "en" ? jam : jam.replace(":", ".");
}

/**
 * Ringkasan susunan acara untuk landing page.
 *
 * Membaca tabel rundown yang SUDAH ADA, bukan CMS agenda kedua. Dua tempat
 * menyunting jadwal yang sama adalah cara paling pasti membuat landing page dan
 * layar rundown menampilkan jam yang berbeda di hari-H — dan yang dipercaya tamu
 * adalah yang ia baca lebih dulu.
 *
 * Yang diambil jam, judul, dan keterangan (pembicara) tiap sesi. Rincian lain
 * tetap di `/rundown`, tempat panitia memang mengelolanya.
 */
export type AgendaItem = { time: string; end: string | null; title: string; subtitle: string | null };

export type AgendaPreview = {
  sectionTitle: string | null;
  items: AgendaItem[];
};

/**
 * Batas per bagian. Halaman acara menampilkan susunan lengkap satu bagian
 * sekaligus (lewat tab), jadi batasnya hanya pengaman terhadap rundown yang
 * tidak wajar panjangnya, bukan ringkasan.
 */
const MAX_ITEMS = 40;

export async function loadAgendaPreview(eventId: string, bahasa: "id" | "en" = "id"): Promise<AgendaPreview[]> {
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
    .select("section_id,title,subtitle,start_time,end_time,sort_order")
    .in("section_id", daftarSeksi.map((section) => section.id))
    .order("sort_order", { ascending: true });

  const daftarItem = (items ?? []) as unknown as Array<{
    section_id: number;
    title: string | null;
    subtitle: string | null;
    start_time: string | null;
    end_time: string | null;
  }>;

  return daftarSeksi
    .map((section) => ({
      sectionTitle: section.title,
      items: daftarItem
        .filter((item) => item.section_id === section.id)
        .slice(0, MAX_ITEMS)
        .map((item) => ({
          time: jamTitik(formatClock(item.start_time), bahasa),
          end: item.end_time ? jamTitik(formatClock(item.end_time), bahasa) : null,
          title: item.title ?? "",
          subtitle: item.subtitle?.trim() || null,
        }))
        // Baris tanpa judul adalah pemisah visual di layar rundown. Di ringkasan
        // ia hanya menjadi baris kosong yang terbaca sebagai data yang hilang.
        .filter((item) => item.title.trim().length > 0),
    }))
    .filter((section) => section.items.length > 0);
}
