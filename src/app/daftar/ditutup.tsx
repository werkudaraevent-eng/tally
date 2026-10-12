import { ArrowRight, EnvelopeSimple, Phone } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { CSSProperties } from "react";
import { DAFTAR_UI } from "@/lib/daftar-i18n";
import type { LandingLang } from "@/lib/landing-i18n";

const MUTED = "text-[var(--reg-on-surface-variant)]";
const HEAD = "[font-family:var(--landing-heading)]";
const KONTAK = "m3-state -ml-3 inline-flex min-h-12 min-w-0 items-center gap-2 rounded-md px-3 text-body-medium font-semibold";

/**
 * Isi halaman /daftar saat pendaftaran ditutup, di dalam kerangka formulir
 * acara (bilah atas, hero KV, kaki), bukan kotak polos di layar kosong.
 *
 * Kiri: kabarnya dan jalan keluar yang tersedia (masuk area peserta bagi yang
 * sudah terdaftar, kembali ke halaman acara, email panitia). Kanan: tiket
 * acara berwarna merek dengan cap "Ditutup", supaya halamannya tetap terasa
 * milik acara ini dan kabarnya terbaca sekilas.
 */
export function PendaftaranDitutup({
  lang,
  eventName,
  fakta,
  masukUrl,
  areaUrl,
  halamanUrl,
  kontak,
  telepon,
  sempit = false,
}: {
  lang: LandingLang;
  eventName: string;
  /** Tanggal, jam, tempat; sama dengan chip di kepala formulir. */
  fakta: string[];
  /** Area peserta menyala: halaman masuk dalam bahasa ini. */
  masukUrl: string | null;
  /** Sudah masuk: area peserta langsung. */
  areaUrl: string | null;
  halamanUrl: string | null;
  /** Email panitia: kontak halaman acara, atau Reply-to email. */
  kontak: string | null;
  /** Telepon panitia dari kontak halaman acara. */
  telepon: string | null;
  /** Kartu sempit (Editorial): tiket di bawah teks, bukan di kanan. */
  sempit?: boolean;
}) {
  const t = DAFTAR_UI[lang];
  const tombolUtama = areaUrl ?? masukUrl;
  return (
    <div className={`grid gap-x-16 gap-y-10 ${sempit ? "" : "lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center"}`}>
      <div className="min-w-0">
        <h2 className={`text-balance text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px] ${HEAD}`}>{t.closed.heading}</h2>
        <p className={`mt-3 max-w-[58ch] text-body-large leading-7 ${MUTED}`}>{t.closed.lead}</p>

        {tombolUtama ? (
          <div className="mt-8 rounded-lg border border-[var(--reg-outline-variant)] bg-[var(--reg-surface)] p-5">
            <p className="text-title-small font-semibold">{t.alreadyRegistered}</p>
            <p className={`mt-1 text-body-medium ${MUTED}`}>{t.closed.memberHint}</p>
            <Link
              href={tombolUtama}
              className="m3-state mt-4 inline-flex min-h-12 items-center gap-2 rounded-md bg-[var(--reg-primary)] px-5 text-label-large font-semibold text-[var(--reg-on-primary)]"
              style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
            >
              {areaUrl ? t.account.openArea : t.signInMemberArea}
              <ArrowRight size={18} weight="bold" />
            </Link>
          </div>
        ) : null}

        {halamanUrl ? (
          <Link
            href={halamanUrl}
            className="m3-state -ml-3 mt-4 inline-flex min-h-12 items-center rounded-md px-3 text-label-large font-semibold text-[var(--reg-primary)]"
          >
            {t.backToEvent}
          </Link>
        ) : null}

        {kontak || telepon ? (
          <div className="mt-4 border-t border-[var(--reg-outline-variant)] pt-5">
            <p className={`text-body-medium ${MUTED}`}>{t.closed.contact}</p>
            <div className="mt-1 flex flex-wrap gap-x-6">
              {kontak ? (
                <a href={`mailto:${kontak}`} className={`${KONTAK} [overflow-wrap:anywhere]`}>
                  <EnvelopeSimple size={18} className="shrink-0 text-[var(--reg-on-surface-variant)]" />
                  {kontak}
                </a>
              ) : null}
              {telepon ? (
                <a href={`tel:${telepon.replace(/[^\d+]/g, "")}`} className={`${KONTAK} tabular-nums`}>
                  <Phone size={18} className="shrink-0 text-[var(--reg-on-surface-variant)]" />
                  {telepon}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <TiketDitutup lang={lang} eventName={eventName} fakta={fakta} />
    </div>
  );
}

/** Tiket acara dengan sobekan dan cap "Ditutup". Hiasan: pembaca layar mendapat judulnya dari teks di kiri. */
function TiketDitutup({ lang, eventName, fakta }: { lang: LandingLang; eventName: string; fakta: string[] }) {
  const t = DAFTAR_UI[lang];
  const lubang = "absolute size-7 rounded-full bg-[var(--reg-panel,var(--reg-surface))]";
  return (
    <div
      aria-hidden
      className="relative mx-auto w-full max-w-[400px] select-none overflow-hidden rounded-xl text-[var(--reg-on-brand,var(--reg-on-primary))] shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)]"
      style={{ background: "var(--reg-brand, var(--reg-primary))" }}
    >
      <div className="px-7 pb-6 pt-7">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] opacity-75">{t.closed.ticket}</p>
        <p className={`mt-3 text-balance text-[24px] font-semibold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere] ${HEAD}`}>{eventName}</p>
      </div>
      <div className="relative">
        <span className={`${lubang} -left-3.5 -top-3.5`} />
        <span className={`${lubang} -right-3.5 -top-3.5`} />
        <div className="mx-7 border-t-2 border-dashed border-[color-mix(in_srgb,currentColor_35%,transparent)]" />
      </div>
      <div className="flex flex-col gap-4 px-7 pb-7 pt-5 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
        <ul className="min-w-0 space-y-1.5 text-body-medium tabular-nums opacity-90">
          {fakta.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <span className="mb-1 shrink-0 self-end -rotate-[12deg] rounded-md border-[3px] border-current px-2.5 py-0.5 text-[18px] font-extrabold uppercase tracking-[0.12em]">
          {t.closed.stamp}
        </span>
      </div>
    </div>
  );
}
