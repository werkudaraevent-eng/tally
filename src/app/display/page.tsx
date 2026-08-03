import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { DEFAULT_CONFIG, DISPLAY_CONFIG_COLUMNS, type DisplayConfig } from "@/lib/display-config";
import DisplayClient from "./display-client";

// Live Display dirender di server supaya konfigurasi CMS sudah ikut di HTML pertama.
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

async function loadConfig(): Promise<DisplayConfig> {
  try {
    const { data, error } = await getSupabaseServiceClient()
      .from("display_settings")
      .select(DISPLAY_CONFIG_COLUMNS)
      .eq("id", 1)
      .single();
    if (error || !data) return DEFAULT_CONFIG;
    // Digabung dengan nilai bawaan agar kolom yang belum terisi di database tidak
    // membuat layar kehilangan properti lalu gagal render di depan penonton.
    return { ...DEFAULT_CONFIG, ...(data as Partial<DisplayConfig>) };
  } catch {
    // Layar acara tidak boleh gagal total hanya karena satu baris setting tidak
    // terbaca. Lebih baik tampil dengan nilai bawaan daripada menampilkan error.
    return DEFAULT_CONFIG;
  }
}

export default async function DisplayPage() {
  return <DisplayClient initialConfig={await loadConfig()} />;
}
