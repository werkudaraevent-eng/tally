import type { CSSProperties } from "react";
import Link from "next/link";
import type { EventLandingConfig, EventRow, LandingSection, LandingSectionId } from "@/lib/domain";
import { LANDING_HEADING_FONTS, isLandingBlockId, landingBlockHasContent } from "@/lib/domain";
import { modernNavStyle, modernThemeStyle, registrationThemeStyle } from "@/lib/registration-theme-css";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import type { loadAgendaPreview } from "@/lib/landing-agenda";
import { HEAD, MUTED, SHELL } from "./styles";

/**
 * Kerangka tata letak Modern yang dipakai lebih dari satu halaman: halaman acara
 * (event-landing-modern.tsx) dan Dashboard saya peserta (src/app/peserta).
 *
 * Bilah atas, warna, huruf, pita penyelenggara, dan kaki halaman dihitung di
 * satu tempat, supaya pindah dari halaman acara ke dashboard tidak terasa
 * berganti situs: menunya sama, urutannya sama, warnanya sama.
 */

type Agenda = Awaited<ReturnType<typeof loadAgendaPreview>>;

/**
 * Bayangan KV di hero: sedikit gelap di atas (bilah nav), paling terang di
 * tengah, paling pekat di bawah tempat judul dan tombol berdiri. Lebih pekat
 * dari rancangan (55%) karena KV asli bisa putih di bagian bawahnya.
 */
export const KV_SCRIM =
  "linear-gradient(to bottom, rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.12) 40%, rgb(0 0 0 / 0.55) 70%, rgb(0 0 0 / 0.78))";

/** Bayangan rata untuk banner ajakan dan pita dashboard, yang teksnya tidak di bawah. */
export const KV_SCRIM_RATA = "linear-gradient(to bottom, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.7))";

/**
 * Latar kaki: primary dicampur hitam separuh, jadi navy merek (bukan hampir
 * hitam) yang senada dengan hero. Teks putih tetap aman di warna tema apa pun.
 */
export const LATAR_KAKI = "color-mix(in srgb, var(--reg-primary) 55%, black)";

/**
 * Warna teks di atas bidang bergambar: putih di atas KV yang dibayangi, atau
 * on-brand di atas bidang warna merek polos. Dipasang sebagai `--ink` supaya
 * chip dan tombol di dalamnya cukup menulis satu kelas. `--ink-accent` adalah
 * teks tombol berlatar `--ink`: warna merek di atas bidang merek (pasangan yang
 * sama dibalik), primary di atas KV karena tombolnya putih dan merek bisa putih.
 */
export function tinta(adaKv: boolean): CSSProperties {
  return {
    "--ink": adaKv ? "#fff" : "var(--reg-on-brand)",
    "--ink-accent": adaKv ? "var(--reg-primary)" : "var(--reg-brand)",
    "--m3-state-color": "var(--ink)",
  } as CSSProperties;
}

/**
 * Variabel tema, bilah atas, dan huruf judul untuk <main>. Bilah atas dipasang
 * di <main>, bukan di <nav>: hero (dan pita dashboard) juga membacanya
 * (`--nav-h` untuk margin negatifnya).
 */
export function gayaModern(config: EventLandingConfig, theme: CSSProperties = registrationThemeStyle(config.theme)): CSSProperties {
  const kv = config.banner_url ?? null;
  // Tanpa pilihan admin, Modern memakai Source Sans 3 (huruf rancangannya).
  const headingFont = LANDING_HEADING_FONTS[config.heading_font ?? "source"] ?? LANDING_HEADING_FONTS.source;
  const navStyle = modernNavStyle(
    config.nav,
    kv ? { ink: "#ffffff", onInk: "#181d27" } : { ink: "var(--reg-on-brand)", onInk: "var(--reg-brand)" },
  );
  return {
    ...theme,
    ...modernThemeStyle(config.theme?.seed),
    ...navStyle,
    "--landing-heading": headingFont.cssVar,
  } as CSSProperties;
}

/**
 * Bagian yang tampil, menu atas, dan jangkar yang benar-benar dirender.
 *
 * Bagian tampil = saklar CMS DAN ada isinya. Dihitung sekali, dipakai untuk
 * bagian itu sendiri, nav, dan kolom tautan di kaki halaman.
 */
