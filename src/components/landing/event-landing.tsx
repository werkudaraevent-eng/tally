import type { CSSProperties, ReactNode } from "react";
import { tanpaBintang } from "@/lib/landing-tagline";
import Link from "next/link";
import { ArrowRight, CalendarPlus, CaretDown, MapPin } from "@phosphor-icons/react/dist/ssr";
import type {
  EventLandingConfig,
  EventRow,
  LandingHeadingScale,
  LandingHeroHeight,
  LandingSection,
  LandingSectionId,
  LandingSpeaker,
} from "@/lib/domain";
import { LANDING_SECTION_LABELS, isLandingBlockId, landingHeadingFontSize, publicEventName } from "@/lib/domain";
import { landingFontStyle, landingTokens } from "@/lib/landing-tokens";
import { preloadLandingFonts } from "@/lib/landing-font-preload";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { rentangAkhir } from "@/lib/landing-agenda-range";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { AgendaTabs } from "./agenda-tabs";
import { LandingNav } from "./landing-nav";

/**
 * Landing page publik acara.
 *
 * Template tetap dengan slot, BUKAN penyusun blok bebas. Admin mengatur bagian
 * mana yang tampil, urutannya, huruf judul, dan gambar hero; markup, jarak, dan
 * hierarkinya ditentukan di sini. Halaman ini dilihat tamu sebelum mereka
 * memutuskan datang, dan kualitasnya tidak boleh bergantung pada seberapa teliti
 * admin menyusun blok.
 *
 * Bagian yang kosong TIDAK dirender sama sekali: acara tanpa sponsor tidak
 * menampilkan judul "Sponsor & mitra" di atas ruang kosong.
 *
 * ---- Gaya: tenang dan editorial ------------------------------------------
 *
 * Tipografi yang membawa halaman, bukan kartu dan bayangan. Judul memakai huruf
 * yang dipilih admin (`heading_font`), isi tetap huruf antarmuka. Pemisah antar
 * bagian adalah garis rambut, bukan bidang berwarna. Tidak ada animasi saat
 * digulir: satu-satunya gerak adalah hero yang masuk sekali saat halaman dimuat.
 *
 * Warna datang dari tema acara (`--reg-*`), jadi tiap acara tetap membawa warna
 * mereknya sendiri di atas kerangka yang sama.
 *
 * ---- Tata letak ----------------------------------------------------------
 *
 * Grid halaman sama dengan grid layar admin (DESIGN.md "Grid halaman"):
 * `max-w-[1440px]`, pinggir 20/32/40px. Judul bagian berdiri di rel kiri yang
 * menempel saat digulir, isinya di kolom kanan dengan panjang baris 65–75
 * karakter.
 */

type Props = {
  event: EventRow;
  config: EventLandingConfig;
  sections: LandingSection[];
  theme: CSSProperties;
  schedule: string | null;
};

const SHELL = "mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-10";
const MUTED = "text-[var(--reg-on-surface-variant)]";
/** Huruf judul pilihan admin. Variabelnya dipasang di <main>. */
const HEAD = "[font-family:var(--landing-heading)]";
const PROSE = "max-w-[68ch]";

/**
 * Tinggi minimum hero. Ditulis sebagai kelas lengkap, bukan disusun dari
 * potongan string: Tailwind memindai berkas sumber sebagai teks, dan kelas yang
 * baru terbentuk saat runtime tidak pernah ikut ke CSS.
 */
const HERO_HEIGHT: Record<LandingHeroHeight, string> = {
  compact: "min-h-[360px] lg:min-h-[440px]",
  standard: "min-h-[440px] sm:min-h-[520px] lg:min-h-[600px]",
  tall: "min-h-[540px] sm:min-h-[620px] lg:min-h-[720px]",
};

/** Ukuran nama acara di hero, per kelas jendela. */
/** Tinggi hero dari angka di CMS (`--hero-h`), ponsel 75% darinya, tidak pernah melebihi layar. */
const HERO_HEIGHT_ANGKA = "min-h-[min(calc(var(--hero-h)*0.75),100svh)] lg:min-h-[min(var(--hero-h),100svh)]";

const HEADING_SCALE: Record<LandingHeadingScale, string> = {
  md: "text-[40px] sm:text-[52px] lg:text-[64px]",
  lg: "text-[44px] sm:text-[60px] lg:text-[80px]",
  xl: "text-[48px] sm:text-[72px] lg:text-[104px]",
};

