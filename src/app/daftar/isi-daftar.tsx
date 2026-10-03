import { LANDING_HEADING_FONTS, LANDING_NAV_DEFAULTS, publicEventName, type EventLandingConfig, type EventRow } from "@/lib/domain";
import { formatEventDate, formatEventSchedule, formatEventTime } from "@/lib/event-datetime";
import { getMemberSession, memberConfig, PASSWORD_MIN } from "@/lib/member/account";
import { modernNavStyle, modernThemeStyle, registrationThemeStyle, resolveFormTheme } from "@/lib/registration-theme-css";
import { DAFTAR_UI } from "@/lib/daftar-i18n";
import { landingDefaultLang, landingEnAvailable, landingFormOnly, landingPath, LANDING_LANG_LABELS, type LandingLang } from "@/lib/landing-i18n";
import { HtmlLang } from "@/components/html-lang";
import type { CSSProperties } from "react";
import DaftarClient, { BingkaiModern, type FormModern } from "./daftar-client";

/**
 * Formulir pendaftaran satu acara dalam satu bahasa. Dipakai halaman publik
 * `/e/<slug>/daftar` dan pratinjau di CMS (`/e/<slug>/daftar/pratinjau`),
 * supaya pratinjau admin tidak bisa berbeda dari yang dilihat pendaftar.
 *
 * `pratinjau`: formulir tetap dirender walau pendaftaran sedang ditutup (admin
 * menyusun formulir sebelum membukanya), dan sesi peserta tidak dibaca.
 */
/**
 * Kerangka formulir v2 (bilah atas, logo, KV, nama publik) dan warna halaman,
 * dari Tema halaman acara. Dipakai formulir, pesan "Pendaftaran ditutup" di
 * mode Hanya formulir, dan halaman masuk mode Hanya formulir.
 *
 * Kerangka v2 dipakai tata letak Modern dan Forum, dan SELALU di mode Hanya
 * formulir: Tema menjanjikan logo dan gambar utama tetap dipakai formulir,
 * jadi acara bertata letak Editorial pun mendapatnya. Selain itu, formulir
 * lama (`modern` null).
 */
export async function bingkaiFormulir(
  event: EventRow,
  lang: LandingLang,
  opsi: { pratinjau?: boolean; tautanBahasa?: boolean; tautanMasuk?: boolean } = {},
) {
  const config = event.registration_form_config ?? {};
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const utama = landingDefaultLang(landing);
  const member = memberConfig(event);
  const lainnya: LandingLang | null = opsi.tautanBahasa !== false && landingEnAvailable(landing) ? (lang === "id" ? "en" : "id") : null;
  const pakaiModern = landing.layout === "modern" || landing.layout === "forum" || landingFormOnly(landing);

  const modern: FormModern | null = pakaiModern
    ? {
        // Bilah atas yang sama dengan halaman acara (logo, ID | EN, Masuk),
        // dengan warna dan tinggi dari CMS.
        nav: {
          logoUrl: landing.nav?.logo_url ?? null,
          width: landing.nav?.width ?? "full",
          logoOnDark: Boolean(landing.banner_url) && (landing.nav?.opacity ?? LANDING_NAV_DEFAULTS.opacity) < 50,
          style: modernNavStyle(
            landing.nav,
            landing.banner_url ? { ink: "#ffffff", onInk: "#181d27" } : { ink: "var(--reg-on-brand)", onInk: "var(--reg-brand)" },
          ),
          langSwitch: lainnya ? { href: `${landingPath(event.slug, lainnya, utama)}/daftar`, lang: lainnya } : null,
        },
        kv: landing.banner_url ?? null,
        fakta: [formatEventDate(event, lang), formatEventTime(event, lang), event.venue_name?.trim() || null]
          .filter((item): item is string => Boolean(item)),
        // Huruf judul bawaan mengikuti tata letaknya: Ubuntu untuk Forum, Source Sans 3 untuk yang lain.
        headingFont: (LANDING_HEADING_FONTS[landing.heading_font ?? (landing.layout === "forum" ? "ubuntu" : "source")] ?? LANDING_HEADING_FONTS.source).cssVar,
        // Area peserta belum dwibahasa, jadi tautannya tetap ke versi utamanya.
        masukUrl: member && opsi.tautanMasuk !== false ? `/e/${event.slug}/masuk` : null,
        areaUrl: member && !opsi.pratinjau && opsi.tautanMasuk !== false && (await getMemberSession(event)) ? `/e/${event.slug}/peserta` : null,
      }
    : null;

  const formTheme = resolveFormTheme(config.theme, landing.theme);
  return {
    modern,
    theme: modern ? { ...registrationThemeStyle(formTheme), ...modernThemeStyle(formTheme?.seed) } : registrationThemeStyle(formTheme),
    halamanUrl: landingFormOnly(landing) ? null : landingPath(event.slug, lang, utama),
    eventName: publicEventName(event),
    welcomeText: config.welcome_text ?? null,
  };
}

