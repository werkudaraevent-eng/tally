import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { formatEventSchedule } from "@/lib/event-datetime";
import { getMemberSession, memberConfig, PASSWORD_MIN } from "@/lib/member/account";
import { memberPageStyle } from "@/lib/member/page-theme";
import type { EventLandingConfig } from "@/lib/domain";
import { MasukClient } from "./masuk-client";

/**
 * Masuk area peserta: `/e/<slug>/masuk`.
 *
 * Dua mode di satu halaman: masuk dengan kata sandi, dan membuat kata sandi
 * dengan kode peserta (dipakai juga saat lupa kata sandi). Peserta yang sudah
 * masuk langsung diantar ke area peserta.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk area peserta", robots: { index: false, follow: false } };

export default async function MasukPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const event = await getPublicPageEvent(Promise.resolve(params));
  if (!event || event.status === "archived" || !memberConfig(event)) notFound();
  // `ganti=1`: peserta yang sudah masuk membuka jalur buat kata sandi dari
  // Profil untuk mengganti kata sandinya. Tanpa itu ia langsung diantar masuk.
  const ganti = params.ganti === "1" && params.mode === "aktifkan";
  if (!ganti && (await getMemberSession(event))) redirect(`/e/${event.slug}/peserta`);

  const schedule = formatEventSchedule(event);
  const fakta = [...(schedule?.split(" · ") ?? []).slice(0, 1), event.venue_name?.trim()].filter(Boolean) as string[];
  const modeAwal = params.mode === "aktifkan" ? "aktifkan" : "masuk";
  const config = (event.landing_config ?? {}) as EventLandingConfig;
  const kv = config.banner_url?.trim() || null;

  return (
    <main className="min-h-dvh bg-[var(--reg-surface)] text-[var(--reg-on-surface)]" style={memberPageStyle(event)}>
      <div className="mx-auto grid min-h-dvh w-full max-w-[1440px] lg:grid-cols-2 lg:gap-6 lg:p-4">
        {/* Panel KV. Tanpa gambar KV, bidangnya gradasi warna primer tema. */}
        <div className="relative flex min-h-[300px] flex-col justify-between gap-10 overflow-hidden bg-[linear-gradient(180deg,var(--reg-primary)_0%,color-mix(in_oklab,var(--reg-primary)_90%,white)_100%)] px-5 pb-12 pt-6 text-[var(--reg-on-primary)] sm:px-8 lg:rounded-2xl lg:p-12">
          {kv ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={kv} alt="" className="absolute inset-0 size-full object-cover" />
              <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
            </>
          ) : null}
          <Link
            href={`/e/${event.slug}`}
            className="relative inline-flex min-h-11 items-center self-start text-title-medium font-semibold [font-family:var(--landing-heading)]"
          >
            Kembali ke halaman acara
          </Link>
          <div className="relative">
            {fakta.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {fakta.map((isi) => (
                  <li key={isi} className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-label-large font-medium">
                    {isi}
                  </li>
                ))}
              </ul>
            ) : null}
            <h1 className="mt-5 text-balance text-[36px] font-semibold leading-[1.1] [font-family:var(--landing-heading)] sm:text-[48px] lg:text-[56px]">
              {event.name}
            </h1>
            <p className="mt-4 max-w-[44ch] text-body-large leading-7 opacity-90">
              Area peserta: kode QR, tempat duduk, dan susunan acara Anda di satu tempat.
            </p>
          </div>
        </div>

        <div className="-mt-6 flex justify-center rounded-t-3xl bg-[var(--reg-surface)] px-5 py-8 sm:px-8 lg:mt-0 lg:items-center lg:rounded-none lg:py-12">
          <MasukClient slug={event.slug} modeAwal={modeAwal} minPassword={PASSWORD_MIN} />
        </div>
      </div>
    </main>
  );
}
