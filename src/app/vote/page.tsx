import { getPublicPageEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import VoteClient from "./vote-client";

// Halaman pemilih. Publik, dibuka di HP lewat QR di layar panggung.
//
// `force-dynamic` supaya nama dan warna acara tidak membeku pada nilai saat
// build — satu deploy melayani banyak event.
export const dynamic = "force-dynamic";

export default async function VotePage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const event = await getPublicPageEvent(searchParams);

  if (!event) {
    // Tanpa event yang jelas, halaman ini tidak punya voting untuk ditampilkan.
    // Terjadi bila tautan dibuka tanpa slug sementara ada dua event aktif —
    // dijawab dengan kalimat yang menyuruh memindai ulang, bukan halaman kosong.
    return <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center px-5 py-8">
      <p className="border border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--ink-muted)]">
        Acara tidak dikenali. Pindai ulang QR yang tampil di layar panggung.
      </p>
    </main>;
  }

  // Warna aksen diambil dari setelan undian, sumber yang sama dengan layar
  // panggung, supaya HP dan proyektor tidak memakai dua warna berbeda.
  const { data } = await getSupabaseServiceClient()
    .from("undian_settings").select("accent_color").eq("event_id", event.id).maybeSingle();
  const accent = (data as { accent_color: string | null } | null)?.accent_color ?? "#2C3FD6";

  return <VoteClient eventName={event.name} accent={accent} />;
}