/**
 * Formulir pendaftaran satu acara dalam satu bahasa. Dipakai halaman publik
 * `/e/<slug>/daftar` dan pratinjau di CMS (`/e/<slug>/daftar/pratinjau`),
 * supaya pratinjau admin tidak bisa berbeda dari yang dilihat pendaftar.
 *
 * `pratinjau`: formulir tetap dirender walau pendaftaran sedang ditutup (admin
 * menyusun formulir sebelum membukanya), dan sesi peserta tidak dibaca.
 */
export async function isiDaftar(event: EventRow, lang: LandingLang, opsi: { pratinjau?: boolean } = {}) {
  const t = DAFTAR_UI[lang];
  const config = event.registration_form_config ?? {};
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const member = memberConfig(event);

  if (!event.registration_enabled && !opsi.pratinjau) {
    // Hanya formulir: alamat acara berakhir di sini, jadi pesannya tetap
    // memakai Tema dan, bila area peserta aktif, membawa jalan ke Masuk:
    // peserta yang sudah terdaftar membuka alamat undangan untuk kodenya.
    if (landingFormOnly(landing)) {
      const bingkai = await bingkaiFormulir(event, lang);
      if (bingkai.modern) {
        return (
          <BingkaiModern lang={lang} halamanUrl={null} eventName={bingkai.eventName} welcomeText={null} theme={bingkai.theme} modern={bingkai.modern} areaUrl={bingkai.modern.areaUrl}>
            <h2 className="text-title-large font-medium">{t.closedTitle}</h2>
            <p className="mt-2 max-w-[60ch] text-body-large text-[var(--reg-on-surface-variant)]">{t.closedBody(bingkai.eventName)}</p>
            {member ? (
              <a
                href={bingkai.modern.areaUrl ?? `/e/${event.slug}/masuk`}
                className="m3-state mt-6 inline-flex min-h-12 items-center rounded-md bg-[var(--reg-primary)] px-5 text-label-large font-semibold text-[var(--reg-on-primary)]"
                style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
              >
                {bingkai.modern.areaUrl ? t.account.openArea : t.signInMemberArea}
              </a>
            ) : null}
          </BingkaiModern>
        );
      }
    }
    return <Pesan lang={lang} judul={t.closedTitle} isi={t.closedBody(publicEventName(event))} />;
  }

  const bingkai = await bingkaiFormulir(event, lang, opsi);
  const tanggal = formatEventDate(event, lang);
  const jam = formatEventTime(event, lang);
  return <DaftarClient
    lang={lang}
    halamanUrl={bingkai.halamanUrl}
    modern={bingkai.modern}
    theme={bingkai.theme}
    eventName={bingkai.eventName}
    eventSlug={event.slug}
    schedule={lang === "id" ? formatEventSchedule(event) : tanggal ? [tanggal, jam].filter(Boolean).join(" · ") : null}
    fields={config.fields ?? []}
    welcomeText={bingkai.welcomeText}
    successText={config.success_text ?? null}
    // Area peserta menyala: email adalah nama pengguna, jadi selalu wajib.
    requireEmail={Boolean(member) || config.require_email !== false}
    akun={member ? { minPassword: PASSWORD_MIN } : null}
    requirePhone={config.require_phone !== false}
    requireCompany={config.require_company ?? false}
    requireJobTitle={config.require_job_title ?? false}
  />;
}

export function Pesan({ lang, judul, isi }: { lang: LandingLang; judul: string; isi: string }) {
  return <main lang={LANDING_LANG_LABELS[lang].htmlLang} className="grid min-h-dvh place-items-center bg-surface px-5 text-on-surface">
    <HtmlLang lang={LANDING_LANG_LABELS[lang].htmlLang} />
    <div className="rounded-lg w-full max-w-md border border-outline-variant bg-panel p-8 text-center">
      <h1 className="text-headline-small font-semibold tracking-[-0.03em]">{judul}</h1>
      <p className="mt-3 text-body-medium leading-6 text-on-surface-variant">{isi}</p>
    </div>
  </main>;
}
