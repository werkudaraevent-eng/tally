import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarPlus, MapPin, Minus, Plus } from "@phosphor-icons/react/dist/ssr";
import type {
  EventLandingConfig,
  EventRow,
  LandingHeadingScale,
  LandingHeroHeight,
  LandingSection,
  LandingSectionId,
} from "@/lib/domain";
import { LANDING_HEADING_FONTS, LANDING_SECTION_LABELS, isLandingBlockId, publicEventName } from "@/lib/domain";
import { modernThemeStyle } from "@/lib/registration-theme-css";
import { formatEventDate, formatEventTime } from "@/lib/event-datetime";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { rentangAkhir } from "@/lib/landing-agenda-range";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { timeZoneAbbr } from "@/lib/timezone";
import { AgendaPills } from "./modern/agenda-pills";
import { LandingNavModern } from "./modern/landing-nav-modern";
import { SpeakerGrid } from "./modern/speaker-grid";
import { HEAD, JUDUL, MUTED, PIL, PIL_GARIS, PIL_PENUH, SECTION, SHELL } from "./modern/styles";
import { LandingBlockView } from "./modern/landing-blocks";

/**
 * Landing page publik acara, tata letak Modern (`landing_config.layout`).
 *
 * Diterjemahkan dari rancangan Figma "Desktop — PRIMA 2026 (v2)". Membaca data
 * yang SAMA dengan tata letak Editorial (event-landing.tsx); yang berbeda
 * hanya susunan dan gayanya. Editorial tetap bawaan.
 *
 * ---- Beda dengan Editorial ------------------------------------------------
 *
 * - Urutan bagian mengikuti susunan di CMS, termasuk blok dari pustaka blok
 *   (modern/landing-blocks.tsx). Hero selalu pertama; banner ajakan dan kaki
 *   selalu terakhir. Program menempel pada Tentang acara.
 * - Hero selalu KV warna asli dengan bayangan gelap. Tanpa KV, hero adalah
 *   bidang warna primary dengan teks on-primary.
 * - Tombol `rounded-md` (DESIGN.md), chip fakta pil, kartu `rounded-lg`.
 *
 * ---- Aturan yang sama -----------------------------------------------------
 *
 * - Bagian tanpa isi tidak dirender, termasuk dari navigasi jangkar.
 * - Teks contoh rancangan ("[Nama tempat]", "[Logo mitra]") TIDAK pernah tampil:
 *   setiap teks datang dari data acara, atau dari judul bawaan yang umum.
 * - Warna dari tema acara (`--reg-*`). Biru navy di Figma adalah primary tema.
 * - Teks putih hanya di atas gambar yang diberi bayangan hitam, atau di atas
 *   latar yang digelapkan dengan campuran hitam. Di atas warna tema, pasangan
 *   `on-primary` yang dipakai.
 */

type Props = {
  event: EventRow;
  config: EventLandingConfig;
  sections: LandingSection[];
  theme: CSSProperties;
};

