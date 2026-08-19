import { headers } from "next/headers";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { BRANDING_COLUMNS, DEFAULT_BRANDING, normalizeBranding, type Branding } from "@/lib/branding";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import VoteScreenClient from "./vote-screen-client";

// Layar panggung voting. Publik — proyektor berjalan tanpa login.
//
// `force-dynamic` dengan alasan yang sama seperti layar undian: tanpa itu Next
// mem-prerender saat build dan tampilannya membeku pada nilai saat build, bukan
// saat ditonton.
//
// Hanya TAMPILAN yang di-SSR, supaya warna dan judul acara sudah ikut di HTML
// pertama dan penonton tidak melihat tampilan bawaan berkelip lebih dulu — di
// proyektor kelipan itu sangat kentara. Keadaan voting selalu diambil klien
// lewat polling, supaya HTML awal tidak pernah memuat angka yang mungkin masih
// dirahasiakan; HTML tersimpan di riwayat peramban dan bisa dibaca ulang.
export const dynamic = "force-dynamic";

const SETTINGS_ROW =
  `page_title,page_subtitle,background_color,text_color,accent_color,panel_color,background_image_url,${BRANDING_COLUMNS}`;

const FALLBACK = { background: "#0B1020", text: "#FFFFFF", accent: "#F5C451" };

export default async function VoteScreenPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const event = await getPublicPageEvent(searchParams);

  let title = "Voting";
  let subtitle: string | null = null;
  let colors = FALLBACK;
  let backgroundImage: string | null = null;
  let panelColor: string | null = null;
  let branding: Branding = DEFAULT_BRANDING;

  if (event) {
    const { data } = await getSupabaseServiceClient()
      .from("vote_settings").select(SETTINGS_ROW).eq("event_id", event.id).maybeSingle();
    const row = data as Record<string, unknown> | null;
    if (row) {
      title = (row.page_title as string) || "Voting";
      subtitle = (row.page_subtitle as string | null) ?? null;
      colors = {
        background: (row.background_color as string | null) ?? FALLBACK.background,
        text: (row.text_color as string | null) ?? FALLBACK.text,
        accent: (row.accent_color as string | null) ?? FALLBACK.accent,
      };
      backgroundImage = (row.background_image_url as string | null) ?? null;
      panelColor = (row.panel_color as string | null) ?? null;
      branding = normalizeBranding(row);
    }
  }

  /*
    Alamat pemilih harus ABSOLUT: isi QR dibaca kamera HP yang tidak punya
    konteks halaman ini, jadi path relatif menghasilkan pindaian yang gagal.

    Host diambil dari header permintaan, bukan dari env: satu deploy dilayani
    dari beberapa nama host (domain klien, alamat vercel.app, dan IP jaringan
    lokal saat gladi bersih), dan QR harus menunjuk host yang sedang dipakai
    proyektor — kalau tidak, HP peserta di jaringan yang sama tidak bisa
    membukanya.

    Prefiks `/e/<slug>` disertakan supaya pindaian tetap benar saat ada dua
    event aktif sekaligus.
  */
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("192.") ? "http" : "https");
  const path = event ? `/e/${event.slug}/vote` : "/vote";
  const voteUrl = host ? `${proto}://${host}${path}` : path;

  // Kode gabung dibaca terpisah dari setelan tampilan: ia milik baris `events`,
  // bukan milik layar, dan dipakai juga oleh layar publik lain kelak.
  let joinCode: string | null = null;
  if (event) {
    const { data } = await getSupabaseServiceClient()
      .from("events").select("join_code").eq("id", event.id).maybeSingle();
    joinCode = (data as { join_code: string | null } | null)?.join_code ?? null;
  }

  return <VoteScreenClient
    voteUrl={voteUrl}
    joinHost={host}
    joinCode={joinCode}
    title={title}
    subtitle={subtitle}
    accent={colors.accent}
    text={colors.text}
    background={colors.background}
    backgroundImage={backgroundImage}
    panelColor={panelColor}
    branding={branding}
  />;
}
