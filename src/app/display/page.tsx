import { getPublicPageEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeBranding } from "@/lib/branding";
import { loadActiveBoothCodes } from "@/lib/display-booths";
import { DEFAULT_CONFIG, DISPLAY_CONFIG_COLUMNS, type DisplayConfig } from "@/lib/display-config";
import DisplayClient from "./display-client";

// Papan peringkat dirender di server supaya konfigurasi CMS sudah ikut di HTML pertama.
//
// Sebelumnya halaman ini murni client component dan ditandai statis saat build, jadi
// HTML yang dikirim selalu memuat judul, warna, dan latar bawaan. Konfigurasi asli
// baru diambil lewat /api/display/settings setelah halaman hidup di browser,
// sehingga penonton melihat tampilan bawaan berkelip lebih dulu. Di layar proyektor
// kelipan itu sangat kentara dan terlihat seperti salah setting.
//
// `force-dynamic` diperlukan: tanpa itu Next.js tetap mem-prerender halaman ini saat
// build, dan konfigurasinya membeku pada nilai saat build, bukan saat ditonton.
export const dynamic = "force-dynamic";

async function loadConfig(eventId: string): Promise<DisplayConfig> {
  try {
    // Dijalankan berbarengan: keduanya tidak saling bergantung, dan halaman ini
    // dirender di server pada setiap permintaan.
    const [{ data, error }, boothCodes] = await Promise.all([
      getSupabaseServiceClient()
        .from("display_settings")
        .select(DISPLAY_CONFIG_COLUMNS)
        .eq("event_id", eventId)
        .single(),
      loadActiveBoothCodes(eventId),
    ]);
    if (error || !data) return { ...DEFAULT_CONFIG, active_booth_codes: boothCodes };
    // Digabung dengan nilai bawaan agar kolom yang belum terisi di database tidak
    // membuat layar kehilangan properti lalu gagal render di depan penonton.
    //
    // Branding dinormalisasi terpisah SETELAH penggabungan, karena kolom skala
    // bertipe `numeric` dan driver Postgres mengirimkannya sebagai string demi
    // menjaga presisi. String itu tidak bisa dipakai langsung sebagai pengali
    // dalam perhitungan CSS, jadi ia harus melewati normalisasi lebih dulu.
    const merged = { ...DEFAULT_CONFIG, ...(data as Partial<DisplayConfig>) };
    return { ...merged, ...normalizeBranding(data as Record<string, unknown>), active_booth_codes: boothCodes };
  } catch {
    // Layar acara tidak boleh gagal total hanya karena satu baris setting tidak
    // terbaca. Lebih baik tampil dengan nilai bawaan daripada menampilkan error.
    return DEFAULT_CONFIG;
  }
}

export default async function DisplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Slug diteruskan proxy sebagai `?eventSlug=`. Tanpa event yang bisa
  // ditentukan (mis. dua event aktif dan alamatnya tidak menyebut slug), layar
  // tampil dengan nilai bawaan alih-alih menayangkan data event yang salah.
  const event = await getPublicPageEvent(searchParams);
  return <DisplayClient initialConfig={event ? await loadConfig(event.id) : DEFAULT_CONFIG} />;
}
