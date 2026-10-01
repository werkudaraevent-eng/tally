import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarBlank, CalendarPlus, Clock, MapPin, Minus, Plus } from "@phosphor-icons/react/dist/ssr";
import type {
  EventLandingConfig,
  EventRow,
  LandingHeadingScale,
  LandingHeroHeight,
  LandingSection,
  LandingSectionId,
} from "@/lib/domain";
import { LANDING_HEADING_FONTS, LANDING_NAV_DEFAULTS, LANDING_SECTION_LABELS, isLandingBlockId, landingBlockHasContent, landingHeadingFontSize, publicEventName } from "@/lib/domain";
import { heroCtaColors, modernNavStyle, modernThemeStyle } from "@/lib/registration-theme-css";
import { formatEventDate, formatEventTime } from "@/lib/event-datetime";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { jumlahLembaga, speakerTabs } from "@/lib/landing-speaker-tabs";
import { rentangAkhir } from "@/lib/landing-agenda-range";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { timeZoneAbbr } from "@/lib/timezone";
import { AgendaPills } from "./modern/agenda-pills";
import { LandingNavModern } from "./modern/landing-nav-modern";
import { SpeakerTabs } from "./modern/speaker-tabs";
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
 * - Tombol `rounded-md` (DESIGN.md), info hero berikon tanpa bingkai, kartu `rounded-lg`.
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

/** Label kecil di atas judul bagian, sama dengan blok dari pustaka blok. */
const ALIS = "text-title-small font-semibold text-[var(--reg-primary)]";

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
 * `tall` = 850px, tinggi hero di rancangan, tapi tidak pernah lebih dari
 * tinggi layar: tombol daftar harus terlihat tanpa menggulir.
 */
const HERO_HEIGHT: Record<LandingHeroHeight, string> = {
  compact: "min-h-[480px] lg:min-h-[min(600px,100svh)]",
  standard: "min-h-[560px] sm:min-h-[min(640px,100svh)] lg:min-h-[min(760px,100svh)]",
  tall: "min-h-[620px] sm:min-h-[min(720px,100svh)] lg:min-h-[min(850px,100svh)]",
};

/** Tinggi hero dari angka di CMS (`--hero-h`), ponsel 75% darinya, tidak pernah melebihi layar. */
const HERO_HEIGHT_ANGKA = "min-h-[min(calc(var(--hero-h)*0.75),100svh)] lg:min-h-[min(var(--hero-h),100svh)]";

/**
 * Ukuran nama acara. Paling besar 72px: di atas itu nama acara yang panjang
 * memakan dua baris dan mendorong tombol ke bawah lipatan layar.
 */