export function bagianModern(
  event: EventRow,
  config: EventLandingConfig,
  sections: LandingSection[],
  agenda: Agenda,
  lang: LandingLang,
  /** Gaya gathering: tanpa kartu Program, Lokasi menjadi Tempat menginap bila ada hotel. */
  opsi: { gathering?: boolean; adaHotel?: boolean } = {},
) {
  const t = LANDING_UI[lang];
  const NAV_LABEL = opsi.gathering
    ? { ...t.nav, agenda: t.navTrip, ...(opsi.adaHotel ? { venue: t.navHotel } : {}) }
    : t.nav;
  const aktif = new Set(sections.filter((section) => section.enabled).map((section) => section.id));
  const speakers = (config.speakers ?? []).filter((speaker) => speaker.name?.trim());
  const isi: Record<LandingSectionId, boolean> = {
    about: Boolean(event.description?.trim()),
    highlights: (config.highlights ?? []).length > 0,
    agenda: agenda.length > 0,
    speakers: speakers.length > 0,
    venue: Boolean(event.venue_name?.trim() || event.venue_address?.trim() || (opsi.gathering && opsi.adaHotel)),
    faq: (config.faq ?? []).length > 0,
    sponsors: (config.sponsors ?? []).some((sponsor) => sponsor.logo_url),
    contact: Boolean(config.contact_name || config.contact_phone || config.contact_email),
  };
  const tampil = (id: LandingSectionId) => aktif.has(id) && isi[id];
  // Program = bagian-bagian rundown sebagai kartu. Satu bagian saja tidak
  // perlu kartu: susunan acara di bawahnya sudah mengatakan hal yang sama.
  const tampilProgram = tampil("agenda") && agenda.length >= 2 && !config.program_hidden && !opsi.gathering;

  const blokById = new Map((config.blocks ?? []).map((block) => [block.id, block]));

  // Menu atas mengikuti urutan halaman: bagian bawaan yang tampil, plus blok
  // yang diberi label menu di CMS. Dibatasi enam supaya tetap satu baris.
  // Id bagian yang benar-benar dirender: tombol jangkar di blok ke bagian yang
  // tidak tampil (mis. "Lihat susunan acara" tanpa rundown) disembunyikan.
  const jangkar = new Set<string>(["isi-acara"]);
  sections
    .filter((section) => section.enabled)
    .forEach((section) => {
      if (isLandingBlockId(section.id)) {
        const block = blokById.get(section.id);
        if (block && landingBlockHasContent(block)) jangkar.add(block.id);
      } else if (tampil(section.id)) {
        jangkar.add(section.id);
      }
    });
  if (tampilProgram) jangkar.add("program");

  const navSections: { id: string; label: string }[] = [];
  const tambahNav = (id: string, label: string) => {
    if (!navSections.some((item) => item.id === id)) navSections.push({ id, label });
  };
  sections
    .filter((section) => section.enabled)
    .forEach((section) => {
      if (isLandingBlockId(section.id)) {
        const block = blokById.get(section.id);
        const label = block?.nav_label?.trim();
        if (block && label && landingBlockHasContent(block)) tambahNav(block.id, label);
        return;
      }
      // Kartu program menempel pada Tentang acara, atau pada Susunan acara bila
      // Tentang acara tidak tampil (lihat `program` di event-landing-modern).
      if (tampilProgram && (section.id === "about" ? tampil("about") : section.id === "agenda" && !tampil("about"))) {
        tambahNav("program", NAV_LABEL.program);
      }
      if (section.id in NAV_LABEL && tampil(section.id)) tambahNav(section.id, NAV_LABEL[section.id as keyof typeof NAV_LABEL]);
    });
  navSections.splice(6);

  const mitra = aktif.has("sponsors") ? (config.sponsors ?? []).filter((sponsor) => sponsor.logo_url) : [];
  const kontak = tampil("contact")
    ? [
        config.contact_name ? { label: config.contact_name, href: null } : null,
        config.contact_email ? { label: config.contact_email, href: `mailto:${config.contact_email}` } : null,
        config.contact_phone ? { label: config.contact_phone, href: `tel:${config.contact_phone}` } : null,
      ].filter((item): item is { label: string; href: string | null } => item !== null)
    : [];

  return { aktif, tampil, tampilProgram, speakers, blokById, jangkar, navSections, mitra, kontak };
}