/**
 * KV mode "Warna asli": gambar tampil apa adanya, dengan bayangan gelap dari
 * bawah ke atas. Teks hero berdiri di paruh bawah, tempat bayangannya paling
 * pekat. 55% hitam di titik teks tertinggi menjaga teks putih di atas 4.5:1
 * bahkan bila bagian gambar itu putih polos.
 */
const KV_SCRIM =
  "linear-gradient(to top, rgb(0 0 0 / 0.82), rgb(0 0 0 / 0.58) 55%, rgb(0 0 0 / 0.3))";

/** KV mode "Menyatu tema": gambar dilebur ke warna halaman. */
const KV_WASH =
  "linear-gradient(to bottom, color-mix(in srgb, var(--reg-surface) 70%, transparent), color-mix(in srgb, var(--reg-surface) 94%, transparent))";

/** Jeda masuk hero per elemen: kapan, apa, tentang apa, tindakan, fakta. */
const HERO_DELAY = (step: number) => ({ "--rise-delay": `${step * 60}ms` }) as CSSProperties;

function SectionShell({
  id,
  title,
  stacked = false,
  children,
}: {
  id: string;
  title: string;
  /** Judul di atas isi selebar grid, untuk isi yang punya grid sendiri. */
  stacked?: boolean;
  children: ReactNode;
}) {
  const judul = `${HEAD} text-balance text-[32px] font-semibold leading-[1.1] sm:text-[40px]`;
  if (stacked) {
    return (
      <section id={id} className="scroll-mt-24 border-t border-[var(--reg-outline-variant)] py-16 sm:py-24">
        <h2 className={judul}>{title}</h2>
        <div className="mt-10 sm:mt-12">{children}</div>
      </section>
    );
  }
  return (
    <section id={id} className="scroll-mt-24 border-t border-[var(--reg-outline-variant)] py-16 sm:py-24">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <h2 className={`${judul} lg:sticky lg:top-28 lg:col-span-4 lg:self-start xl:col-span-3`}>{title}</h2>
        <div className="lg:col-span-8 xl:col-span-9">{children}</div>
      </div>
    </section>
  );
}

/** Dua huruf awal nama, untuk pembicara tanpa foto. */
function inisial(nama: string): string {
  return nama
    .split(/\s+/)
    .filter((kata) => /^\p{L}/u.test(kata))
    .slice(0, 2)
    .map((kata) => kata[0]!.toUpperCase())
    .join("");
}