const HEADING_SCALE: Record<LandingHeadingScale, string> = {
  md: "text-[36px] sm:text-[44px] lg:text-[52px]",
  lg: "text-[40px] sm:text-[52px] lg:text-[64px]",
  xl: "text-[44px] sm:text-[60px] lg:text-[72px]",
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

/**
 * Latar kaki: primary dicampur hitam separuh, jadi navy merek (bukan hampir
 * hitam) yang senada dengan hero. Teks putih tetap aman di warna tema apa pun.
 */
const LATAR_KAKI = "color-mix(in srgb, var(--reg-primary) 55%, black)";

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

/** Chip pil di atas permukaan terang (kartu program). */
const CHIP =
  "inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--reg-on-surface)_12%,transparent)] bg-[color-mix(in_srgb,var(--reg-on-surface)_5%,transparent)] px-3.5 py-1.5 text-label-large font-normal tabular-nums";

/**
 * Tombol di atas bidang bergambar: latar `--ink`, teks `--ink-accent`. Lihat
 * `tinta` untuk pasangannya.
 */
const PIL_INK = `${PIL} bg-[var(--ink)] font-semibold text-[var(--ink-accent)]`;
/** Tombol utama di atas KV: warna dari heroCtaColors lewat `--cta-bg`/`--cta-fg`. */
const PIL_CTA_KV = `${PIL} bg-[var(--cta-bg)] font-semibold text-[var(--cta-fg)] shadow-[0_1px_3px_rgb(0_0_0/0.3)]`;
/** Tombol kedua di atas bidang bergambar: garis `--ink`, tanpa isi. */
const PIL_INK_GARIS = `${PIL} border border-[color-mix(in_srgb,var(--ink)_60%,transparent)] font-semibold text-[var(--ink)]`;

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
  const tampilProgram = tampil("agenda") && agenda.length >= 2 && !config.program_hidden;

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
      // Tentang acara tidak tampil (lihat `program` di bawah).
      if (tampilProgram && (section.id === "about" ? tampil("about") : section.id === "agenda" && !tampil("about"))) {
        tambahNav("program", NAV_LABEL.program);
      }
      if (section.id in NAV_LABEL && tampil(section.id)) tambahNav(section.id, NAV_LABEL[section.id as keyof typeof NAV_LABEL]);
    });
  navSections.splice(6);

  const kv = config.banner_url ?? null;
  // Pita ajakan dari pustaka blok menggantikan banner ajakan bawaan, supaya
  // halaman tidak punya dua ajakan mendaftar yang sama berturut-turut.
  const adaBlokAjakan = sections.some((section) => {
    const block = section.enabled && isLandingBlockId(section.id) ? blokById.get(section.id) : undefined;
    return block?.type === "cta" && landingBlockHasContent(block);
  });
  const nama = publicEventName(event);
  const tanggal = formatEventDate(event);
  const jam = formatEventTime(event);
  const venue = event.venue_name?.trim() || null;
  // Tanpa tautan peta dari admin, tombol peta mencari nama dan alamat tempat
  // di Google Maps: tamu hampir selalu membuka peta, dan nama hotel cukup.
  const petaKueri = [venue, event.venue_address?.trim()].filter(Boolean).join(", ");
  const petaUrl =
    event.venue_map_url ||
    (venue || event.venue_address?.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [venue, event.venue_address?.trim()].filter(Boolean).join(", "),
        )}`
      : null);

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
  const infoHero = [
    tanggal ? { ikon: CalendarBlank, teks: tanggal } : null,
    jam ? { ikon: Clock, teks: jam } : null,
    venue ? { ikon: MapPin, teks: venue } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  const cta = heroCtaColors(config.theme?.seed);
  // Aksi utama saat pendaftaran tertutup: yang memang bisa dilakukan tamu.
  const aksiTertutup = tampil("agenda")
    ? { href: "#agenda", label: "Lihat susunan acara" }
    : { href: "#isi-acara", label: "Pelajari acaranya" };
  const ctaKv = { "--cta-bg": cta.bg, "--cta-fg": cta.fg } as CSSProperties;
  // Variabel bilah atas dipasang di <main>, bukan di <nav>: hero juga
  // membacanya (`--nav-h` untuk margin negatifnya).
  const navStyle = modernNavStyle(
    config.nav,
    kv ? { ink: "#ffffff", onInk: "#181d27" } : { ink: "var(--reg-on-brand)", onInk: "var(--reg-brand)" },
  );
  const mainStyle = {
    ...theme,
    ...modernThemeStyle(config.theme?.seed),
    ...navStyle,
    "--landing-heading": headingFont.cssVar,
  } as CSSProperties;

  // Paling banyak 8 kartu sekaligus; sisanya per sesi lewat tab (lihat
  // landing-speaker-tabs.ts, dipakai juga tata letak lain).
  const tabPembicara = speakerTabs(speakers, agenda);
  const lembaga = jumlahLembaga(speakers);
  const mitra = aktif.has("sponsors") ? (config.sponsors ?? []).filter((sponsor) => sponsor.logo_url) : [];

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
            {/* Rancangan FHF: tanggal dan catatan di kiri, baris sesi di kanan. */}
            <div className="grid gap-10 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-20">
              {/* Kolom kiri diam di tempat, tidak menempel saat digulir: rundown
                  pendek (7 baris) tidak butuh penanda yang ikut turun, dan
                  tanggal yang melayang terbaca seperti elemen yang tertinggal. */}
              <div className="flex flex-col items-start gap-5 lg:self-start">
                <p className={ALIS}>{LANDING_SECTION_LABELS.agenda}</p>
                <h2 className={JUDUL}>
                  {/* Nama hari di baris sendiri: "Kamis, 15 / Oktober 2026" memisahkan tanggal dari bulannya. */}
                  {tanggal && /^[^,]+, /.test(tanggal) ? (
                    <>
                      <span className="block">{tanggal.slice(0, tanggal.indexOf(",") + 1)}</span>
                      {tanggal.slice(tanggal.indexOf(",") + 2)}
                    </>
                  ) : (tanggal ?? LANDING_SECTION_LABELS.agenda)}
                </h2>
                {config.agenda_note?.trim() ? <p className={`text-body-large leading-[1.6] ${MUTED}`}>{config.agenda_note.trim()}</p> : null}
              </div>
              <AgendaPills agenda={agenda} />
            </div>
          </Section>
        ) : null}
      </>
    ),
    speakers: (
      <>
        {/* ---- Pembicara ---------------------------------------------------- */}
        {tampil("speakers") ? (
          // Satu-satunya bagian berlatar panel: memberi ritme pada halaman yang
          // seluruhnya putih. Latar dibentangkan selebar layar dengan bayangan
          // lebar yang dipotong clip-path, tanpa menambah gulir menyamping.
          <section
            id="speakers"
            className={`${SECTION} bg-[var(--landing-panel)] [clip-path:inset(0_-100vmax)] [box-shadow:0_0_0_100vmax_var(--landing-panel)]`}
            style={{ "--landing-panel": "color-mix(in srgb, var(--reg-on-surface) 4%, var(--reg-surface))" } as CSSProperties}
          >
            <SpeakerTabs
              tabs={tabPembicara}
              eyebrow={lembaga >= 3 ? LANDING_SECTION_LABELS.speakers : null}
              heading={lembaga >= 3 ? `${speakers.length} pembicara dari ${lembaga} lembaga` : LANDING_SECTION_LABELS.speakers}
              eyebrowClassName={ALIS}
              headingClassName={JUDUL}
            />
          </section>
        ) : null}
      </>
    ),
    venue: (
      <>
        {/* ---- Lokasi ------------------------------------------------------- */}
        {tampil("venue") ? (
          <Section id="venue">
            <div className={`grid items-center gap-10 lg:gap-20 ${petaKueri ? "lg:grid-cols-2" : ""}`}>
              <div className="flex max-w-[572px] flex-col items-start gap-8 sm:gap-10">
                <div className="flex flex-col gap-5">
                  {venue ? <p className={ALIS}>{LANDING_SECTION_LABELS.venue}</p> : null}
                  <h2 className={JUDUL}>{venue ?? LANDING_SECTION_LABELS.venue}</h2>
                  {event.venue_address ? (
                    <p className={`whitespace-pre-line text-body-large ${MUTED}`}>{event.venue_address}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  {petaUrl ? (
                    <a
                      href={petaUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={PIL_PENUH}
                      style={STATE_ON_PRIMARY}
                    >
                      {tautanPeta(petaUrl)}
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

              {petaKueri ? (
                // Peta tersemat dari nama dan alamat tempat (tanpa kunci API).
                // Dimuat malas: tamu yang tidak menggulir sampai sini tidak
                // memuat apa pun dari Google.
                <div className="overflow-hidden rounded-lg bg-[var(--reg-panel)] [aspect-ratio:4/3] sm:[aspect-ratio:625/460]">
                  <iframe
                    title={`Peta ${venue ?? "lokasi acara"}`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(petaKueri)}&output=embed`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="size-full border-0"
                  />
                </div>
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
              <div className="flex flex-col gap-5 lg:self-start">
                <p className={ALIS}>{LANDING_SECTION_LABELS.faq}</p>
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
    // Logo mitra tinggal di kaki halaman ("Diselenggarakan oleh"), bukan
    // bagian sendiri di tengah halaman.
    sponsors: null,
  };

  return (
    <main data-halaman-publik className="min-h-dvh bg-[var(--reg-surface)] text-[var(--reg-on-surface)]" style={mainStyle}>
      <LandingNavModern
        eventName={nama}
        daftarUrl={daftarUrl}
        registrationOpen={event.registration_enabled}
        memberLink={memberLink}
        sections={navSections}
        width={config.nav?.width ?? "full"}
        logoUrl={config.nav?.logo_url ?? null}
        logoOnDark={Boolean(kv) && (config.nav?.opacity ?? LANDING_NAV_DEFAULTS.opacity) < 50}
      />

      {/* ---- Hero ---------------------------------------------------------
          Ditarik ke bawah bilah nav (margin negatif setinggi nav, `--nav-h`
          dari modernNavStyle) supaya KV
          mulai dari tepi atas layar, seperti di rancangan. */}
      <header
        data-bagian="pembuka"
        data-landing-hero
        className={`relative isolate -mt-[var(--nav-h)] overflow-hidden ${kv ? "bg-black" : "bg-[var(--reg-brand)]"}`}
        style={tinta(Boolean(kv))}
      >
        {kv ? <Kv src={kv} scrim={KV_SCRIM} /> : null}
        <div
          style={config.hero_min_height ? ({ "--hero-h": `${config.hero_min_height}px` } as CSSProperties) : undefined}
          className={`${SHELL} flex flex-col text-[var(--ink)] ${
            // Dengan KV, isi hero berdiri di bawah supaya gambarnya terlihat,
            // dengan jarak bawah 40/64dp (kelipatan 8dp M3). Tanpa KV tidak ada
            // yang perlu diperlihatkan di atas judul, jadi isinya di tengah.
            kv ? "justify-end pb-10 pt-28 lg:pb-16" : "justify-center pb-12 pt-28 lg:pb-16"
          } ${
            config.hero_min_height ? HERO_HEIGHT_ANGKA : HERO_HEIGHT[config.hero_height ?? "standard"]
          }`}
        >
          {/* Urutan: nama acara, subjudul (satu kelompok, jarak 16), info
              acara (24), tombol (32). Ritme M3 kelipatan 8dp. */}
          <div className="flex min-w-0 max-w-[1040px] flex-col">
            <h1
              // Tinggi baris display M3: 64/57 = 1.12.
              className={`rise-in text-balance font-semibold leading-[1.12] tracking-[-0.02em] ${HEAD} ${
                config.heading_size ? "" : HEADING_SCALE[config.heading_scale ?? "lg"]
              }`}
              style={{ ...HERO_DELAY(0), ...(config.heading_size ? { fontSize: landingHeadingFontSize(config.heading_size) } : null) }}
            >
              {nama}
            </h1>
            {event.tagline ? (
              // body-large 16/24 di ponsel, title-large 22/28 di layar lebar (skala tipe M3).
              <p className="rise-in mt-4 max-w-[720px] text-body-large opacity-90 sm:text-title-large sm:font-normal" style={HERO_DELAY(2)}>
                {event.tagline}
              </p>
            ) : null}
            {/* Info acara sebagai teks berikon, bukan chip: di M3 chip adalah
                elemen yang bisa diklik, dan bingkainya menambah ramai di atas
                foto. Letaknya tepat di atas tombol karena tanggal dan tempat
                adalah yang dibaca orang sebelum memutuskan mendaftar. */}
            {infoHero.length > 0 ? (
              <ul className="rise-in mt-6 flex flex-wrap gap-x-6 gap-y-2 text-body-large font-medium" style={HERO_DELAY(2)}>
                {infoHero.map(({ ikon: Ikon, teks }) => (
                  <li key={teks} className="inline-flex items-center gap-2 tabular-nums">
                    <Ikon size={20} weight="regular" aria-hidden className="shrink-0 opacity-80" />
                    {teks}
                  </li>
                ))}
              </ul>
            ) : null}
            {/* Satu tombol filled M3, aksi berpenekanan tertinggi di layar ini.
                Saat pendaftaran tertutup tidak ada tombol palsu: tombol utamanya
                menjadi aksi yang memang bisa dilakukan (lihat susunan acara),
                dan statusnya ditulis sebagai teks. */}
            <div className="rise-in mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" style={HERO_DELAY(3)}>
              {event.registration_enabled ? (
                <>
                  <Link href={daftarUrl} className={`${kv ? PIL_CTA_KV : PIL_INK} justify-center`} style={kv ? ctaKv : undefined}>
                    {ctaLabel}
                  </Link>
                  {tampil("agenda") ? (
                    <a href="#agenda" className={`${PIL_INK_GARIS} justify-center`}>
                      Lihat susunan acara
                    </a>
                  ) : null}
                </>
              ) : (
                <>
                  <a href={aksiTertutup.href} className={`${kv ? PIL_CTA_KV : PIL_INK} justify-center`} style={kv ? ctaKv : undefined}>
                    {aksiTertutup.label}
                  </a>
                  <p className="text-body-large opacity-90">Pendaftaran dibuka segera.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Jangkar tombol "Pelajari acaranya" saat pendaftaran tertutup. */}
      <div id="isi-acara" aria-hidden className="scroll-mt-16" />

      {sections
        .filter((section) => section.enabled)
        .map((section) => {
          if (isLandingBlockId(section.id)) {
            const block = blokById.get(section.id);
            return block ? (
              <LandingBlockView key={section.id} block={block} daftarUrl={event.registration_enabled ? daftarUrl : null} daftarLabel={ctaLabel} jangkar={jangkar} />
            ) : null;
          }
          const konten = bawaan[section.id];
          return konten ? (
            <div key={section.id} data-bagian={section.id} className={SHELL}>
              {konten}
            </div>
          ) : null;
        })}

      <div className={SHELL}>
        {/* ---- Banner ajakan ------------------------------------------------ */}
        {event.registration_enabled && !adaBlokAjakan ? (
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

      {/* ---- Penyelenggara ---------------------------------------------------
          Pita terang tepat di atas kaki halaman, bukan di atas navy: logo
          lembaga dibuat untuk latar terang, dan versi putihnya jarang ada.
          Satu deret rata tengah, sama tinggi, tanpa petak per logo. */}
      {mitra.length > 0 ? (
        <section aria-labelledby="penyelenggara" className="border-t border-[var(--reg-outline-variant)]">
          <div className={`${SHELL} flex flex-col items-center gap-6 py-10 sm:py-12`}>
            <h2 id="penyelenggara" className={`text-title-small font-semibold ${MUTED}`}>
              Diselenggarakan oleh
            </h2>
            <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
              {mitra.map((sponsor) => (
                <li key={sponsor.logo_url} className="flex h-10 items-center sm:h-12">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sponsor.logo_url} alt={sponsor.name ?? ""} loading="lazy" className="max-h-full w-auto max-w-[160px] object-contain" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ---- Kaki halaman ---------------------------------------------------- */}
      <footer data-bagian="kaki" className="text-white" style={{ backgroundColor: LATAR_KAKI }}>
        <div className={`${SHELL} flex flex-col gap-10 pb-8 pt-12 sm:pt-16`}>
          <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
            <div className="flex max-w-[420px] flex-col gap-3">
              <p className={`${HEAD} text-title-large font-semibold`}>{nama}</p>
              {config.footer_note?.trim() ? (
                <p className="text-body-medium leading-[1.6] text-white/70">{config.footer_note.trim()}</p>
              ) : (
                <div className="text-body-medium leading-[1.6] text-white/70">
                  {tanggal ? <p>{tanggal}</p> : null}
                  {venue ? <p>{venue}</p> : null}
                </div>
              )}
              {event.registration_enabled ? (
                <div style={tinta(true)} className="mt-3">
                  <Link href={daftarUrl} className={PIL_INK}>
                    {ctaLabel}
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:flex sm:gap-20">
              {tautanAcara.length > 0 ? (
                <KolomKaki judul="Acara" tautan={tautanAcara.map((item) => ({ label: item.label, href: `#${item.id}` }))} />
              ) : null}
              {tautanTamu.length > 0 ? <KolomKaki judul="Peserta" tautan={tautanTamu} /> : null}
              {kontak.length > 0 ? <KolomKaki judul="Kontak panitia" tautan={kontak} /> : null}
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-3 border-t border-white/15 pt-6 text-body-small text-white/60">
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
