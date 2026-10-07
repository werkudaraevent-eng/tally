import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Bed, Bus, Megaphone, Ticket } from "@phosphor-icons/react/dist/ssr";
import type { AgendaPreview } from "@/lib/landing-agenda";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { HEAD, LABEL_BAGIAN, SHELL } from "./styles";

/**
 * Gaya gathering bergaya aplikasi (rancangan pen.dev Hanung, 2026-10-07):
 * hero navy terbelah dengan pratinjau portal di kanan, bagian Portal peserta,
 * dan pita penutup selebar layar. Warna tombol dari Tema (`button_color`),
 * kata berbintang di tagline memakai warna aksen.
 *
 * Hanya halaman acara gaya gathering yang memakai berkas ini; acara lain tidak
 * menyentuhnya.
 */

/** Tombol utama gaya gathering: warna tombol dari Tema, tinggi 52px. */
export const TOMBOL_AKSI =
  "m3-state inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[var(--aksi)] px-7 text-title-small font-bold text-[var(--on-aksi)]";
const TOMBOL_GARIS =
  "m3-state inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border-2 border-[color-mix(in_srgb,var(--ink)_30%,transparent)] px-7 text-title-small font-bold text-[var(--ink)]";

/** Latar navy bergradasi dari warna merek: lebih gelap di kiri atas, warna merek di kanan bawah. */
const LATAR_HERO = "linear-gradient(160deg, color-mix(in srgb, var(--reg-brand) 62%, black) 0%, color-mix(in srgb, var(--reg-brand) 85%, black) 60%, var(--reg-brand) 100%)";

/** "Liburan bareng, *tumbuh* bareng." menjadi teks dengan kata berbintang berwarna aksen. */
export function judulBerbintang(teks: string): ReactNode[] {
  return teks.split(/(\*[^*\n]+\*)/g).filter(Boolean).map((bagian, index) =>
    /^\*[^*]+\*$/.test(bagian) ? (
      <span key={index} className="text-[var(--hero-angka)]">
        {bagian.slice(1, -1)}
      </span>
    ) : (
      bagian
    ),
  );
}

/** Teks polos tanpa bintang, untuk judul dokumen dan alt. */
export function tanpaBintang(teks: string): string {
  return teks.replace(/\*([^*\n]+)\*/g, "$1");
}

type Aksi = { href: string; label: string; link?: boolean };

