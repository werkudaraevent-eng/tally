import { getPublicPageEvent } from "@/lib/auth/request-event";
import { normalizeBranding } from "@/lib/branding";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { DEFAULT_GREETING, GREETING_COLUMNS, type GreetingConfig } from "@/lib/greeting-config";
import SapaClient from "./sapa-client";

/**
 * Layar sapa.
 *
 * Dipasang di TV atau proyektor dekat pintu masuk. Begitu petugas memindai QR
 * seorang tamu di /scan, namanya muncul di sini.
 *
 * Dirender di server supaya konfigurasi CMS — warna, orientasi, huruf — sudah
 * ikut di HTML pertama. Kalau diambil setelah halaman hidup di browser, penonton
 * melihat tampilan bawaan berkelip lebih dulu, dan di layar sebesar ini kelipan
 * itu terbaca sebagai layar yang salah setting.
 *
 * `force-dynamic` diperlukan: tanpa itu Next.js tetap mem-prerender halaman ini
 * saat build dan konfigurasinya membeku pada nilai saat build, bukan saat
 * ditonton.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Layar sapa" };

async function loadConfig(eventId: string): Promise<GreetingConfig> {
  try {
    const { data } = await getSupabaseServiceClient()
      .from("greeting_settings")
      .select(GREETING_COLUMNS)
      .eq("event_id", eventId)
      .maybeSingle();

    return {
      ...DEFAULT_GREETING,
      ...((data ?? {}) as Partial<GreetingConfig>),
      ...normalizeBranding((data ?? null) as Record<string, unknown> | null),
    };
  } catch {
    // Layar acara tidak boleh gagal total hanya karena satu baris konfigurasi
    // tidak terbaca. Tampil dengan nilai bawaan lebih baik daripada menampilkan
    // galat di dinding lobi.
    return DEFAULT_GREETING;
  }
}

export default async function SapaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, event] = await Promise.all([searchParams, getPublicPageEvent(searchParams)]);
  const config = event ? await loadConfig(event.id) : DEFAULT_GREETING;

  // Orientasi boleh ditimpa lewat alamat: `?orientasi=portrait`.
  //
  // Ada supaya panitia bisa membuka kedua tata letak dari satu laptop saat
  // menyiapkan ruangan, tanpa mengubah setelan CMS yang sedang dipakai layar
  // yang sudah terpasang di lobi.
  const timpa = params.orientasi;
  const dikunci = timpa === "portrait" || timpa === "landscape";
  const orientation = dikunci ? timpa : config.orientation;

  // Jalur boleh ditetapkan lewat alamat untuk pemutar signage yang memang
  // disetel per layar, dan `semua` untuk layar tunggal di pintu utama yang
  // sengaja menyapa semua meja. Tanpa keduanya, layar memakai kode pemasangan.
  const jalurRaw = params.jalur;
  const jalur = (Array.isArray(jalurRaw) ? jalurRaw[0] : jalurRaw)?.trim() || null;

  // `orientationLocked` diteruskan supaya polling konfigurasi tidak membatalkan
  // pilihan yang ditulis di alamat beberapa detik kemudian.
  return <SapaClient config={{ ...config, orientation }} orientationLocked={dikunci} jalur={jalur} />;
}