/**
 * Penyelenggara: pita terang tepat di atas kaki halaman, bukan di atas navy:
 * logo lembaga dibuat untuk latar terang, dan versi putihnya jarang ada. Satu
 * deret rata tengah, sama tinggi, tanpa petak per logo.
 */
export function PitaMitra({ mitra, judul }: { mitra: { logo_url?: string | null; name?: string | null }[]; judul: string }) {
  if (mitra.length === 0) return null;
  return (
    <section aria-labelledby="penyelenggara" className="border-t border-[var(--reg-outline-variant)]">
      <div className={`${SHELL} flex flex-col items-center gap-6 py-10 sm:py-12`}>
        <h2 id="penyelenggara" className={`text-title-small font-semibold ${MUTED}`}>
          {judul}
        </h2>
        <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {mitra.map((sponsor) => (
            <li key={sponsor.logo_url} className="flex h-10 items-center sm:h-12">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sponsor.logo_url ?? ""} alt={sponsor.name ?? ""} loading="lazy" className="max-h-full w-auto max-w-[160px] object-contain" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export type TautanKaki = { label: string; href: string | null };

/** Kaki halaman navy: nama acara, keterangan, satu tombol, dan kolom tautan. */
export function KakiModern({
  nama,
  keterangan,
  tombol,
  kolom,
  tahun,
  poweredBy,
  pil,
}: {
  nama: string;
  /** Catatan kaki dari CMS, atau baris tanggal dan tempat. */
  keterangan: { catatan: string | null; baris: string[] };
  tombol: { href: string; label: string } | null;
  kolom: { judul: string; tautan: TautanKaki[] }[];
  tahun: string;
  poweredBy: string;
  /** Kelas tombol berlatar `--ink` (PIL_INK di halaman acara). */
  pil: string;
}) {
  return (
    <footer data-bagian="kaki" className="text-white" style={{ backgroundColor: LATAR_KAKI }}>
      <div className={`${SHELL} flex flex-col gap-10 pb-8 pt-12 sm:pt-16`}>
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="flex max-w-[420px] flex-col gap-3">
            <p className={`${HEAD} text-title-large font-semibold`}>{nama}</p>
            {keterangan.catatan ? (
              <p className="text-body-medium leading-[1.6] text-white/70">{keterangan.catatan}</p>
            ) : (
              <div className="text-body-medium leading-[1.6] text-white/70">
                {keterangan.baris.map((baris) => (
                  <p key={baris}>{baris}</p>
                ))}
              </div>
            )}
            {tombol ? (
              <div style={tinta(true)} className="mt-3">
                <Link href={tombol.href} className={pil}>
                  {tombol.label}
                </Link>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:flex sm:gap-20">
            {kolom
              .filter((item) => item.tautan.length > 0)
              .map((item) => (
                <KolomKaki key={item.judul} judul={item.judul} tautan={item.tautan} />
              ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-3 border-t border-white/15 pt-6 text-body-small text-white/60">
          <p>
            © {tahun} {nama}
          </p>
          <p>{poweredBy}</p>
        </div>
      </div>
    </footer>
  );
}

function KolomKaki({ judul, tautan }: { judul: string; tautan: TautanKaki[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-title-medium font-semibold">{judul}</p>
      <ul className="flex flex-col">
        {tautan.map((item) => (
          <li key={item.label} className="min-w-0">
            {item.href ? (
              item.href.startsWith("/") ? (
                <Link href={item.href} className="inline-flex min-h-9 items-center break-all text-body-medium text-white/70 hover:text-white">
                  {item.label}
                </Link>
              ) : (
                <a href={item.href} className="inline-flex min-h-9 items-center break-all text-body-medium text-white/70 hover:text-white">
                  {item.label}
                </a>
              )
            ) : (
              <span className="inline-flex min-h-9 items-center text-body-medium text-white/70">{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
