import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { bacaSyaratBaris } from "@/lib/sasaran-baris";

/**
 * Hari dan baris Agenda untuk Participant area > Event photos and videos: yang
 * diterbitkan saja, karena hanya itu yang bisa dilihat peserta. `limited` =
 * baris punya Who sees it, jadi link-nya hanya untuk peserta yang cocok.
 */
export type HariAgendaAdmin = {
  id: number;
  label: string | null;
  date: string | null;
  items: Array<{ id: number; time: string | null; end: string | null; title: string; limited: boolean }>;
};

export async function loadAgendaDokumentasi(eventId: string): Promise<HariAgendaAdmin[] | null> {
  const client = getSupabaseServiceClient();
  const { data: seksi, error } = await client
    .from("rundown_sections")
    .select("id,name,title,event_date")
    .eq("event_id", eventId)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);
  if (error) return null;
  const daftar = (seksi ?? []) as Array<{ id: number; name: string | null; title: string | null; event_date: string | null }>;
  if (!daftar.length) return [];
  const bacaBaris = (kolom: string) =>
    client
      .from("rundown_items")
      .select(kolom)
      .in("section_id", daftar.map((bagian) => bagian.id))
      .eq("is_published", true)
      .order("start_time", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(1000);
  const KOLOM = "id,section_id,title,start_time,end_time,is_break";
  const pertama = await bacaBaris(`${KOLOM},audience`);
  // Sebelum migrasi kolom `audience`: dibaca ulang tanpa kolom itu.
  const hasil = pertama.error?.code === "42703" || pertama.error?.code === "PGRST204" ? await bacaBaris(KOLOM) : pertama;
  if (hasil.error) return null;
  const baris = (hasil.data ?? []) as unknown as Array<{ id: number; section_id: number; title: string | null; start_time: string | null; end_time: string | null; is_break: boolean | null; audience?: unknown }>;
  const jam = (nilai: string | null) => (nilai ? nilai.slice(0, 5) : null);
  return daftar.map((bagian) => ({
    id: bagian.id,
    label: bagian.name?.trim() || bagian.title?.trim() || null,
    date: bagian.event_date && /^\d{4}-\d{2}-\d{2}$/.test(bagian.event_date) ? bagian.event_date : null,
    items: baris
      .filter((item) => item.section_id === bagian.id && !item.is_break && item.title?.trim())
      .map((item) => ({ id: item.id, time: jam(item.start_time), end: jam(item.end_time), title: item.title!.trim(), limited: bacaSyaratBaris(item.audience) !== null })),
  }));
}
