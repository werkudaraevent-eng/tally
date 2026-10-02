import { getPublicPageEvent } from "@/lib/auth/request-event";
import { LANDING_HEADING_FONTS, publicEventName, type EventLandingConfig } from "@/lib/domain";
import { formatEventDate, formatEventSchedule, formatEventTime } from "@/lib/event-datetime";
import { memberConfig } from "@/lib/member/account";
import { modernThemeStyle, registrationThemeStyle, resolveFormTheme } from "@/lib/registration-theme-css";
import { redirect } from "next/navigation";
import { DAFTAR_UI } from "@/lib/daftar-i18n";
import { landingDefaultLang, landingEnAvailable, landingPath, withQuery, LANDING_LANG_LABELS, type LandingLang } from "@/lib/landing-i18n";
import { HtmlLang } from "@/components/html-lang";
import type { Metadata } from "next";
import DaftarClient from "./daftar-client";

// Sama alasannya dengan /display: tanpa ini Next.js mem-prerender halaman saat
// build, dan nama acara membeku pada event yang kebetulan aktif saat itu.
export const dynamic = "force-dynamic";

type Kueri = Promise<Record<string, string | string[] | undefined>>;

/** `bahasa` diisi src/proxy.ts dari `/e/<slug>/en/daftar` atau `/id/daftar`. */
function bahasaDiminta(kueri: Record<string, string | string[] | undefined>): LandingLang | null {
  return kueri.bahasa === "en" || kueri.bahasa === "id" ? kueri.bahasa : null;
}

export async function generateMetadata({ searchParams }: { searchParams: Kueri }): Promise<Metadata> {
  const kueri = await searchParams;
  const event = await getPublicPageEvent(searchParams);
  const minta = bahasaDiminta(kueri);
  if (!event) return { title: DAFTAR_UI[minta ?? "id"].notFoundTitle, robots: { index: false } };
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const utama = landingDefaultLang(landing);
  // Sama dengan halaman di bawah: alamat bahasa lain yang tidak berlaku dialihkan.
  const lang = minta && minta !== utama && landingEnAvailable(landing) ? minta : utama;
  const judul = `${DAFTAR_UI[lang].registration} · ${publicEventName(event)}`;
  const deskripsi = lang === "en" ? `Register for ${publicEventName(event)}.` : `Pendaftaran peserta ${publicEventName(event)}.`;
  return {
    title: judul,
    description: deskripsi,
    openGraph: { title: judul, description: deskripsi, locale: lang === "en" ? "en_GB" : "id_ID" },
  };
}

export default async function DaftarPage({
  searchParams,
}: {
  searchParams: Kueri;
}) {
  const kueri = await searchParams;
  const event = await getPublicPageEvent(searchParams);
  const minta = bahasaDiminta(kueri);

  // Tiga keadaan yang harus DIBEDAKAN, karena tindak lanjutnya berbeda:
  // tidak ada event (tautannya salah), pendaftaran ditutup (tautannya benar,
  // waktunya lewat), dan siap menerima. Digabung jadi satu pesan, orang yang
  // mengetik alamat dengan benar akan mengira dirinya salah alamat.
  if (!event) {
    const t = DAFTAR_UI[minta ?? "id"];
    return <Pesan lang={minta ?? "id"} judul={t.notFoundTitle} isi={t.notFoundBody} />;
  }

  const config = event.registration_form_config ?? {};
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  // Bahasa mengikuti halaman acara: bahasa utama di `/e/<slug>/daftar`, bahasa
  // lain di `/en/daftar` atau `/id/daftar`. Alamat bahasa lain yang tidak
  // berlaku (English mati, atau ia bahasa utama) dialihkan ke alamat utama,
  // dengan kueri asalnya, sama dengan /e/<slug>/en.
  const utama = landingDefaultLang(landing);
  if (minta && (minta === utama || !landingEnAvailable(landing))) {
    const sisa = Object.fromEntries(Object.entries(kueri).filter(([kunci]) => kunci !== "eventSlug" && kunci !== "bahasa"));
    redirect(withQuery(`/e/${event.slug}/daftar`, sisa));
  }
  const lang = minta ?? utama;
  const t = DAFTAR_UI[lang];

  if (!event.registration_enabled) {
    return <Pesan lang={lang} judul={t.closedTitle} isi={t.closedBody(publicEventName(event))} />;
  }

  // Acara bertata letak Modern (halaman acara v2) mendapat formulir v2: kepala
  // selebar layar yang sama dengan hero, lalu kartu formulir selebar grid.
  // Acara lain tetap memakai formulir yang sudah ada.
  const modern = landing.layout === "modern" || landing.layout === "forum"
    ? {
        kv: landing.banner_url ?? null,
        fakta: [formatEventDate(event, lang), formatEventTime(event, lang), event.venue_name?.trim() || null]
          .filter((item): item is string => Boolean(item)),
        // Huruf judul bawaan mengikuti tata letaknya: Ubuntu untuk Forum, Source Sans 3 untuk Modern.
        headingFont: (LANDING_HEADING_FONTS[landing.heading_font ?? (landing.layout === "forum" ? "ubuntu" : "source")] ?? LANDING_HEADING_FONTS.source).cssVar,
        // Area peserta belum dwibahasa, jadi tautannya tetap ke versi utamanya.
        masukUrl: memberConfig(event) ? `/e/${event.slug}/masuk` : null,
      }
    : null;

  const formTheme = resolveFormTheme(config.theme, landing.theme);

  const tanggal = formatEventDate(event, lang);
  const jam = formatEventTime(event, lang);
  return <DaftarClient
    lang={lang}
    halamanUrl={landingPath(event.slug, lang, utama)}
    modern={modern}
    theme={modern ? { ...registrationThemeStyle(formTheme), ...modernThemeStyle(formTheme?.seed) } : registrationThemeStyle(formTheme)}
    eventName={publicEventName(event)}
    eventSlug={event.slug}
    schedule={lang === "id" ? formatEventSchedule(event) : tanggal ? [tanggal, jam].filter(Boolean).join(" · ") : null}
    fields={config.fields ?? []}
    welcomeText={config.welcome_text ?? null}
    successText={config.success_text ?? null}
    requireEmail={config.require_email !== false}
    requirePhone={config.require_phone !== false}
    requireCompany={config.require_company ?? false}
    requireJobTitle={config.require_job_title ?? false}
  />;
}

function Pesan({ lang, judul, isi }: { lang: LandingLang; judul: string; isi: string }) {
  return <main lang={LANDING_LANG_LABELS[lang].htmlLang} className="grid min-h-dvh place-items-center bg-surface px-5 text-on-surface">
    <HtmlLang lang={LANDING_LANG_LABELS[lang].htmlLang} />
    <div className="rounded-lg w-full max-w-md border border-outline-variant bg-panel p-8 text-center">
      <h1 className="text-headline-small font-semibold tracking-[-0.03em]">{judul}</h1>
      <p className="mt-3 text-body-medium leading-6 text-on-surface-variant">{isi}</p>
    </div>
  </main>;
}
