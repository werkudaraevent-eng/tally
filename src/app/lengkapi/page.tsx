import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import type { EventLandingConfig, EventRow } from "@/lib/domain";
import { formatEventSchedule, formatEventDate } from "@/lib/event-datetime";
import { eventSender } from "@/lib/email/client";
import { kontakPanitia } from "@/lib/kontak-panitia";
import { landingDefaultLang, landingEnAvailable, landingPath, withQuery, type LandingLang } from "@/lib/landing-i18n";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { loadPesertaLengkapi, readDataToken, updatableFields } from "@/lib/member/lengkapi";
import { LENGKAPI_UI } from "@/lib/member/lengkapi-i18n";
import { maskEmail } from "@/lib/undangan/email";
import { bingkaiFormulir } from "@/app/daftar/isi-daftar";
import { Bingkai, BingkaiModern } from "@/app/daftar/daftar-client";
import { LengkapiClient } from "./lengkapi-client";

/**
 * Lengkapi data: `/e/<slug>/lengkapi?t=<token>` dari kiriman "Update details
 * link", atau `/e/<slug>/lengkapi` dari kartu dashboard (sesi area peserta).
 * Versi bahasa lain lewat `/e/<slug>/en/lengkapi` (proxy mengisi `?bahasa=`).
 *
 * Berdiri di kerangka formulir pendaftaran acara (bilah atas, kepala, kaki),
 * sama dengan halaman "Pendaftaran ditutup", di semua tata letak.
 */

export const dynamic = "force-dynamic";

type Kueri = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Kueri }) {
  const kueri = await searchParams;
  return {
    title: LENGKAPI_UI[kueri.bahasa === "en" ? "en" : "id"].title,
    // Tautan pribadi: jangan diindeks, dan jangan bocorkan tokennya lewat Referer.
    robots: { index: false, follow: false },
    referrer: "no-referrer" as const,
  };
}

export default async function LengkapiPage({ searchParams }: { searchParams: Kueri }) {
  const kueri = await searchParams;
  const event = await getPublicPageEvent(Promise.resolve(kueri));
  if (!event || event.status === "archived") notFound();
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const utama = landingDefaultLang(landing);
  const minta: LandingLang | null = kueri.bahasa === "en" || kueri.bahasa === "id" ? kueri.bahasa : null;
  if (minta && (minta === utama || !landingEnAvailable(landing))) {
    const sisa = Object.fromEntries(Object.entries(kueri).filter(([kunci]) => kunci !== "eventSlug" && kunci !== "bahasa"));
    redirect(withQuery(`/e/${event.slug}/lengkapi`, sisa));
  }
  const lang = minta ?? utama;
  const t = LENGKAPI_UI[lang];
  const dasar = landingPath(event.slug, lang, utama);
  const member = memberConfig(event);
  const token = typeof kueri.t === "string" ? kueri.t : null;

  const sesi = member ? await getMemberSession(event) : null;
  const areaUrl = sesi ? `${dasar}/peserta` : null;

  let participantId: string | null = null;
  let berlakuSampai: string | null = null;
  if (token) {
    const baca = await readDataToken(event.id, token);
    if (baca) {
      participantId = baca.participantId;
      berlakuSampai = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: event.time_zone || "Asia/Jakarta",
      }).format(new Date(baca.expiresAt));
    }
  } else if (sesi?.participant) {
    participantId = sesi.participant.id;
  } else if (member && !sesi) {
    // Dari dashboard tanpa sesi (keluar di tab lain): masuk dulu.
    redirect(`${dasar}/masuk`);
  }

  const peserta = participantId ? await loadPesertaLengkapi(event.id, participantId) : null;
  const fields = updatableFields(event);

  let isi: React.ReactNode;
  if (!peserta) {
    isi = await Pesan(event, lang, { judul: t.invalidTitle, teks: t.invalidBody, masukUrl: member && !sesi ? `${dasar}/masuk` : null, areaUrl });
  } else if (fields.length === 0) {
    isi = await Pesan(event, lang, { judul: t.noFieldsTitle, teks: t.noFieldsBody, masukUrl: null, areaUrl });
  } else {
    isi = (
      <LengkapiClient
        lang={lang}
        token={token}
        nama={peserta.name}
        email={token && peserta.email ? maskEmail(peserta.email) : null}
        fields={fields}
        nilaiAwal={peserta.extra}
        berlakuSampai={berlakuSampai}
        areaUrl={areaUrl}
        halamanUrl={dasar}
      />
    );
  }

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

/** Tautan tidak berlaku atau tidak ada yang perlu diisi, dengan jalan keluar yang tersedia. */
async function Pesan(
  event: EventRow,
  lang: LandingLang,
  opsi: { judul: string; teks: string; masukUrl: string | null; areaUrl: string | null },
) {
  const t = LENGKAPI_UI[lang];
  const panitia = kontakPanitia(event.landing_config as EventLandingConfig | null, (await eventSender(event.id).catch(() => null))?.replyTo);
  const tombol = opsi.areaUrl ? { href: opsi.areaUrl, label: t.openArea } : opsi.masukUrl ? { href: opsi.masukUrl, label: t.signIn } : null;
  return (
    <div className="max-w-[640px]">
      <h2 className="text-balance text-[26px] font-semibold leading-tight tracking-[-0.02em] [font-family:var(--landing-heading)] sm:text-[32px]">{opsi.judul}</h2>
      <p className="mt-3 text-body-large leading-7 text-[var(--reg-on-surface-variant)]">{opsi.teks}</p>
      {tombol ? (
        <Link
          href={tombol.href}
          className="m3-state mt-6 inline-flex min-h-12 items-center rounded-md bg-[var(--reg-primary)] px-5 text-label-large font-semibold text-[var(--reg-on-primary)]"
          style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
        >
          {tombol.label}
        </Link>
      ) : null}
      {panitia ? (
        <p className="mt-6 text-body-medium text-[var(--reg-on-surface-variant)]">
          {t.contact}{" "}
          {panitia.email ? (
            <a href={`mailto:${panitia.email}`} className="font-semibold text-[var(--reg-primary)] [overflow-wrap:anywhere]">
              {panitia.email}
            </a>
          ) : (
            <a href={`tel:${(panitia.telepon ?? "").replace(/[^\d+]/g, "")}`} className="font-semibold text-[var(--reg-primary)] tabular-nums">
              {panitia.telepon}
            </a>
          )}
        </p>
      ) : null}
    </div>
  );
}
