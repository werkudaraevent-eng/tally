import { notFound } from "next/navigation";
import { CeritaHarian } from "@/components/laporan/harian/cerita";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { publicEventName, type EventLandingConfig } from "@/lib/domain";
import { landingDefaultLang } from "@/lib/landing-i18n";
import { highlightLewatTautan } from "@/lib/laporan/server";

/**
 * Link highlight: `/e/<slug>/highlight/<token>`, tanpa login.
 *
 * Memutar hari yang sudah di-Lock di Admin > Event report > Daily highlights
 * sebagai cerita. Token dibuat dan dimatikan di sana; token salah, link yang
 * dimatikan, atau acara diarsipkan: 404, seperti halaman yang tidak ada.
 * Hanya salinan yang dikunci yang tampil, jadi tidak ada data peserta
 * perorangan di halaman ini.
 */

export const dynamic = "force-dynamic";

type Kueri = Promise<Record<string, string | string[] | undefined>>;

const TEKS = {
  id: { judul: "Highlight harian", kosong: "Belum ada hari yang dikunci. Highlight muncul di sini setelah panitia mengunci angka hari itu.", petunjuk: "Ketuk satu hari untuk memutarnya." },
  en: { judul: "Daily highlights", kosong: "No day is locked yet. Highlights show here once the committee locks a day's figures.", petunjuk: "Tap a day to play it." },
} as const;

export async function generateMetadata() {
  return { title: "Highlight", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
}

export default async function HighlightPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Kueri }) {
  const { token } = await params;
  const event = await getPublicPageEvent(searchParams);
  if (!event || event.status === "archived") notFound();
  const hari = await highlightLewatTautan(event.id, token).catch(() => null);
  if (!hari) notFound();
  const bahasa = hari[0]?.bahasa ?? landingDefaultLang(event.landing_config as EventLandingConfig | null);
  const t = TEKS[bahasa];
  return (
    <main lang={bahasa} className="min-h-dvh bg-surface px-4 py-8 text-on-surface sm:py-12">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <p className="m-0 text-label-large text-on-surface-variant">{publicEventName(event)}</p>
          <h1 className="m-0 text-headline-small">{t.judul}</h1>
          {hari.length ? <p className="m-0 text-body-medium text-on-surface-variant">{t.petunjuk}</p> : null}
        </header>
        {hari.length ? <CeritaHarian hari={hari} bahasa={bahasa} judul={false} grid /> : <p className="m-0 rounded-md bg-surface-container px-4 py-3 text-body-medium">{t.kosong}</p>}
      </div>
    </main>
  );
}
