import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { formatEventSchedule } from "@/lib/event-datetime";
import { getMemberSession, memberConfig, PASSWORD_MIN } from "@/lib/member/account";
import { memberPageStyle } from "@/lib/member/page-theme";
import type { EventLandingConfig } from "@/lib/domain";
import { renderLanding } from "@/components/landing/render-landing";
import { asalSitus } from "@/app/e/[slug]/landing-metadata";
import { MasukClient } from "./masuk-client";

/**
 * Masuk area peserta: `/e/<slug>/masuk`.
 *
 * Dua mode di satu halaman: masuk dengan kata sandi, dan membuat kata sandi
 * dengan kode peserta (dipakai juga saat lupa kata sandi). Peserta yang sudah
 * masuk langsung diantar ke area peserta.
 *
 * Acara bertata letak Modern tidak punya halaman masuk sendiri: alamat ini
 * merender halaman acaranya dengan dialog masuk sudah terbuka
 * (components/member/masuk-dialog.tsx). Tata letak lain tetap memakai halaman
 * di bawah.
 */

export const dynamic = "force-dynamic";
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Tidak diindeks; canonical ke halaman acara, karena di tata letak Modern isi
  // alamat ini adalah halaman acara itu sendiri dengan dialog terbuka.
  const raw = (await searchParams).eventSlug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  const asal = slug ? await asalSitus() : null;
  return {
    title: "Masuk area peserta",
    robots: { index: false, follow: false },
    ...(slug && asal ? { alternates: { canonical: `${asal}/e/${encodeURIComponent(slug)}` } } : null),
  };
}

export default async function MasukPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const event = await getPublicPageEvent(Promise.resolve(params));
  if (!event || event.status === "archived" || !memberConfig(event)) notFound();
  if (await getMemberSession(event)) redirect(`/e/${event.slug}/peserta`);

  const modeAwal = params.mode === "aktifkan" ? "aktifkan" : "masuk";
  if ((event.landing_config as EventLandingConfig | null)?.layout === "modern") {
    return renderLanding(event, undefined, { masukAwal: modeAwal });
  }

  const schedule = formatEventSchedule(event);

  return (
    <main className="min-h-dvh bg-[var(--reg-surface)] text-[var(--reg-on-surface)]" style={memberPageStyle(event)}>
      <div className="mx-auto grid min-h-dvh w-full max-w-[1440px] px-5 sm:px-8 lg:grid-cols-12 lg:gap-6 lg:px-10">
        <div className="flex flex-col justify-between gap-10 border-b border-[var(--reg-outline-variant)] py-8 lg:col-span-5 lg:border-b-0 lg:border-r lg:py-12 lg:pr-12">
          <Link
            href={`/e/${event.slug}`}
            className="inline-flex min-h-11 items-center self-start text-title-large font-semibold [font-family:var(--landing-heading)]"
          >
            {event.name}
          </Link>
          <div>
            {schedule ? <p className="text-body-large font-medium text-[var(--reg-on-surface-variant)]">{schedule}</p> : null}
            <h1 className="mt-4 text-balance text-[36px] font-semibold leading-[1.05] [font-family:var(--landing-heading)] sm:text-[48px] lg:text-[56px]">
              Area peserta
            </h1>
            <p className="mt-5 max-w-[42ch] text-body-large leading-7 text-[var(--reg-on-surface-variant)]">
              Lihat kode masuk, kursi, dan susunan acara Anda di satu tempat.
            </p>
          </div>
          <Link
            href={`/e/${event.slug}`}
            className="hidden min-h-11 items-center self-start text-title-small font-semibold text-[var(--reg-primary)] lg:inline-flex"
          >
            Kembali ke halaman acara
          </Link>
        </div>

        <div className="flex flex-col justify-center py-10 lg:col-span-5 lg:col-start-7 lg:py-12">
          <MasukClient slug={event.slug} modeAwal={modeAwal} minPassword={PASSWORD_MIN} />
        </div>
      </div>
    </main>
  );
}