function Wajah({ speaker, size }: { speaker: LandingSpeaker; size: "lg" | "sm" }) {
  const ukuran = size === "lg" ? "size-24 sm:size-28 text-[32px]" : "size-12 text-title-small";
  if (speaker.photo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={speaker.photo_url} alt="" className={`${ukuran} shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <span
      aria-hidden
      className={`${ukuran} flex shrink-0 items-center justify-center rounded-full font-semibold ${
        size === "lg"
          ? `${HEAD} bg-[var(--reg-on-surface)] text-[var(--reg-surface)]`
          : "bg-[var(--reg-outline-variant)] text-[var(--reg-on-surface)]"
      }`}
    >
      {inisial(speaker.name)}
    </span>
  );
}

export async function EventLanding({ event, config, sections, theme, schedule }: Props) {
  // Blok dari pustaka blok hanya untuk tata letak Modern.
  const aktif = sections.filter(
    (section): section is { id: LandingSectionId; enabled: boolean } => section.enabled && !isLandingBlockId(section.id),
  );
  const daftarUrl = `/e/${event.slug}/daftar`;
  const ctaLabel = config.cta_label?.trim() || "Daftar sekarang";
  const speakers = (config.speakers ?? []).filter((speaker) => speaker.name?.trim());

  // Rundown diambil sekali untuk dua pemakai: kolom fakta hero (jam tiap bagian)
  // dan bagian Susunan acara.
  const agenda = await loadAgendaPreview(event.id);

  // Area peserta: tautan "Masuk", atau "Area peserta" bila sudah masuk.
  const member = memberConfig(event);
  const memberLink = member
    ? (await getMemberSession(event))
      ? { href: `/e/${event.slug}/peserta`, label: "Area peserta" }
      : { href: `/e/${event.slug}/masuk`, label: "Masuk" }
    : null;

  // Bagian tanpa isi dibuang di sini, sekali, termasuk dari navigasi jangkar.
  // Nav yang menunjuk ke bagian yang tidak ada adalah tautan yang tidak
  // melakukan apa-apa.
  const isi: Record<LandingSectionId, boolean> = {
    about: Boolean(event.description?.trim()),
    highlights: (config.highlights ?? []).length > 0,
    agenda: agenda.length > 0,
    speakers: speakers.length > 0,
    venue: Boolean(event.venue_name?.trim() || event.venue_address?.trim()),
    faq: (config.faq ?? []).length > 0,
    sponsors: (config.sponsors ?? []).length > 0,
    contact: Boolean(config.contact_name || config.contact_phone || config.contact_email),
  };
  const tampil = aktif.filter((section) => isi[section.id]);
  const agendaTampil = tampil.some((section) => section.id === "agenda");

  // KV sebagai latar hero. "Warna asli" hanya berlaku bila gambarnya memang
  // ada: tanpa gambar, teks putih akan berdiri di atas latar terang.
  const kv = config.banner_url ?? null;
  const kvFoto = Boolean(kv) && config.banner_style === "photo";
  const heroTeks = kvFoto ? "text-white" : "";
  const heroMuted = kvFoto ? "text-white/85" : MUTED;
  const garisFakta = kvFoto ? "border-white/70" : "border-[var(--reg-on-surface)]";
  const tombolSekunder = kvFoto
    ? "border-white/70 text-white"
    : "border-[var(--reg-outline)] text-[var(--reg-on-surface)]";

  // Fakta di kanan hero: jam tiap bagian rundown, lalu tempat. Tanggal TIDAK
  // diulang di sini; ia sudah menjadi baris pertama di atas judul.
  const fakta: { label: string; nilai: string }[] = [
    ...agenda.slice(0, 3).flatMap((bagian) => {
      const awal = bagian.items[0]?.time;
      if (!awal) return [];
      const akhir = rentangAkhir(bagian);
      return [
        {
          label: bagian.sectionTitle || "Susunan acara",
          nilai: akhir && akhir !== awal ? `${awal} hingga ${akhir}` : awal,
        },
      ];
    }),
    ...(event.venue_name?.trim() ? [{ label: "Tempat", nilai: event.venue_name.trim() }] : []),
  ];

  const tokens = landingTokens(config, "editorial");
  preloadLandingFonts(tokens);
  const mainStyle = { ...theme, ...landingFontStyle(tokens) } as CSSProperties;

  const featured = speakers.filter((speaker) => speaker.featured);
  const lainnya = speakers.filter((speaker) => !speaker.featured);

  return (
    <main className="min-h-dvh bg-[var(--reg-surface)] text-[var(--reg-on-surface)]" style={mainStyle}>
      <LandingNav
        eventName={publicEventName(event)}
        ctaLabel={ctaLabel}
        daftarUrl={daftarUrl}
        registrationOpen={event.registration_enabled}
        memberLink={memberLink}
        sections={tampil.map((section) => ({ id: section.id, label: LANDING_SECTION_LABELS[section.id] }))}
      />

      {/* ---- Hero -------------------------------------------------------- */}
      <header data-bagian="pembuka" className={`relative isolate overflow-hidden ${kvFoto ? "bg-black" : ""}`}>
        {kv ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={kv} alt="" className="settle-in absolute inset-0 -z-10 size-full object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10" style={{ background: kvFoto ? KV_SCRIM : KV_WASH }} />
          </>
        ) : null}

        <div
          className={`${SHELL} flex flex-col pb-16 pt-16 sm:pb-20 sm:pt-24 lg:pb-24 ${
            kvFoto ? "justify-end" : "justify-center"
          } ${config.hero_min_height ? HERO_HEIGHT_ANGKA : HERO_HEIGHT[config.hero_height ?? "standard"]}`}
          style={config.hero_min_height ? ({ "--hero-h": `${config.hero_min_height}px` } as CSSProperties) : undefined}
        >
          <div className={`grid gap-12 lg:grid-cols-12 lg:gap-6 ${heroTeks}`}>
            <div className="lg:col-span-8">
              {schedule ? (
                <p className={`rise-in text-body-large font-medium ${heroMuted}`} style={HERO_DELAY(0)}>
                  {schedule}
                </p>
              ) : null}

              <h1
                className={`rise-in mt-6 text-balance font-semibold leading-[1.02] tracking-[-0.01em] ${HEAD} ${
                  config.heading_size ? "" : HEADING_SCALE[config.heading_scale ?? "lg"]
                }`}
                style={{ ...HERO_DELAY(1), ...(config.heading_size ? { fontSize: landingHeadingFontSize(config.heading_size) } : null) }}
              >
                {publicEventName(event)}
              </h1>

              {event.tagline ? (
                <p className={`rise-in mt-6 max-w-[40ch] text-title-large leading-8 ${heroMuted}`} style={HERO_DELAY(2)}>
                  {tanpaBintang(event.tagline)}
                </p>
              ) : null}

              <div className="rise-in mt-10 flex flex-wrap items-center gap-3" style={HERO_DELAY(3)}>
                {/* Tombol daftar hanya muncul saat pendaftaran memang terbuka.
                    Tombol yang mengantar ke halaman "pendaftaran ditutup" membuat
                    tamu mengira dirinya terlambat karena salahnya sendiri. */}
                {event.registration_enabled ? (
                  <Link
                    href={daftarUrl}
                    className="m3-state inline-flex min-h-[52px] items-center gap-2 rounded-md bg-[var(--reg-primary)] px-7 text-title-medium font-semibold text-[var(--reg-on-primary)]"
                    style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
                  >
                    {ctaLabel}
                    <ArrowRight size={18} weight="bold" />
                  </Link>
                ) : (
                  <span className={`inline-flex min-h-[52px] items-center rounded-md border px-7 text-title-medium font-semibold ${tombolSekunder}`}>
                    Pendaftaran belum dibuka
                  </span>
                )}
                {agendaTampil ? (
                  <a
                    href="#agenda"
                    className={`m3-state inline-flex min-h-[52px] items-center rounded-md border px-6 text-title-medium font-medium ${tombolSekunder}`}
                  >
                    Lihat susunan acara
                  </a>
                ) : null}
                {event.event_date ? (
                  <a
                    // Slug sebagai query, BUKAN segmen path. `/e/<slug>/kalender.ics`
                    // di-rewrite proxy, dan parameter yang ditambahkan saat rewrite
                    // tidak sampai ke route handler: tamu lalu mengunduh jadwal
                    // acara lain. Proxy melewatkan permintaan yang sudah membawa
                    // `eventSlug` sendiri.
                    href={`/kalender.ics?eventSlug=${encodeURIComponent(event.slug)}`}
                    className={`m3-state inline-flex min-h-[52px] items-center gap-2 rounded-md px-4 text-title-medium font-medium ${
                      kvFoto ? "text-white" : "text-[var(--reg-on-surface)]"
                    }`}
                  >
                    <CalendarPlus size={20} />
                    Tambah ke kalender
                  </a>
                ) : null}
              </div>
            </div>

            {fakta.length > 0 ? (
              <dl
                className="rise-in grid grid-cols-2 gap-x-6 gap-y-5 self-end text-body-large lg:col-span-3 lg:col-start-10 lg:grid-cols-1"
                style={HERO_DELAY(4)}
              >
                {fakta.map((item) => (
                  <div key={item.label} className={`border-t pt-4 ${garisFakta}`}>
                    <dt className={`text-body-medium ${heroMuted}`}>{item.label}</dt>
                    <dd className="mt-1 font-semibold tabular-nums">{item.nilai}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>
      </header>

      <div className={SHELL}>
        {tampil.map((section) => {
          switch (section.id) {
            case "about":
              return (
                <SectionShell key="about" id="about" title={LANDING_SECTION_LABELS.about}>
                  {/* whitespace-pre-line: paragraf deskripsi dipisah enter di textarea admin. */}
                  <p className={`${PROSE} whitespace-pre-line text-body-large leading-8 ${MUTED}`}>
                    {event.description}
                  </p>
                </SectionShell>
              );

            case "highlights":
              return (
                <SectionShell key="highlights" id="highlights" title={LANDING_SECTION_LABELS.highlights}>
                  <dl className="grid gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                    {(config.highlights ?? []).map((item) => (
                      // dt harus mendahului dd di dalam <dl>; angkanya dinaikkan
                      // ke atas secara visual lewat flex-col-reverse.
                      <div key={item.label} className="flex flex-col-reverse border-t border-[var(--reg-on-surface)] pt-4">
                        <dt className={`mt-3 text-body-large ${MUTED}`}>{item.label}</dt>
                        <dd className={`${HEAD} text-[40px] font-semibold leading-none tabular-nums sm:text-[48px]`}>
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </SectionShell>
              );

            case "agenda":
              return (
                <SectionShell key="agenda" id="agenda" title={LANDING_SECTION_LABELS.agenda} stacked>
                  <AgendaTabs agenda={agenda} />
                  <Link
                    href={`/e/${event.slug}/rundown`}
                    className="m3-state mt-8 inline-flex min-h-12 items-center gap-2 rounded-md text-title-small font-semibold text-[var(--reg-primary)]"
                  >
                    Buka susunan acara di layar penuh
                    <ArrowRight size={18} weight="bold" />
                  </Link>
                </SectionShell>
              );

            case "speakers":
              return (
                <SectionShell key="speakers" id="speakers" title={LANDING_SECTION_LABELS.speakers} stacked>
                  {featured.length > 0 ? (
                    <ul className="grid gap-4 md:grid-cols-2">
                      {featured.map((speaker, index) => (
                        <li
                          key={`${speaker.name}-${index}`}
                          className="flex flex-col items-start gap-5 rounded-md bg-[var(--reg-panel)] p-6 sm:flex-row sm:items-center sm:gap-7 sm:p-8"
                        >
                          <Wajah speaker={speaker} size="lg" />
                          <div className="min-w-0">
                            {speaker.role ? (
                              <p className="text-label-large font-semibold text-[var(--reg-primary)]">{speaker.role}</p>
                            ) : null}
                            <p className={`${HEAD} mt-1 text-balance text-[24px] font-semibold leading-tight sm:text-[28px]`}>
                              {speaker.name}
                            </p>
                            {speaker.title ? (
                              <p className={`mt-2 text-body-large ${MUTED}`}>{speaker.title}</p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {lainnya.length > 0 ? (
                    <ul className={`grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${featured.length ? "mt-12" : ""}`}>
                      {lainnya.map((speaker, index) => (
                        <li
                          key={`${speaker.name}-${index}`}
                          className="flex items-start gap-4 border-t border-[var(--reg-outline-variant)] pt-5"
                        >
                          <Wajah speaker={speaker} size="sm" />
                          <div className="min-w-0">
                            <p className="text-title-medium font-semibold">{speaker.name}</p>
                            {speaker.title ? <p className={`mt-1 text-body-medium ${MUTED}`}>{speaker.title}</p> : null}
                            {speaker.role ? (
                              <p className="mt-1 text-body-small font-semibold text-[var(--reg-primary)]">{speaker.role}</p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </SectionShell>
              );

            case "venue":
              return (
                <SectionShell key="venue" id="venue" title={LANDING_SECTION_LABELS.venue}>
                  {event.venue_name ? (
                    <p className={`${HEAD} text-[24px] font-semibold leading-tight sm:text-[28px]`}>{event.venue_name}</p>
                  ) : null}
                  {event.venue_address ? (
                    <p className={`mt-3 max-w-[46ch] whitespace-pre-line text-body-large leading-7 ${MUTED}`}>
                      {event.venue_address}
                    </p>
                  ) : null}
                  <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1">
                    {/* Peta dibuka sebagai TAUTAN, tidak disematkan sebagai iframe:
                        penyemat peta memuat skrip pihak ketiga ke halaman tamu. */}
                    {event.venue_map_url ? (
                      <a
                        href={event.venue_map_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="m3-state -mx-2 inline-flex min-h-12 items-center gap-2 rounded-md px-2 text-title-small font-semibold text-[var(--reg-primary)]"
                      >
                        <MapPin size={18} weight="fill" />
                        Buka peta
                      </a>
                    ) : null}
                    <Link
                      href={`/e/${event.slug}/denah`}
                      className="m3-state -mx-2 inline-flex min-h-12 items-center gap-2 rounded-md px-2 text-title-small font-semibold text-[var(--reg-primary)]"
                    >
                      Cari kursi Anda di denah
                      <ArrowRight size={18} weight="bold" />
                    </Link>
                  </div>
                </SectionShell>
              );

            case "faq":
              return (
                <SectionShell key="faq" id="faq" title={LANDING_SECTION_LABELS.faq}>
                  {/* <details>: bisa dibuka papan ketik, diumumkan pembaca layar
                      sebagai dapat dilipat, dan tetap bekerja tanpa JavaScript. */}
                  <div className="divide-y divide-[var(--reg-outline-variant)] border-y border-[var(--reg-outline-variant)]">
                    {(config.faq ?? []).map((item) => (
                      <details key={item.q} className="faq group py-3">
                        <summary className="m3-state -mx-3 flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-md px-3 py-2 text-title-medium font-semibold">
                          {item.q}
                          <CaretDown size={20} className="shrink-0 transition-transform group-open:rotate-180" />
                        </summary>
                        <p className={`mb-3 mt-2 ${PROSE} whitespace-pre-line text-body-large leading-7 ${MUTED}`}>
                          {item.a}
                        </p>
                      </details>
                    ))}
                  </div>
                </SectionShell>
              );

            case "sponsors":
              return (
                <SectionShell key="sponsors" id="sponsors" title={LANDING_SECTION_LABELS.sponsors}>
                  {/* Grid rata, bukan tingkatan berukuran berbeda. Ukuran logo
                      adalah janji tentang nilai kontrak, dan itu keputusan
                      komersial yang tidak boleh diambil oleh urutan unggah. */}
                  <ul className="grid grid-cols-2 border-l border-t border-[var(--reg-outline-variant)] sm:grid-cols-3 xl:grid-cols-4">
                    {(config.sponsors ?? []).map((sponsor) => (
                      <li
                        key={sponsor.logo_url}
                        className="flex h-28 items-center justify-center border-b border-r border-[var(--reg-outline-variant)] p-6"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sponsor.logo_url} alt={sponsor.name ?? ""} className="max-h-full max-w-full object-contain" />
                      </li>
                    ))}
                  </ul>
                </SectionShell>
              );

            case "contact":
              return (
                <SectionShell key="contact" id="contact" title={LANDING_SECTION_LABELS.contact}>
                  <dl className="grid gap-x-12 gap-y-6 text-body-large sm:grid-cols-3">
                    {config.contact_name ? (
                      <div>
                        <dt className={`text-body-medium ${MUTED}`}>Nama</dt>
                        <dd className="mt-1 font-semibold">{config.contact_name}</dd>
                      </div>
                    ) : null}
                    {config.contact_phone ? (
                      <div>
                        <dt className={`text-body-medium ${MUTED}`}>Telepon</dt>
                        <dd className="mt-1">
                          <a
                            href={`tel:${config.contact_phone}`}
                            className="inline-flex min-h-11 items-center font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline"
                          >
                            {config.contact_phone}
                          </a>
                        </dd>
                      </div>
                    ) : null}
                    {config.contact_email ? (
                      <div className="min-w-0">
                        <dt className={`text-body-medium ${MUTED}`}>Email</dt>
                        <dd className="mt-1">
                          <a
                            href={`mailto:${config.contact_email}`}
                            className="inline-flex min-h-11 items-center break-all font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline"
                          >
                            {config.contact_email}
                          </a>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </SectionShell>
              );

            default:
              return null;
          }
        })}

        {/* ---- Penutup ---------------------------------------------------- */}
        {event.registration_enabled ? (
          <section className="grid gap-8 border-t border-[var(--reg-on-surface)] py-16 sm:py-24 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-8">
              <h2 className={`${HEAD} text-balance text-[32px] font-semibold leading-[1.1] sm:text-[48px]`}>
                Sampai jumpa di acara
              </h2>
              {schedule ? <p className={`mt-4 text-body-large ${MUTED}`}>{schedule}</p> : null}
            </div>
            <div className="lg:col-span-4 lg:self-end lg:justify-self-end">
              <Link
                href={daftarUrl}
                className="m3-state inline-flex min-h-[52px] items-center gap-2 rounded-md bg-[var(--reg-primary)] px-7 text-title-medium font-semibold text-[var(--reg-on-primary)]"
                style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
              >
                {ctaLabel}
                <ArrowRight size={18} weight="bold" />
              </Link>
            </div>
          </section>
        ) : null}

        <footer
          data-bagian="kaki"
          className={`flex flex-wrap items-center justify-between gap-3 border-t border-[var(--reg-outline-variant)] py-8 text-body-small ${MUTED}`}
        >
          <span>{publicEventName(event)}</span>
          {schedule ? <span>{schedule}</span> : null}
        </footer>
      </div>
    </main>
  );
}
