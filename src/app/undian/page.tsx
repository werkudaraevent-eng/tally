import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { BRANDING_COLUMNS, DEFAULT_BRANDING, normalizeBranding, type Branding } from "@/lib/branding";
import type { UndianState } from "@/lib/undian";
import UndianClient from "./undian-client";

// Layar panggung undian. Publik — proyektor berjalan tanpa login.
//
// Dirender di server supaya branding dan judul sudah ikut di HTML pertama. Kalau
// halaman ini murni client component, penonton melihat tampilan bawaan berkelip
// lebih dulu sebelum warna acara datang, dan di layar proyektor kelipan itu sangat
// kentara.
//
// `force-dynamic` diperlukan: tanpa itu Next.js tetap mem-prerender saat build dan
// konfigurasinya membeku pada nilai saat build, bukan saat ditonton.
//
// Hanya SETELAN yang di-SSR, bukan state undian. State selalu diambil klien lewat
// polling — dan itu disengaja: HTML awal tidak boleh memuat apa pun tentang undian
// yang sedang berjalan, karena HTML tersimpan di riwayat peramban dan bisa dibaca
// ulang.
export const dynamic = "force-dynamic";

const SETTINGS_ROW =
  `page_title,page_subtitle,show_company,show_seat,sound_enabled,confetti_enabled,` +
  `background_color,text_color,accent_color,background_image_url,${BRANDING_COLUMNS}`;

const DEFAULT_STATE: UndianState & { branding: Branding } = {
  mode: "off",
  phase: "idle",
  draw_round: 0,
  prize: null,
  roster: [],
  pool_size: 0,
  spin_started_at: null,
  reveal_at: null,
  winners: [],
  confirmed: [],
  settings: {
    page_title: "Undian Berhadiah",
    page_subtitle: null,
    show_company: true,
    show_seat: true,
    sound_enabled: true,
    confetti_enabled: true,
    background_color: null,
    text_color: null,
    accent_color: null,
    background_image_url: null,
  },
  branding: DEFAULT_BRANDING,
  updated_at: new Date().toISOString(),
};

async function loadInitial(): Promise<UndianState & { branding: Branding }> {
  try {
    const { data, error } = await getSupabaseServiceClient()
      .from("undian_settings")
      .select(SETTINGS_ROW)
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return DEFAULT_STATE;
    const raw = data as Record<string, unknown>;
    return {
      ...DEFAULT_STATE,
      settings: {
        page_title: (raw.page_title as string) ?? DEFAULT_STATE.settings.page_title,
        page_subtitle: (raw.page_subtitle as string | null) ?? null,
        show_company: raw.show_company !== false,
        show_seat: raw.show_seat !== false,
        sound_enabled: raw.sound_enabled !== false,
        confetti_enabled: raw.confetti_enabled !== false,
        background_color: (raw.background_color as string | null) ?? null,
        text_color: (raw.text_color as string | null) ?? null,
        accent_color: (raw.accent_color as string | null) ?? null,
        background_image_url: (raw.background_image_url as string | null) ?? null,
      },
      branding: normalizeBranding(raw),
    };
  } catch {
    // Layar acara tidak boleh gagal total hanya karena satu baris setelan tidak
    // terbaca. Tampil dengan nilai bawaan jauh lebih baik daripada halaman error.
    return DEFAULT_STATE;
  }
}

export default async function UndianPage() {
  return <UndianClient initial={await loadInitial()} />;
}
