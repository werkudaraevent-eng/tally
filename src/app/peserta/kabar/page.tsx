import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { Bingkai, BingkaiModern } from "@/app/daftar/daftar-client";
import { bingkaiFormulir } from "@/app/daftar/isi-daftar";
import { CatatKlik } from "@/components/member/catat-klik";
import { FotoPengumuman } from "@/components/member/foto-pengumuman";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import type { EventLandingConfig } from "@/lib/domain";
import { bacaJejak } from "@/lib/email/jejak-server";
import { formatEventDate, formatEventSchedule } from "@/lib/event-datetime";
import { landingDefaultLang, landingPath, type LandingLang } from "@/lib/landing-i18n";
import { altFotoPengumuman } from "@/lib/pengumuman-foto";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Baca pengumuman dari email: `/e/<slug>/peserta/kabar?t=<token>`, tombol di
 * salinan email pengumuman saat Email tracking menyala (migrasi 202611070030).
 *
 * Tanpa masuk portal, dan sengaja hanya isi pengumuman itu: judul, isi, foto
 * dan tautannya, yang sudah ada di email itu sendiri. Tidak ada nama, QR atau
 * data peserta, jadi email yang diteruskan atau dibuka pemindai tidak
 * membuka apa pun yang belum dibawa emailnya. Halaman ini mencatat klik
 * (Clicked, dan Seen di laporan pengumuman) setelah berjalan di peramban.
 */

export const dynamic = "force-dynamic";

type Kueri = Promise<Record<string, string | string[] | undefined>>;

const TEKS: Record<LandingLang, { eyebrow: string; open: string; gone: string; goneBody: string; title: string }> = {
  id: {
    eyebrow: "Pengumuman panitia",
    open: "Buka Dashboard saya",
    gone: "Pengumuman ini sudah tidak tersedia",
    goneBody: "Panitia sudah menyembunyikan atau menghapusnya. Pengumuman terbaru ada di Dashboard saya.",
    title: "Pengumuman",
  },
  en: {
    eyebrow: "Organiser announcement",
    open: "Open My dashboard",
    gone: "This announcement is no longer available",
    goneBody: "The organisers hid or removed it. The latest announcements are in My dashboard.",
    title: "Announcement",
  },
};

export async function generateMetadata() {
  return {
    title: TEKS.id.title,
    // Tautan pribadi: jangan diindeks, dan jangan bocorkan tokennya lewat Referer.
    robots: { index: false, follow: false },
    referrer: "no-referrer" as const,
  };
}

type Pengumuman = { id: string; title: string; body: string; link_url: string | null; link_label: string | null; image_url?: string | null; image_alt?: string | null; hidden_at?: string | null };

async function muatPengumuman(eventId: string, token: string | null): Promise<Pengumuman | null> {
  const jejak = bacaJejak(token);
  if (!jejak || jejak.jenis !== "a") return null;
  const client = getSupabaseServiceClient();
  const { data: baris } = await client.from("announcement_email_recipients").select("announcement_id").eq("id", jejak.id).eq("event_id", eventId).maybeSingle();
  const idPengumuman = (baris as { announcement_id?: string } | null)?.announcement_id;
  if (!idPengumuman) return null;
  const { data } = await client
    .from("event_announcements")
    .select("id,title,body,link_url,link_label,image_url,image_alt,hidden_at")
    .eq("id", idPengumuman)
    .eq("event_id", eventId)
    .maybeSingle();
  const item = data as Pengumuman | null;
  return item && !item.hidden_at ? item : null;
}

export default async function KabarPage({ searchParams }: { searchParams: Kueri }) {
  const kueri = await searchParams;
  const event = await getPublicPageEvent(Promise.resolve(kueri));
  if (!event || event.status === "archived") notFound();
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const lang = landingDefaultLang(landing);
  const t = TEKS[lang];
  const token = typeof kueri.t === "string" ? kueri.t : null;
  const item = await muatPengumuman(event.id, token).catch(() => null);
  const dashboard = `${landingPath(event.slug, lang, lang)}/peserta?tab=info`;

  const tombol = (
    <Link
      href={dashboard}
      className="m3-state mt-8 inline-flex min-h-12 items-center rounded-md bg-[var(--reg-primary)] px-5 text-label-large font-semibold text-[var(--reg-on-primary)]"
      style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
    >
      {t.open}
    </Link>
  );

  const isi = item ? (
    <article className="max-w-[640px]">
      {token ? <CatatKlik slug={event.slug} token={token} /> : null}
      <h2 className="text-balance text-[26px] font-semibold leading-tight tracking-[-0.02em] [font-family:var(--landing-heading)] sm:text-[32px]">{item.title}</h2>
      {item.body.trim()
        ? item.body
            .split(/\n{2,}/)
            .map((paragraf) => paragraf.trim())
            .filter(Boolean)
            .map((paragraf, i) => (
              <p key={i} className="mt-4 whitespace-pre-line text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
                {paragraf}
              </p>
            ))
        : null}
      {item.image_url ? (
        <div className="mt-5">
          <FotoPengumuman src={item.image_url} alt={altFotoPengumuman(item)} lang={lang} />
        </div>
      ) : null}
      {item.link_url ? (
        <p className="mt-4 text-body-large">
          <a href={item.link_url} className="font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline [overflow-wrap:anywhere]" rel="noopener noreferrer">
            {item.link_label?.trim() || item.link_url}
          </a>
        </p>
      ) : null}
      {tombol}
    </article>
  ) : (
    <div className="max-w-[640px]">
      <h2 className="text-balance text-[26px] font-semibold leading-tight tracking-[-0.02em] [font-family:var(--landing-heading)] sm:text-[32px]">{t.gone}</h2>
      <p className="mt-3 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">{t.goneBody}</p>
      {tombol}
    </div>
  );

  const bingkai = await bingkaiFormulir(event, lang, { tautanBahasa: false });
  if (bingkai.modern) {
    return (
      <BingkaiModern lang={lang} halamanUrl={bingkai.halamanUrl} eventName={bingkai.eventName} welcomeText={null} theme={bingkai.theme} modern={bingkai.modern} areaUrl={bingkai.modern.areaUrl} eyebrow={t.eyebrow}>
        {isi}
      </BingkaiModern>
    );
  }
  const jadwal = [lang === "id" ? formatEventSchedule(event) : formatEventDate(event, lang), event.venue_name?.trim() || null].filter(Boolean).join(" · ") || null;
  return (
    <Bingkai lang={lang} halamanUrl={bingkai.halamanUrl} eventName={bingkai.eventName} schedule={jadwal} welcomeText={null} theme={bingkai.theme} eyebrow={t.eyebrow}>
      {isi}
    </Bingkai>
  );
}
