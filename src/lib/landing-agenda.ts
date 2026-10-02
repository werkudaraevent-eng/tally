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
 *
 * Hanya bagian dan baris yang diterbitkan, sama dengan layar `/rundown`
 * (api/rundown): yang disembunyikan panitia di Rundown tidak boleh bocor lewat
 * halaman acara. Pratinjau admin memakai fungsi ini juga, jadi ikut sama.
 */
/**
 * `id` adalah id baris `rundown_items`, kunci tetap yang dipegang pembicara
 * (`speaker.session_refs`). `key` adalah judul Indonesia baris itu, juga di
 * halaman English: sesi teks lama pembicara ("Sesi 1") dan jeda dicocokkan
 * lewat kunci ini, karena judul barisnya mungkin sudah diterjemahkan.
 * `jeda` menandai baris jeda rundown (makan siang, rehat): pembicara yang
 * memilih baris itu lewat `session_refs` tidak ditampilkan di sana.
 */
export type AgendaItem = { id: number; time: string; end: string | null; title: string; subtitle: string | null; key: string; jeda: boolean };

export type AgendaPreview = {
  sectionTitle: string | null;
  /** Hari pendek bagian dalam bahasa halaman, mis. "Kam 15" atau "Thu 15". */
  hari: string | null;
  items: AgendaItem[];
};

/** "2026-10-15" menjadi "Kam 15" (Indonesia) atau "Thu 15" (English). */
function hariPendek(tanggal: string | null, bahasa: "id" | "en"): string | null {
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
  const teks = new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(bahasa === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", timeZone: "UTC" });
  return teks.replace(",", "");
}

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
    .select("id,title,event_date,sort_order")
    .eq("event_id", eventId)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  const daftarSeksi = (sections ?? []) as unknown as Array<{ id: number; title: string | null; event_date: string | null }>;
  if (daftarSeksi.length === 0) return [];

  const { data: items } = await client
    .from("rundown_items")
    .select("id,section_id,title,subtitle,title_en,subtitle_en,start_time,end_time,is_break,sort_order")
    .in("section_id", daftarSeksi.map((section) => section.id))
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  const daftarItem = (items ?? []) as unknown as Array<{
    id: number;
    section_id: number;
    title: string | null;
    subtitle: string | null;
    title_en: string | null;
    subtitle_en: string | null;
    start_time: string | null;
    end_time: string | null;
    is_break: boolean | null;
  }>;

  return daftarSeksi
    .map((section) => ({
      sectionTitle: section.title,
      hari: hariPendek(section.event_date, bahasa),
      items: daftarItem
        .filter((item) => item.section_id === section.id)
        .slice(0, MAX_ITEMS)
        .map((item) => ({
          id: item.id,
          time: jamTitik(formatClock(item.start_time), bahasa),
          end: item.end_time ? jamTitik(formatClock(item.end_time), bahasa) : null,
          // English jatuh ke teks Indonesia per kolom, sama dengan isi halaman lainnya.
          title: (bahasa === "en" && item.title_en?.trim()) || item.title || "",
          // Keterangan English hanya tampil bila baris Indonesianya punya
          // keterangan: terjemahan yang tertinggal tidak bisa dilihat di editor.
          subtitle: item.subtitle?.trim() ? (bahasa === "en" && item.subtitle_en?.trim()) || item.subtitle.trim() : null,
          key: item.title ?? "",
          jeda: Boolean(item.is_break),
        }))
        // Baris tanpa judul adalah pemisah visual di layar rundown. Di ringkasan
        // ia hanya menjadi baris kosong yang terbaca sebagai data yang hilang.
        .filter((item) => item.title.trim().length > 0),
    }))
    .filter((section) => section.items.length > 0);
}