export function HeroGathering({
  alis,
  judul,
  catatan,
  fakta,
  aksi,
  aksiKedua,
  pratinjau,
  gaya,
}: {
  alis: string | null;
  judul: string;
  catatan: string | null;
  /** Fakta di bawah tombol; yang pertama (tanggal) berwarna aksen. */
  fakta: string[];
  aksi: Aksi | null;
  aksiKedua: Aksi | null;
  pratinjau: ReactNode;
  gaya: CSSProperties;
}) {
  return (
    <header
      data-bagian="pembuka"
      data-landing-hero
      className="relative isolate -mt-[var(--nav-h)] text-[var(--ink)]"
      style={{ ...gaya, background: LATAR_HERO }}
    >
      <div className={`${SHELL} grid items-center gap-12 pb-14 pt-[calc(var(--nav-h)+40px)] lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16 lg:pb-[88px] lg:pt-[calc(var(--nav-h)+80px)]`}>
        <div className="flex min-w-0 flex-col items-start">
          {alis ? (
            <p className={`mb-6 inline-flex min-h-8 items-center rounded-full border border-[color-mix(in_srgb,var(--ink)_15%,transparent)] bg-[color-mix(in_srgb,var(--ink)_10%,transparent)] px-4 ${LABEL_BAGIAN} text-[12px] text-[var(--hero-alis)]`}>
              {alis}
            </p>
          ) : null}
          <h1 className={`${HEAD} max-w-[760px] text-balance text-[40px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[52px] lg:text-[62px] lg:leading-[1.05]`}>
            {judulBerbintang(judul)}
          </h1>
          {catatan ? (
            <p className="mt-6 max-w-[620px] whitespace-pre-line text-body-large leading-[1.6] opacity-85">{catatan}</p>
          ) : null}
          {aksi || aksiKedua ? (
            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
              {aksi ? <TautanAksi {...aksi} className={TOMBOL_AKSI} /> : null}
              {aksiKedua ? <TautanAksi {...aksiKedua} className={TOMBOL_GARIS} /> : null}
            </div>
          ) : null}
          {fakta.length > 0 ? (
            <ul className="mt-8 flex flex-wrap items-center gap-y-2 text-body-medium font-medium tabular-nums">
              {fakta.map((teks, index) => (
                <li
                  key={teks}
                  className={`flex items-center ${index === 0 ? "basis-full font-bold text-[var(--hero-angka)] sm:basis-auto" : "opacity-85"} ${
                    // Di ponsel tanggal berdiri sendiri, jadi baris kedua tidak diawali garis pemisah.
                    index === 1 ? "sm:before:mx-4 sm:before:h-4 sm:before:w-px sm:before:bg-[color-mix(in_srgb,var(--ink)_25%,transparent)] sm:before:content-['']" : ""
                  } ${
                    index > 1 ? "before:mx-4 before:h-4 before:w-px before:bg-[color-mix(in_srgb,var(--ink)_25%,transparent)] before:content-['']" : ""
                  }`}
                >
                  {teks}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {pratinjau ? <div className="hidden lg:block">{pratinjau}</div> : null}
      </div>
    </header>
  );
}

function TautanAksi({ href, label, link, className }: Aksi & { className: string }) {
  return link ? (
    <Link href={href} className={className}>
      {label}
    </Link>
  ) : (
    <a href={href} className={className}>
      {label}
    </a>
  );
}

/**
 * Pratinjau portal di hero (layar lebar saja): gambaran isi area peserta,
 * tanpa data pribadi siapa pun. Agenda pertama dari rundown; kamar dan bus
 * hanya disebut "setelah masuk".
 */
export function PratinjauPortal({
  nama,
  agendaPertama,
  logistik,
  lang,
}: {
  nama: string;
  agendaPertama: { judul: string; keterangan: string | null } | null;
  logistik: boolean;
  lang: LandingLang;
}) {
  const t = LANDING_UI[lang];
  const ubin = logistik ? [t.portalBus, t.portalRoom] : [t.portalTicket, t.portalNews];
  return (
    <div aria-hidden className="rounded-[36px] bg-[color-mix(in_srgb,var(--reg-brand)_55%,black)] p-2.5 shadow-[0_30px_60px_rgb(0_0_0/0.35)]">
      <div className="overflow-hidden rounded-[28px] bg-[#F4F6F8] text-[#1A2333]">
        <div className="px-5 pb-5 pt-6 text-white" style={{ background: LATAR_HERO }}>
          <p className="text-[11px] opacity-80">{t.portalEyebrow}</p>
          <p className="mt-0.5 truncate text-[16px] font-bold">{nama}</p>
        </div>
        <div className="flex flex-col gap-2.5 p-3.5">
          {agendaPertama ? (
            <div className="rounded-2xl bg-white px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#5F6B7F]">{t.portalFirstUp}</p>
              <p className="mt-1 truncate text-[14px] font-bold">{agendaPertama.judul}</p>
              {agendaPertama.keterangan ? <p className="mt-0.5 truncate text-[11px] text-[#5F6B7F]">{agendaPertama.keterangan}</p> : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            {ubin.map((label) => (
              <div key={label} className="rounded-2xl bg-white px-3.5 py-3">
                <p className="text-[10px] text-[#5F6B7F]">{label}</p>
                <p className="mt-1 text-[12px] font-bold">{t.portalAfterSignIn}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Agenda pertama hari pertama untuk pratinjau: judul acara dan "Jum, 6 Nov · 09.00". */
export function agendaPertama(agenda: AgendaPreview[], lang: LandingLang): { judul: string; keterangan: string | null } | null {
  const bagian = agenda[0];
  const item = bagian?.items.find((butir) => !butir.jeda) ?? bagian?.items[0];
  if (!bagian || !item) return null;
  const hari = bagian.tanggal
    ? new Date(`${bagian.tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    : null;
  return { judul: item.title, keterangan: [hari, item.time].filter(Boolean).join(" · ") || null };
}

/**
 * Bagian Portal peserta: apa saja yang menunggu tamu setelah masuk. Ubinnya
 * mengikuti saklar Area peserta, jadi tidak pernah menjanjikan yang tidak ada.
 */
export function PortalGathering({
  alis,
  judul,
  catatan,
  aksi,
  ubin,
}: {
  alis: string;
  judul: string;
  catatan: string;
  aksi: Aksi | null;
  ubin: { ikon: "tiket" | "kamar" | "bus" | "pengumuman"; judul: string; teks: string }[];
}) {
  const IKON = { tiket: Ticket, kamar: Bed, bus: Bus, pengumuman: Megaphone } as const;
  return (
    <section id="portal" className="scroll-mt-[var(--nav-h)] py-14 sm:py-[72px]">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <div className="flex max-w-[560px] flex-col items-start">
          <p className={`${LABEL_BAGIAN} text-[var(--alis)]`}>{alis}</p>
          <h2 className={`${HEAD} mt-3 text-balance text-[28px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[36px]`}>{judul}</h2>
          <p className="mt-4 text-body-large leading-[1.6] text-[var(--reg-on-surface-variant)]">{catatan}</p>
          {aksi ? <TautanAksi {...aksi} className={`${TOMBOL_AKSI} mt-7`} /> : null}
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {ubin.map(({ ikon, judul: judulUbin, teks }) => {
            const Ikon = IKON[ikon];
            return (
              <li key={judulUbin} className="flex flex-col gap-3 rounded-2xl bg-[var(--reg-panel)] p-4 sm:p-5">
                <Ikon size={24} aria-hidden className="text-[var(--alis)]" />
                <div>
                  <p className="text-title-medium font-bold">{judulUbin}</p>
                  <p className="mt-1 text-body-medium text-[var(--reg-on-surface-variant)]">{teks}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Pita penutup selebar layar: judul, kalimat, satu tombol. */
export function PitaPenutupGathering({ judul, catatan, aksi, gaya }: { judul: string; catatan: string | null; aksi: Aksi; gaya: CSSProperties }) {
  return (
    <section className="text-[var(--ink)]" style={{ ...gaya, background: LATAR_HERO }}>
      <div className={`${SHELL} flex flex-col items-center gap-5 py-16 text-center sm:py-[72px]`}>
        <h2 className={`${HEAD} max-w-[800px] text-balance text-[32px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[44px]`}>{judul}</h2>
        {catatan ? <p className="max-w-[640px] text-body-large opacity-85">{catatan}</p> : null}
        <TautanAksi {...aksi} className={`${TOMBOL_AKSI} mt-2`} />
      </div>
    </section>
  );
}