const STATE_ON_PRIMARY = { "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties;

/** Label jangkar nav, sesuai rancangan (lebih pendek dari label CMS). */
const NAV_LABEL = {
  program: "Program",
  speakers: "Pembicara",
  agenda: "Susunan acara",
  venue: "Lokasi",
  faq: "FAQ",
} as const;

/**
 * Tinggi minimum hero, termasuk bilah nav yang menumpang di atasnya. Patokan
 * `tall` = 850px, tinggi hero di rancangan.
 */
const HERO_HEIGHT: Record<LandingHeroHeight, string> = {
  compact: "min-h-[480px] lg:min-h-[600px]",
  standard: "min-h-[560px] sm:min-h-[640px] lg:min-h-[760px]",
  tall: "min-h-[620px] sm:min-h-[720px] lg:min-h-[850px]",
};

/** Ukuran nama acara. `lg` = 72px, ukuran di rancangan. */
const HEADING_SCALE: Record<LandingHeadingScale, string> = {
  md: "text-[40px] sm:text-[52px] lg:text-[64px]",
  lg: "text-[44px] sm:text-[60px] lg:text-[72px]",
  xl: "text-[48px] sm:text-[72px] lg:text-[96px]",
};

/**
 * Bayangan KV di hero: sedikit gelap di atas (bilah nav), paling terang di
 * tengah, paling pekat di bawah tempat judul dan tombol berdiri. Lebih pekat
 * dari rancangan (55%) karena KV asli bisa putih di bagian bawahnya.
 */
const KV_SCRIM =
  "linear-gradient(to bottom, rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.12) 40%, rgb(0 0 0 / 0.55) 70%, rgb(0 0 0 / 0.78))";

/** Bayangan rata untuk banner ajakan, yang teksnya di tengah. */
const KV_SCRIM_RATA = "linear-gradient(to bottom, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.7))";

/** Latar kaki: primary dicampur hitam pekat. Teks putih aman di warna tema apa pun. */
const LATAR_KAKI = "color-mix(in srgb, var(--reg-primary) 22%, black)";

const HERO_DELAY = (step: number) => ({ "--rise-delay": `${step * 60}ms` }) as CSSProperties;

/**
 * Warna teks di atas bidang bergambar: putih di atas KV yang dibayangi, atau
 * on-brand di atas bidang warna merek polos. Dipasang sebagai `--ink` supaya
 * chip dan tombol di dalamnya cukup menulis satu kelas. `--ink-accent` adalah
 * teks tombol berlatar `--ink`: warna merek di atas bidang merek (pasangan yang
 * sama dibalik), primary di atas KV karena tombolnya putih dan merek bisa putih.
 */
function tinta(adaKv: boolean): CSSProperties {
  return {
    "--ink": adaKv ? "#fff" : "var(--reg-on-brand)",
    "--ink-accent": adaKv ? "var(--reg-primary)" : "var(--reg-brand)",
    "--m3-state-color": "var(--ink)",
  } as CSSProperties;
}

/** Chip pil di atas bidang bergambar (hero, kartu). */
const CHIP_INK =
  "inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--ink)_30%,transparent)] bg-[color-mix(in_srgb,var(--ink)_14%,transparent)] px-3.5 py-1.5 text-label-large font-normal";

/** Chip pil di atas permukaan terang (kartu program). */
const CHIP =
  "inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--reg-on-surface)_12%,transparent)] bg-[color-mix(in_srgb,var(--reg-on-surface)_5%,transparent)] px-3.5 py-1.5 text-label-large font-normal tabular-nums";

/**
 * Tombol di atas bidang bergambar: latar `--ink`, teks `--ink-accent`. Lihat
 * `tinta` untuk pasangannya.
 */
const PIL_INK = `${PIL} bg-[var(--ink)] font-semibold text-[var(--ink-accent)]`;

function Kv({ src, scrim }: { src: string; scrim: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="settle-in absolute inset-0 -z-10 size-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: scrim }} />
    </>
  );
}

function Section({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <section id={id} className={SECTION}>
      {children}
    </section>
  );
}

function tautanPeta(url: string): string {
  return /google\.|goo\.gl/i.test(url) ? "Buka di Google Maps" : "Buka peta";
}

export async function EventLandingModern({ event, config, sections, theme }: Props) {
  const aktif = new Set(sections.filter((section) => section.enabled).map((section) => section.id));
  const daftarUrl = `/e/${event.slug}/daftar`;
  const ctaLabel = config.cta_label?.trim() || "Daftar sekarang";
  const speakers = (config.speakers ?? []).filter((speaker) => speaker.name?.trim());
  const agenda = await loadAgendaPreview(event.id);
  const zona = timeZoneAbbr(event.time_zone);

  const member = memberConfig(event);
  const memberLink = member
    ? (await getMemberSession(event))
      ? { href: `/e/${event.slug}/peserta`, label: "Area peserta" }
      : { href: `/e/${event.slug}/masuk`, label: "Masuk" }
    : null;

  // Bagian yang tampil: saklar CMS DAN ada isinya. Dihitung sekali, dipakai
  // untuk bagian itu sendiri, nav, dan kolom tautan di kaki halaman.
  const isi: Record<LandingSectionId, boolean> = {
    about: Boolean(event.description?.trim()),
    highlights: (config.highlights ?? []).length > 0,
    agenda: agenda.length > 0,
    speakers: speakers.length > 0,
    venue: Boolean(event.venue_name?.trim() || event.venue_address?.trim()),
    faq: (config.faq ?? []).length > 0,
    sponsors: (config.sponsors ?? []).some((sponsor) => sponsor.logo_url),
    contact: Boolean(config.contact_name || config.contact_phone || config.contact_email),
  };
  const tampil = (id: LandingSectionId) => aktif.has(id) && isi[id];
  // Program = bagian-bagian rundown sebagai kartu. Satu bagian saja tidak
  // perlu kartu: susunan acara di bawahnya sudah mengatakan hal yang sama.
  const tampilProgram = tampil("agenda") && agenda.length >= 2;

  const navSections = [
    ...(tampilProgram ? [{ id: "program", label: NAV_LABEL.program }] : []),
    ...(tampil("speakers") ? [{ id: "speakers", label: NAV_LABEL.speakers }] : []),
    ...(tampil("agenda") ? [{ id: "agenda", label: NAV_LABEL.agenda }] : []),
    ...(tampil("venue") ? [{ id: "venue", label: NAV_LABEL.venue }] : []),
    ...(tampil("faq") ? [{ id: "faq", label: NAV_LABEL.faq }] : []),
  ];

  const kv = config.banner_url ?? null;
  const blokById = new Map((config.blocks ?? []).map((block) => [block.id, block]));
  const nama = publicEventName(event);
  const tanggal = formatEventDate(event);
  const jam = formatEventTime(event);
  const venue = event.venue_name?.trim() || null;
  const fakta = [tanggal, jam, venue].filter((item): item is string => Boolean(item));

  // Angka di kartu Sekilas: angka penting pertama dari CMS bila bagian itu
  // menyala, atau jumlah sesi di rundown. Tidak ada angka = kartu tanpa angka.
  const sorotan = tampil("highlights") ? config.highlights?.[0] : undefined;
  const totalSesi = agenda.reduce((jumlah, bagian) => jumlah + bagian.items.length, 0);
  const stat = sorotan
    ? { nilai: sorotan.value, label: sorotan.label }
    : totalSesi > 0
      ? { nilai: `${totalSesi} sesi`, label: agenda.length > 1 ? `Dalam ${agenda.length} program.` : null }
      : null;

  // Tanpa pilihan admin, Modern memakai Source Sans 3 (huruf rancangannya),
  // Editorial tetap Playfair Display.
  const headingFont = LANDING_HEADING_FONTS[config.heading_font ?? "source"] ?? LANDING_HEADING_FONTS.source;
  const mainStyle = { ...theme, ...modernThemeStyle(config.theme?.seed), "--landing-heading": headingFont.cssVar } as CSSProperties;

  // Tertonjol lebih dulu; urutan admin dipertahankan di dalam tiap kelompok.
  const urutPembicara = [...speakers.filter((s) => s.featured), ...speakers.filter((s) => !s.featured)];

  const kalenderUrl = event.event_date ? `/kalender.ics?eventSlug=${encodeURIComponent(event.slug)}` : null;
  const tahun = (event.event_date ?? new Date().toISOString()).slice(0, 4);

  const kontak = tampil("contact")
    ? [
        config.contact_name ? { label: config.contact_name, href: null } : null,
        config.contact_email ? { label: config.contact_email, href: `mailto:${config.contact_email}` } : null,
        config.contact_phone ? { label: config.contact_phone, href: `tel:${config.contact_phone}` } : null,
      ].filter((item): item is { label: string; href: string | null } => item !== null)
    : [];
  const tautanTamu = [
    ...(event.registration_enabled ? [{ label: "Daftar", href: daftarUrl }] : []),
    ...(memberLink ? [{ label: memberLink.label === "Masuk" ? "Masuk area peserta" : memberLink.label, href: memberLink.href }] : []),
    ...(tampil("faq") ? [{ label: "FAQ", href: "#faq" }] : []),
  ];
  const tautanAcara = navSections.filter((section) => section.id !== "faq");

  // Bagian bawaan, dirender menurut susunan dari CMS bersama blok dari pustaka
  // blok. Program (kartu dari bagian rundown) menempel pada Tentang acara, atau
  // pada Susunan acara bila Tentang acara tidak tampil.
  const program = (
    <>
        {/* ---- Program ------------------------------------------------------ */}
        {tampilProgram ? (
          <Section id="program">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
              <h2 className={`${JUDUL} max-w-[640px] whitespace-pre-line`}>{config.program_heading?.trim() || "Program"}</h2>
              {config.program_intro?.trim() ? (
                <p className={`max-w-[520px] text-body-large ${MUTED}`}>{config.program_intro.trim()}</p>
              ) : null}
            </div>
            <ul className="mt-10 grid gap-4 sm:mt-14 sm:gap-6 md:grid-cols-2">
              {agenda.map((bagian, index) => {
                const awal = bagian.items[0]?.time;
                const akhir = rentangAkhir(bagian);
                const catatan = config.program_notes?.[index]?.trim();
                return (
                  <li
                    key={bagian.sectionTitle ?? index}
                    className="flex flex-col gap-5 rounded-md bg-[var(--reg-panel)] p-6 sm:p-10"
                  >
                    <div className="flex flex-wrap gap-2">
                      {awal ? (
                        <span className={CHIP}>
                          {akhir && akhir !== awal ? `${awal} – ${akhir}` : awal} {zona}
                        </span>
                      ) : null}
                      <span className={CHIP}>{bagian.items.length} sesi</span>
                    </div>
                    <h3 className="text-balance text-headline-medium font-medium">
                      {bagian.sectionTitle || `Bagian ${index + 1}`}
                    </h3>
                    {catatan ? <p className={`whitespace-pre-line text-body-large ${MUTED}`}>{catatan}</p> : null}
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}
    </>
  );
  const bawaan: Partial<Record<LandingSectionId, ReactNode>> = {
    about: (
      <>
        {/* ---- Sekilas acara ------------------------------------------------ */}
        {tampil("about") ? (
          <Section id="about">
            <div className={`grid items-center gap-10 lg:gap-20 ${kv || stat ? "lg:grid-cols-2" : ""}`}>
              {kv || stat ? (
                <div
                  className={`relative isolate flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg p-6 sm:aspect-[625/550] ${
                    kv ? "bg-black" : "bg-[var(--reg-brand)]"
                  }`}
                  style={tinta(Boolean(kv))}
                >
                  {kv ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={kv} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />
                    </>
                  ) : null}
                  {stat ? (
                    <div
                      className={`flex max-w-[360px] flex-col gap-4 rounded-lg p-8 text-[var(--ink)] sm:p-12 ${
                        kv ? "bg-black/40 backdrop-blur-[10px]" : "bg-[color-mix(in_srgb,var(--ink)_10%,transparent)]"
                      }`}
                    >
                      <p className={`${HEAD} text-[56px] leading-[1.1] tabular-nums sm:text-[80px]`}>{stat.nilai}</p>
                      {stat.label ? <p className="text-title-large font-medium leading-[1.5]">{stat.label}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex max-w-[572px] flex-col items-start gap-8 sm:gap-10">
                <div className="flex flex-col gap-6">
                  <h2 className={JUDUL}>{config.about_heading?.trim() || LANDING_SECTION_LABELS.about}</h2>
                  {/* whitespace-pre-line: paragraf dipisah enter di CMS. */}
                  <p className={`whitespace-pre-line text-body-large ${MUTED}`}>{event.description}</p>
                </div>
                {tampil("agenda") ? (
                  <a href="#agenda" className={PIL_PENUH} style={STATE_ON_PRIMARY}>
                    Lihat susunan acara
                  </a>
                ) : null}
              </div>
            </div>
          </Section>
        ) : null}
        {tampil("about") ? program : null}
      </>
    ),
    agenda: (
      <>
        {tampil("about") ? null : program}
        {/* ---- Susunan acara ------------------------------------------------ */}
        {tampil("agenda") ? (
          <Section id="agenda">
            <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
              <h2 className={JUDUL}>{LANDING_SECTION_LABELS.agenda}</h2>
              <Link href={`/e/${event.slug}/rundown`} className={PIL_GARIS}>
                Susunan lengkap
              </Link>
            </div>
            <AgendaPills agenda={agenda} />
          </Section>
        ) : null}
      </>
    ),
    speakers: (
      <>
        {/* ---- Pembicara ---------------------------------------------------- */}
        {tampil("speakers") ? (
          <Section id="speakers">
            <SpeakerGrid speakers={urutPembicara} heading={LANDING_SECTION_LABELS.speakers} headingClassName={JUDUL} />
          </Section>
        ) : null}
      </>
    ),
    venue: (
      <>
        {/* ---- Lokasi ------------------------------------------------------- */}
        {tampil("venue") ? (
          <Section id="venue">
            <div className={`grid items-center gap-10 lg:gap-20 ${event.venue_map_url ? "lg:grid-cols-2" : ""}`}>
              <div className="flex max-w-[572px] flex-col items-start gap-8 sm:gap-10">
                <div className="flex flex-col gap-6">
                  <h2 className={JUDUL}>{venue ?? LANDING_SECTION_LABELS.venue}</h2>
                  {event.venue_address ? (
                    <p className={`whitespace-pre-line text-body-large ${MUTED}`}>{event.venue_address}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  {/* Peta sebagai TAUTAN, tidak disematkan: penyemat peta
                      memuat skrip pihak ketiga ke halaman tamu. */}
                  {event.venue_map_url ? (
                    <a
                      href={event.venue_map_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={PIL_PENUH}
                      style={STATE_ON_PRIMARY}
                    >
                      {tautanPeta(event.venue_map_url)}
                      <ArrowUpRight size={16} weight="bold" aria-hidden />
                    </a>
                  ) : null}
                  {kalenderUrl ? (
                    // Slug sebagai query, bukan segmen path: lihat Editorial.
                    <a href={kalenderUrl} className={PIL_GARIS}>
                      <CalendarPlus size={18} aria-hidden />
                      Tambah ke kalender
                    </a>
                  ) : null}
                </div>
                <Link
                  href={`/e/${event.slug}/denah`}
                  className="m3-state -mx-2 -mt-4 inline-flex min-h-12 items-center gap-2 rounded-md px-2 text-title-small font-semibold text-[var(--reg-primary)]"
                >
                  Cari kursi Anda di denah
                  <ArrowRight size={16} weight="bold" aria-hidden />
                </Link>
              </div>

              {event.venue_map_url ? (
                // Bidang peta: tautan besar ke peta, bukan peta tersemat.
                <a
                  href={event.venue_map_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${tautanPeta(event.venue_map_url)}: ${venue ?? event.venue_address ?? "lokasi acara"}`}
                  className="m3-state flex aspect-[4/3] flex-col items-center justify-center gap-4 rounded-lg bg-[var(--reg-panel)] p-8 text-center sm:aspect-[625/460]"
                >
                  <span className="flex size-20 items-center justify-center rounded-full bg-[var(--reg-primary)] text-[var(--reg-on-primary)]">
                    <MapPin size={36} weight="fill" aria-hidden />
                  </span>
                  <span className={`${HEAD} text-balance text-headline-small`}>{venue ?? LANDING_SECTION_LABELS.venue}</span>
                  <span className="inline-flex items-center gap-1.5 text-title-small font-semibold text-[var(--reg-primary)]">
                    {tautanPeta(event.venue_map_url)}
                    <ArrowUpRight size={14} weight="bold" aria-hidden />
                  </span>
                </a>
              ) : null}
            </div>
          </Section>
        ) : null}
      </>
    ),
    faq: (
      <>
        {/* ---- FAQ ---------------------------------------------------------- */}
        {tampil("faq") ? (
          <Section id="faq">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-20">
              <div className="flex flex-col gap-6 lg:sticky lg:top-32 lg:self-start">
                <h2 className={JUDUL}>Sebelum Anda datang</h2>
                <p className={`text-body-large ${MUTED}`}>
                  Pertanyaan yang paling sering ditanyakan tamu.
                  {kontak.length > 0 ? " Hubungi panitia untuk hal lain." : null}
                </p>
              </div>
              {/* <details>: papan ketik, pembaca layar, dan tanpa JavaScript.
                  Yang pertama terbuka, seperti di rancangan. */}
              <div className="flex flex-col gap-3">
                {(config.faq ?? []).map((item, index) => (
                  <details key={item.q} open={index === 0} className="faq group rounded-md bg-[var(--reg-panel)]">
                    <summary className="m3-state flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-md px-5 py-5 text-title-large font-medium sm:px-7 sm:py-6 [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <Plus size={22} aria-hidden className={`shrink-0 group-open:hidden ${MUTED}`} />
                      <Minus size={22} aria-hidden className={`hidden shrink-0 group-open:block ${MUTED}`} />
                    </summary>
                    <p className={`whitespace-pre-line px-5 pb-6 text-body-large sm:px-7 ${MUTED}`}>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </Section>
        ) : null}
      </>
    ),
    sponsors: (
      <>
        {/* ---- Didukung oleh ------------------------------------------------ */}
        {/* Mitra di bawah FAQ, bukan tepat di bawah hero: logo di situ terbaca
            sebagai bilah "Trusted by" templat (antislop R-05). */}
        {tampil("sponsors") ? (
          <section className="py-16 sm:py-24">
            <h2 className={`${HEAD} text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] ${MUTED}`}>Didukung oleh</h2>
            {/* Rata dan sama tinggi: ukuran logo bukan keputusan urutan unggah
                (lihat Editorial). */}
            <ul className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-6">
              {(config.sponsors ?? [])
                .filter((sponsor) => sponsor.logo_url)
                .map((sponsor) => (
                  <li key={sponsor.logo_url} className="flex h-10 items-center sm:h-12">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sponsor.logo_url}
                      alt={sponsor.name ?? ""}
                      loading="lazy"
                      className="max-h-full w-auto max-w-[160px] object-contain"
                    />
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
      </>
    ),
  };

  return (
    <main className="min-h-dvh bg-[var(--reg-surface)] text-[var(--reg-on-surface)]" style={mainStyle}>
      <LandingNavModern
        eventName={nama}
        daftarUrl={daftarUrl}
        registrationOpen={event.registration_enabled}
        memberLink={memberLink}
        sections={navSections}
      />

      {/* ---- Hero ---------------------------------------------------------
          Ditarik ke bawah bilah nav (margin negatif setinggi nav) supaya KV
          mulai dari tepi atas layar, seperti di rancangan. */}
      <header
        className={`relative isolate -mt-16 overflow-hidden ${kv ? "bg-black" : "bg-[var(--reg-brand)]"}`}
        style={tinta(Boolean(kv))}
      >
        {kv ? <Kv src={kv} scrim={KV_SCRIM} /> : null}
        <div
          className={`${SHELL} flex flex-col pb-12 text-[var(--ink)] sm:pb-16 lg:pb-20 ${
            // Dengan KV, judul berdiri di bawah supaya gambarnya terlihat.
            // Tanpa KV tidak ada yang perlu diperlihatkan di atas judul, jadi
            // judul di tengah bidang warna, bukan jatuh ke dasar hero.
            kv ? "justify-end pt-32" : "justify-center pt-28"
          } ${
            HERO_HEIGHT[config.hero_height ?? "standard"]
          }`}
        >
          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
            <div className="flex min-w-0 max-w-[760px] flex-col gap-6 sm:gap-8">
              {fakta.length > 0 ? (
                <ul className="rise-in flex flex-wrap gap-2" style={HERO_DELAY(0)}>
                  {fakta.map((item) => (
                    <li key={item} className={`${CHIP_INK} tabular-nums`}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
              <h1
                className={`rise-in text-balance font-semibold leading-[1.1] tracking-[-0.03em] ${HEAD} ${
                  HEADING_SCALE[config.heading_scale ?? "lg"]
                }`}
                style={HERO_DELAY(1)}
              >
                {nama}
              </h1>
              {event.tagline ? (
                <p className="rise-in max-w-[628px] text-body-large opacity-90" style={HERO_DELAY(2)}>
                  {event.tagline}
                </p>
              ) : null}
            </div>

            <div className="rise-in shrink-0" style={HERO_DELAY(3)}>
              {/* Tombol daftar hanya saat pendaftaran terbuka; lihat Editorial. */}
              {event.registration_enabled ? (
                <Link href={daftarUrl} className={PIL_INK}>
                  {ctaLabel}
                </Link>
              ) : (
                <span className={`${CHIP_INK} min-h-[52px] px-5 text-title-medium font-medium`}>Pendaftaran belum dibuka</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {sections
        .filter((section) => section.enabled)
        .map((section) => {
          if (isLandingBlockId(section.id)) {
            const block = blokById.get(section.id);
            return block ? (
              <LandingBlockView key={section.id} block={block} daftarUrl={event.registration_enabled ? daftarUrl : null} daftarLabel={ctaLabel} />
            ) : null;
          }
          const konten = bawaan[section.id];
          return konten ? (
            <div key={section.id} className={SHELL}>
              {konten}
            </div>
          ) : null;
        })}

      <div className={SHELL}>
        {/* ---- Banner ajakan ------------------------------------------------ */}
        {event.registration_enabled ? (
          <section className="pb-16 sm:pb-24">
            <div
              className={`relative isolate flex flex-col items-center gap-6 overflow-hidden rounded-lg px-6 py-16 text-center text-[var(--ink)] sm:py-24 ${
                kv ? "bg-black" : "bg-[var(--reg-brand)]"
              }`}
              style={tinta(Boolean(kv))}
            >
              {kv ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={kv} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />
                  <div aria-hidden className="absolute inset-0 -z-10" style={{ background: KV_SCRIM_RATA }} />
                </>
              ) : null}
              <h2 className={`${JUDUL} max-w-[800px]`}>{config.cta_heading?.trim() || "Amankan tempat Anda"}</h2>
              {config.cta_note?.trim() ? (
                <p className="max-w-[720px] text-title-large font-normal leading-[1.5] opacity-90">{config.cta_note.trim()}</p>
              ) : null}
              <Link href={daftarUrl} className={PIL_INK}>
                {ctaLabel}
              </Link>
            </div>
          </section>
        ) : null}
      </div>

      {/* ---- Kaki halaman ---------------------------------------------------- */}
      <footer className="text-white" style={{ backgroundColor: LATAR_KAKI }}>
        <div className={`${SHELL} flex flex-col gap-12 pb-12 pt-16 sm:gap-[72px] sm:pt-24`}>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <p className={`${HEAD} max-w-[700px] text-balance text-[28px] font-semibold leading-[1.25] tracking-[-0.03em] sm:text-[40px]`}>
              {tanggal ? `Sampai jumpa pada ${tanggal}.` : "Sampai jumpa di acara."}
            </p>
            {event.registration_enabled ? (
              <div style={tinta(true)} className="shrink-0">
                <Link href={daftarUrl} className={PIL_INK}>
                  {ctaLabel}
                </Link>
              </div>
            ) : null}
          </div>

          <div aria-hidden className="h-px bg-white/15" />

          <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
            <div className="flex max-w-[420px] flex-col gap-4">
              <p className={`${HEAD} text-title-large font-semibold`}>{nama}</p>
              {event.tagline || venue ? (
                <div className="text-body-medium text-white/70">
                  {event.tagline ? <p>{event.tagline}</p> : null}
                  {venue ? <p>{venue}</p> : null}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:flex sm:gap-20">
              {tautanAcara.length > 0 ? (
                <KolomKaki judul="Acara" tautan={tautanAcara.map((item) => ({ label: item.label, href: `#${item.id}` }))} />
              ) : null}
              {tautanTamu.length > 0 ? <KolomKaki judul="Tamu" tautan={tautanTamu} /> : null}
              {kontak.length > 0 ? <KolomKaki judul="Kontak panitia" tautan={kontak} /> : null}
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-3 text-body-medium text-white/60">
            <p>
              © {tahun} {nama}
            </p>
            <p>Dikelola dengan Tally</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function KolomKaki({ judul, tautan }: { judul: string; tautan: { label: string; href: string | null }[] }) {
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
