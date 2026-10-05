import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarBlank, CalendarPlus, Clock, MapPin, Minus, Moon, Plus } from "@phosphor-icons/react/dist/ssr";
import type {
  EventLandingConfig,
  EventRow,
  LandingHeadingScale,
  LandingHeroHeight,
  LandingSection,
  LandingHeadedSection,
  LandingSectionId,
} from "@/lib/domain";
import { LANDING_NAV_DEFAULTS, isLandingBlockId, landingBlockHasContent, landingHeadingFontSize, publicEventName } from "@/lib/domain";
import { heroCtaColors } from "@/lib/registration-theme-css";
import { formatEventDate, formatEventTime } from "@/lib/event-datetime";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { jumlahSesi, speakerTabs } from "@/lib/landing-speaker-tabs";
import { LANDING_LANG_LABELS, LANDING_UI, landingDefaultLang, landingPath, landingSectionHeading, landingSessionLabels, type LandingLang } from "@/lib/landing-i18n";
import { rentangAkhir } from "@/lib/landing-agenda-range";
import { getMemberSession, memberConfig, PASSWORD_MIN } from "@/lib/member/account";
import { MasukDialog } from "@/components/member/masuk-dialog";
import type { MasukMode, MasukSandi } from "@/app/masuk/masuk-client";
import { timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";
import { loadLandingLodging, type LandingHotel } from "@/lib/landing-hotel";
import { AgendaPills } from "./modern/agenda-pills";
import { LandingNavModern } from "./modern/landing-nav-modern";
import { SpeakerTabs } from "./modern/speaker-tabs";
import { HEAD, JUDUL, JUDUL_BUTIR, LABEL_BAGIAN, LEBAR_BACA, MUTED, PIL, PIL_GARIS, PIL_PENUH, SECTION, SHELL } from "./modern/styles";
import { LandingBlockView } from "./modern/landing-blocks";
import { KakiModern, KV_SCRIM, KV_SCRIM_RATA, PitaMitra, bagianModern, gayaModern, tinta } from "./modern/kerangka";
import { muatNavPeserta } from "@/lib/member/nav";

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
  /** Event dan config SUDAH dalam bahasa halaman (resolveLanding di landing-i18n.ts). */
  event: EventRow;
  config: EventLandingConfig;
  sections: LandingSection[];
  theme: CSSProperties;
  /** Bahasa halaman. Bawaan Indonesia. */
  lang?: LandingLang;
  /** Versi bahasa lain tersedia: tombol bahasa tampil di bilah atas. */
  otherLang?: LandingLang | null;
  /** Dialog masuk peserta terbuka sejak dimuat (alamat `/e/<slug>/masuk`), dengan mode ini. */
  masukAwal?: MasukMode | null;
  /** Tautan sandi dari email, untuk dialog yang dibuka di mode "sandi". */
  sandi?: MasukSandi;
};

/** Label kecil di atas judul bagian, sama dengan blok dari pustaka blok. */
const ALIS = `${LABEL_BAGIAN} text-[var(--reg-primary)]`;

const STATE_ON_PRIMARY = { "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties;


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



const HERO_DELAY = (step: number) => ({ "--rise-delay": `${step * 60}ms` }) as CSSProperties;


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

/** Pengantar FAQ; diberi titik bila kalimat kontak ("Hubungi panitia ...") ditempel di belakangnya. */
function pengantarFaq(teks: string, adaKontak: boolean): string {
  return adaKontak && !/[.!?…]$/.test(teks) ? `${teks}.` : teks;
}

/** Label kecil (opsional) dan judul bagian, 12px di antaranya. */
function JudulBagian({ alis, judul }: { alis: string | null; judul: string }) {
  if (!alis) return <h2 className={JUDUL}>{judul}</h2>;
  return (
    <div className="flex flex-col gap-3">
      <p className={ALIS}>{alis}</p>
      <h2 className={JUDUL}>{judul}</h2>
    </div>
  );
}

function Section({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <section id={id} className={SECTION}>
      {children}
    </section>
  );
}

function tautanPeta(url: string, lang: LandingLang): string {
  return /google\.|goo\.gl/i.test(url) ? LANDING_UI[lang].openGoogleMaps : LANDING_UI[lang].openMap;
}

export async function EventLandingModern({ event, config, sections, theme, lang = "id", otherLang = null, masukAwal = null, sandi = null }: Props) {
  // Teks bawaan halaman dalam bahasa halaman. Teks dari CMS sudah diterjemahkan
  // sebelum sampai di sini (resolveLanding).
  const t = LANDING_UI[lang];
  // Judul bagian bawaan: teks dari CMS, atau judul otomatis/bawaan bila kosong.
  const judulBagian = (id: LandingHeadedSection) => landingSectionHeading(event, config, lang, id);
  // Formulir pendaftaran dalam bahasa halaman (src/app/daftar). Area peserta
  // belum dwibahasa.
  const daftarUrl = `${landingPath(event.slug, lang, landingDefaultLang(config))}/daftar`;
  const ctaLabel = config.cta_label?.trim() || t.registerNow;
  const agenda = await loadAgendaPreview(event.id, lang);
  const zona = timeZoneAbbr(event.time_zone);

  const member = memberConfig(event);
  const masukUrl = `${landingPath(event.slug, lang, landingDefaultLang(config))}/masuk`;
  // Peserta yang sudah masuk melihat halaman acara yang sama, dengan lonceng
  // pengumuman dan "Dashboard saya" menggantikan Masuk dan Daftar.
  const sesi = member ? await getMemberSession(event) : null;
  const sudahMasuk = Boolean(sesi);
  const peserta = sesi ? await muatNavPeserta(event, sesi, lang) : null;
  const memberLink = member && !sesi ? { href: masukUrl, label: t.signIn } : null;
  // Khusus undangan (preset Gathering): saat pendaftaran tertutup, ajakannya
  // masuk, bukan menunggu pendaftaran. Tanpa area peserta tidak ada yang bisa
  // dimasuki, jadi halaman kembali ke perilaku tertutup biasa.
  const undangan = Boolean(config.invite_only) && Boolean(member) && !event.registration_enabled && !sudahMasuk;

  // Gaya gathering (preset Gathering). Acara lain tidak membaca hotel apa pun
  // dan tampil persis seperti sebelumnya.
  const gaya = config.gathering === true;
  const inap = gaya ? await loadLandingLodging(event.id) : null;
  const hotelInap = inap?.hotels ?? [];

  const { tampil, tampilProgram, speakers, blokById, jangkar, navSections, mitra, kontak } = bagianModern(event, config, sections, agenda, lang, {
    gathering: gaya,
    adaHotel: hotelInap.length > 0,
  });

  const kv = config.banner_url ?? null;
  // Pita ajakan dari pustaka blok menggantikan banner ajakan bawaan, supaya
  // halaman tidak punya dua ajakan mendaftar yang sama berturut-turut.
  const adaBlokAjakan = sections.some((section) => {
    const block = section.enabled && isLandingBlockId(section.id) ? blokById.get(section.id) : undefined;
    return block?.type === "cta" && landingBlockHasContent(block);
  });
  const nama = publicEventName(event);
  const tanggal = formatEventDate(event, lang);
  const jam = formatEventTime(event, lang);
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
  // Gathering tanpa kotak angka: "6 sesi" adalah bahasa acara rapat.
  const sorotan = !gaya && tampil("highlights") ? config.highlights?.[0] : undefined;
  // Pembicara yang sama dengan Susunan acara, supaya angka dan baris tenangnya sepakat.
  const orangSesi = tampil("speakers") ? speakers : [];
  const totalSesi = agenda.reduce((jumlah, bagian) => jumlah + jumlahSesi(bagian.items, orangSesi), 0);
  const stat = sorotan
    ? { nilai: sorotan.value, label: sorotan.label }
    : totalSesi > 0 && !gaya
      ? { nilai: t.sessions(totalSesi), label: agenda.length > 1 ? t.inPrograms(agenda.length) : null }
      : null;

  // Gambar di samping Tentang acara (Halaman acara > Tentang acara > Gambar).
  // Otomatis: banner hero dengan angka di atas. Gambar sendiri yang belum
  // diunggah tetap otomatis, supaya bagian ini tidak kosong sesaat di pratinjau.
  const mediaTentang = config.about_media ?? "auto";
  const fotoTentang = mediaTentang === "image" ? config.about_image_url?.trim() || null : null;
  const panelTentang = mediaTentang !== "none" && !fotoTentang && Boolean(kv || stat);

  // Gathering: lama menginap menggantikan jam, karena jam mulai-selesai acara
  // tiga hari tidak berarti apa-apa bagi tamu.
  const lamaHari = gaya ? jumlahHari(event.event_date, event.end_date) : null;
  const infoHero = [
    tanggal ? { ikon: CalendarBlank, teks: tanggal } : null,
    jam && !gaya ? { ikon: Clock, teks: jam } : null,
    venue ? { ikon: MapPin, teks: venue } : null,
    lamaHari ? { ikon: Moon, teks: t.stayLength(lamaHari) } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  const cta = heroCtaColors(config.theme?.seed);
  // Aksi utama saat pendaftaran tertutup: yang memang bisa dilakukan tamu.
  const aksiTertutup = tampil("agenda")
    ? { href: "#agenda", label: t.viewAgenda }
    : { href: "#isi-acara", label: t.aboutEvent };
  const ctaKv = { "--cta-bg": cta.bg, "--cta-fg": cta.fg } as CSSProperties;
  const judulAjakan = gaya ? event.tagline?.trim() || null : null;
  const mainStyle = gayaModern(config, theme);

  // Paling banyak 8 kartu sekaligus; sisanya per sesi lewat tab (lihat
  // landing-speaker-tabs.ts, dipakai juga tata letak lain).
  const tabPembicara = speakerTabs(speakers, agenda, {
    highlights: t.speakerHighlights,
    others: t.otherSpeakers,
    sesi: landingSessionLabels(config, lang),
  });
  const judulPembicara = judulBagian("speakers");

  const kalenderUrl = event.event_date ? `/kalender.ics?eventSlug=${encodeURIComponent(event.slug)}` : null;
  const tahun = (event.event_date ?? new Date().toISOString()).slice(0, 4);

  const tautanTamu = [
    ...(peserta ? [{ label: t.myDashboard, href: peserta.dashboardHref }] : []),
    ...(!peserta && event.registration_enabled ? [{ label: t.register, href: daftarUrl }] : []),
    ...(memberLink ? [{ label: t.signInMemberArea, href: memberLink.href }] : []),
    ...(tampil("faq") ? [{ label: "FAQ", href: "#faq" }] : []),
  ];
  // Aksi utama peserta yang sudah masuk: tiketnya, atau status pendaftarannya
  // selama belum disetujui. Menggantikan ajakan mendaftar di hero dan kaki.
  const aksiPeserta = peserta && sesi
    ? { href: peserta.dashboardHref, label: sesi.status === "approved" ? t.viewMyTicket : t.viewRegistrationStatus }
    : null;
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
              <h2 className={`${JUDUL} max-w-[640px] whitespace-pre-line`}>{config.program_heading?.trim() || t.program}</h2>
              {config.program_intro?.trim() ? (
                <p className={`max-w-[520px] text-isi ${MUTED}`}>{config.program_intro.trim()}</p>
              ) : null}
            </div>
            <ul className="mt-10 grid gap-4 sm:mt-14 sm:gap-6 md:grid-cols-2">
              {agenda.map((bagian, index) => {
                const awal = bagian.items[0]?.time;
                const akhir = rentangAkhir(bagian);
                const catatan = config.program_notes?.[index]?.trim();
                // Program yang isinya jeda semua tidak diberi "0 sesi".
                const sesiProgram = jumlahSesi(bagian.items, orangSesi);
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
                      {sesiProgram > 0 ? <span className={CHIP}>{t.sessions(sesiProgram)}</span> : null}
                    </div>
                    <h3 className="text-balance text-headline-medium font-medium">
                      {bagian.sectionTitle || t.part(index + 1)}
                    </h3>
                    {catatan ? <p className={`whitespace-pre-line text-isi ${MUTED}`}>{catatan}</p> : null}
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
            <div className={`grid items-center gap-10 lg:gap-20 ${fotoTentang || panelTentang ? "lg:grid-cols-2" : ""}`}>
              {fotoTentang ? (
                // Gambar dari CMS: tampil apa adanya, tanpa angka di atasnya.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fotoTentang}
                  alt={config.about_image_alt?.trim() ?? ""}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-lg object-cover sm:aspect-[625/550]"
                />
              ) : panelTentang ? (
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
                  <JudulBagian {...judulBagian("about")} />
                  {/* whitespace-pre-line: paragraf dipisah enter di CMS. */}
                  <p className={`${LEBAR_BACA} whitespace-pre-line text-isi ${MUTED}`}>{event.description}</p>
                </div>
                {tampil("agenda") ? (
                  <a href="#agenda" className={PIL_PENUH} style={STATE_ON_PRIMARY}>
                    {t.viewAgenda}
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
            {/* Satu kolom: tanggal adalah judul bagian di atas daftar, bukan
                kolom kiri yang 60% kosong. Acara satu hari tidak butuh penanda
                yang ikut turun; daftar yang padat muat satu layar laptop. */}
            <div className="flex flex-col gap-3">
              <JudulBagian
                {...judulBagian("agenda")}
                // Gathering: label "Perjalanan", kecuali panitia menulis labelnya sendiri.
                {...(gaya && !config.agenda_eyebrow?.trim() ? { alis: t.tripEyebrow } : {})}
              />
              {/* Catatan di bawah judul, sama seperti bagian lain. */}
              {config.agenda_note?.trim() ? <p className={`max-w-[520px] text-isi ${MUTED}`}>{config.agenda_note.trim()}</p> : null}
            </div>
            <div className="mt-6 sm:mt-8">
              <AgendaPills agenda={agenda} speakers={tampil("speakers") ? speakers : []} lang={lang} perHari={gaya} />
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
              // Label kecil mati secara bawaan: "Pembicara" hanya mengulang judul "N pembicara dari M lembaga".
              eyebrow={judulPembicara.alis}
              heading={judulPembicara.judul}
              eyebrowClassName={ALIS}
              headingClassName={JUDUL}
              tablistLabel={t.speakersBySession}
            />
          </section>
        ) : null}
      </>
    ),
    venue: (
      <>
        {/* ---- Tempat menginap (gathering) ---------------------------------- */}
        {gaya && hotelInap.length > 0 && tampil("venue") ? (
          <Section id="venue">
            <TempatMenginap hotels={hotelInap} sesamaJenis={inap?.same_gender ?? false} zona={event.time_zone} lang={lang} />
          </Section>
        ) : null}
        {/* ---- Lokasi ------------------------------------------------------- */}
        {tampil("venue") && !(gaya && hotelInap.length > 0) ? (
          <Section id="venue">
            <div className={`grid items-center gap-10 lg:gap-20 ${petaKueri ? "lg:grid-cols-2" : ""}`}>
              <div className="flex max-w-[572px] flex-col items-start gap-8 sm:gap-10">
                <div className="flex flex-col gap-5">
                  <JudulBagian {...judulBagian("venue")} />
                  {event.venue_address ? (
                    <p className={`whitespace-pre-line text-isi ${MUTED}`}>{event.venue_address}</p>
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
                      {tautanPeta(petaUrl, lang)}
                      <ArrowUpRight size={16} weight="bold" aria-hidden />
                    </a>
                  ) : null}
                  {kalenderUrl ? (
                    // Slug sebagai query, bukan segmen path: lihat Editorial.
                    <a href={kalenderUrl} className={PIL_GARIS}>
                      <CalendarPlus size={18} aria-hidden />
                      {t.addToCalendar}
                    </a>
                  ) : null}
                </div>
                <Link
                  href={`/e/${event.slug}/denah`}
                  className="m3-state -mx-2 -mt-4 inline-flex min-h-12 items-center gap-2 rounded-md px-2 text-title-small font-semibold text-[var(--reg-primary)]"
                >
                  {t.findSeat}
                  <ArrowRight size={16} weight="bold" aria-hidden />
                </Link>
              </div>

              {petaKueri ? (
                // Peta tersemat dari nama dan alamat tempat (tanpa kunci API).
                // Dimuat malas: tamu yang tidak menggulir sampai sini tidak
                // memuat apa pun dari Google.
                <div className="overflow-hidden rounded-lg bg-[var(--reg-panel)] [aspect-ratio:4/3] sm:[aspect-ratio:625/460]">
                  <iframe
                    title={t.mapOf(venue)}
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
                <JudulBagian {...judulBagian("faq")} />
                <p className={`text-isi ${MUTED}`}>
                  {pengantarFaq(config.faq_intro?.trim() || t.faqIntro, kontak.length > 0)}
                  {kontak.length > 0 ? t.faqContact : null}
                </p>
              </div>
              {/* <details>: papan ketik, pembaca layar, dan tanpa JavaScript.
                  Yang pertama terbuka, seperti di rancangan. */}
              <div className="flex flex-col gap-3">
                {(config.faq ?? []).map((item, index) => (
                  // Lapisan hover hanya menutup pertanyaan (M3 state layer). Saat
                  // terbuka (layar sm ke atas), ruang bawah pertanyaan 16px dan jawaban diberi
                  // 16px di atasnya: tepi lapisan tidak lagi menempel di teks.
                  <details key={item.q} open={index === 0} className="faq group rounded-md bg-[var(--reg-panel)]">
                    <summary className={`m3-state flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-md px-5 py-5 sm:px-7 sm:py-6 sm:group-open:pb-4 ${JUDUL_BUTIR} [&::-webkit-details-marker]:hidden`}>
                      {item.q}
                      <Plus size={22} aria-hidden className={`shrink-0 group-open:hidden ${MUTED}`} />
                      <Minus size={22} aria-hidden className={`hidden shrink-0 group-open:block ${MUTED}`} />
                    </summary>
                    <p className={`max-w-[38.5rem] whitespace-pre-line px-5 pb-6 pt-4 text-isi sm:px-7 ${MUTED}`}>{item.a}</p>
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
    // `lang` di <main>: <html lang="id"> ditulis root layout untuk seluruh
    // aplikasi, jadi halaman English menandai bahasanya di sini supaya pembaca
    // layar memakai pelafalan yang benar.
    <main lang={LANDING_LANG_LABELS[lang].htmlLang} data-halaman-publik className="min-h-dvh bg-[var(--reg-surface)] text-[var(--reg-on-surface)]" style={mainStyle}>
      <LandingNavModern
        eventName={nama}
        daftarUrl={daftarUrl}
        registrationOpen={event.registration_enabled}
        memberLink={memberLink}
        sections={navSections}
        width={config.nav?.width ?? "full"}
        logoUrl={config.nav?.logo_url ?? null}
        logoOnDark={Boolean(kv) && (config.nav?.opacity ?? LANDING_NAV_DEFAULTS.opacity) < 50}
        lang={lang}
        langSwitch={otherLang ? { href: landingPath(event.slug, otherLang, landingDefaultLang(config)), lang: otherLang } : null}
        peserta={peserta}
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
            {judulAjakan ? (
              // Gathering: nama acara turun menjadi label kecil, dan tagline
              // menjadi judul ajakan (rancangan 2026-10-03).
              <p className={`rise-in mb-4 ${LABEL_BAGIAN} opacity-90`} style={HERO_DELAY(0)}>
                {[nama, undangan ? t.inviteOnlyShort : null].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <h1
              // Tinggi baris display M3: 64/57 = 1.12.
              className={`rise-in text-balance font-semibold leading-[1.12] tracking-[-0.02em] ${HEAD} ${
                config.heading_size ? "" : HEADING_SCALE[config.heading_scale ?? "lg"]
              }`}
              style={{ ...HERO_DELAY(0), ...(config.heading_size ? { fontSize: landingHeadingFontSize(config.heading_size) } : null) }}
            >
              {judulAjakan ?? nama}
            </h1>
            {event.tagline && !judulAjakan ? (
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
              {aksiPeserta ? (
                <>
                  <Link href={aksiPeserta.href} className={`${kv ? PIL_CTA_KV : PIL_INK} justify-center`} style={kv ? ctaKv : undefined}>
                    {aksiPeserta.label}
                  </Link>
                  {tampil("agenda") ? (
                    <a href="#agenda" className={`${PIL_INK_GARIS} justify-center`}>
                      {t.viewAgenda}
                    </a>
                  ) : null}
                </>
              ) : event.registration_enabled ? (
                <>
                  <Link href={daftarUrl} className={`${kv ? PIL_CTA_KV : PIL_INK} justify-center`} style={kv ? ctaKv : undefined}>
                    {ctaLabel}
                  </Link>
                  {tampil("agenda") ? (
                    <a href="#agenda" className={`${PIL_INK_GARIS} justify-center`}>
                      {t.viewAgenda}
                    </a>
                  ) : null}
                </>
              ) : undangan ? (
                <>
                  <Link href={masukUrl} className={`${kv ? PIL_CTA_KV : PIL_INK} justify-center`} style={kv ? ctaKv : undefined}>
                    {gaya ? t.inviteCta : t.memberSignIn}
                  </Link>
                  {judulAjakan ? null : <p className="text-isi opacity-90">{t.inviteOnly}</p>}
                </>
              ) : (
                <>
                  <a href={aksiTertutup.href} className={`${kv ? PIL_CTA_KV : PIL_INK} justify-center`} style={kv ? ctaKv : undefined}>
                    {aksiTertutup.label}
                  </a>
                  <p className="text-isi opacity-90">{t.registrationSoon}</p>
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
              <LandingBlockView key={section.id} block={block} daftarUrl={event.registration_enabled && !peserta ? daftarUrl : null} daftarLabel={ctaLabel} jangkar={jangkar} lang={lang} />
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
        {/* Yang sudah terdaftar tidak diajak mendaftar lagi. */}
        {event.registration_enabled && !adaBlokAjakan && !peserta ? (
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
              <h2 className={`${JUDUL} max-w-[800px]`}>{config.cta_heading?.trim() || t.ctaHeading}</h2>
              {config.cta_note?.trim() ? (
                <p className="max-w-[720px] text-title-large font-normal leading-[1.5] opacity-90">{config.cta_note.trim()}</p>
              ) : null}
              <Link href={daftarUrl} className={PIL_INK}>
                {ctaLabel}
              </Link>
            </div>
          </section>
        ) : null}
        {/* Khusus undangan: pita penutup yang sama, mengajak tamu undangan masuk. */}
        {undangan && !adaBlokAjakan ? (
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
              <h2 className={`${JUDUL} max-w-[800px]`}>{t.inviteHeading}</h2>
              <p className="max-w-[720px] text-title-large font-normal leading-[1.5] opacity-90">{t.inviteNote}</p>
              <Link href={masukUrl} className={PIL_INK}>
                {t.memberSignIn}
              </Link>
            </div>
          </section>
        ) : null}
      </div>

      <PitaMitra mitra={mitra} judul={t.organisedBy} />

      {/* ---- Kaki halaman ---------------------------------------------------- */}
      <KakiModern
        nama={nama}
        keterangan={{ catatan: config.footer_note?.trim() || null, baris: [tanggal, venue].filter((baris): baris is string => Boolean(baris)) }}
        tombol={aksiPeserta ?? (event.registration_enabled ? { href: daftarUrl, label: ctaLabel } : undangan ? { href: masukUrl, label: t.memberSignIn } : null)}
        kolom={[
          { judul: t.footerEvent, tautan: tautanAcara.map((item) => ({ label: item.label, href: `#${item.id}` })) },
          { judul: t.footerGuests, tautan: tautanTamu },
          { judul: t.footerContact, tautan: kontak },
        ]}
        tahun={tahun}
        poweredBy={t.poweredBy}
        pil={PIL_INK}
      />

      {/* Masuk area peserta: dialog di atas halaman ini, dibuka tautan Masuk di
          bilah atas dan kaki, dalam bahasa halamannya. */}
      {/* Yang sudah masuk tetap mendapat dialog bila membuka tautan sandi yang
          masih berlaku: itu cara mengganti kata sandi. */}
      {member && (!sudahMasuk || (sandi && sandi !== "invalid")) ? (
        <MasukDialog
          slug={event.slug}
          masukUrl={masukUrl}
          halamanUrl={landingPath(event.slug, lang, landingDefaultLang(config))}
          keterangan={[nama, formatEventDate(event, lang)].filter(Boolean).join(" · ")}
          minPassword={PASSWORD_MIN}
          awal={masukAwal}
          sandi={sandi}
          lang={lang}
        />
      ) : null}
    </main>
  );
}

/** Jumlah hari dari tanggal mulai sampai selesai (inklusif). Null bila satu hari atau tanggal tidak lengkap. */
function jumlahHari(mulai: string | null, selesai: string | null): number | null {
  if (!mulai || !selesai) return null;
  const hari = Math.round((Date.parse(`${selesai}T00:00:00Z`) - Date.parse(`${mulai}T00:00:00Z`)) / 86_400_000) + 1;
  return Number.isFinite(hari) && hari > 1 && hari <= 31 ? hari : null;
}

function waktuInap(iso: string | null, zona: EventTimeZone, lang: LandingLang): string | null {
  if (!iso) return null;
  const tanggal = new Date(iso);
  const locale = lang === "en" ? "en-GB" : "id-ID";
  const hari = new Intl.DateTimeFormat(locale, { timeZone: zona, weekday: "short", day: "numeric", month: "short" }).format(tanggal);
  const jamnya = new Intl.DateTimeFormat(locale, { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(tanggal);
  return `${hari} · ${lang === "en" ? jamnya : jamnya.replace(":", ".")}`;
}

/**
 * Bagian "Tempat menginap" gaya gathering: hotel dari Logistik, dengan jam
 * check-in/out dan aturan kamar. Peta tersemat di kanan, sama dengan Lokasi.
 * Nomor kamar dan teman sekamar TIDAK di sini; itu milik Dashboard saya.
 */
function TempatMenginap({ hotels, sesamaJenis, zona, lang }: { hotels: LandingHotel[]; sesamaJenis: boolean; zona: EventTimeZone; lang: LandingLang }) {
  const t = LANDING_UI[lang];
  const utama = hotels[0];
  const kueriPeta = [utama.name, utama.address].filter(Boolean).join(", ");
  return (
    <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-20">
      <div className="flex max-w-[572px] flex-col gap-8 sm:gap-10">
        <div className="flex flex-col gap-3">
          <p className={ALIS}>{t.hotelEyebrow}</p>
          <h2 className={JUDUL}>{t.hotelHeading}</h2>
        </div>
        {hotels.map((hotel) => {
          const masuk = waktuInap(hotel.check_in_at, zona, lang);
          const keluar = waktuInap(hotel.check_out_at, zona, lang);
          const petaUrl = hotel.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([hotel.name, hotel.address].filter(Boolean).join(", "))}`;
          return (
            <div key={hotel.id} className="flex flex-col items-start gap-5">
              <div className="flex flex-col gap-1.5">
                <h3 className={`${HEAD} text-[24px] font-semibold leading-tight`}>{hotel.name}</h3>
                {hotel.address ? <p className={`whitespace-pre-line text-isi ${MUTED}`}>{hotel.address}</p> : null}
              </div>
              {masuk || keluar || hotel.room_capacity ? (
                <dl className="grid w-full grid-cols-[120px_minmax(0,1fr)] gap-y-2.5 text-isi">
                  {masuk ? (
                    <>
                      <dt className={MUTED}>{t.checkIn}</dt>
                      <dd className="font-medium tabular-nums">{masuk}</dd>
                    </>
                  ) : null}
                  {keluar ? (
                    <>
                      <dt className={MUTED}>{t.checkOut}</dt>
                      <dd className="font-medium tabular-nums">{keluar}</dd>
                    </>
                  ) : null}
                  {hotel.room_capacity ? (
                    <>
                      <dt className={MUTED}>{t.room}</dt>
                      <dd className="font-medium">{t.roomShare(hotel.room_capacity, sesamaJenis)}</dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
              <a href={petaUrl} target="_blank" rel="noreferrer noopener" className={PIL_GARIS}>
                {t.openMap}
                <ArrowUpRight size={16} weight="bold" aria-hidden />
              </a>
            </div>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-lg bg-[var(--reg-panel)] [aspect-ratio:4/3] sm:[aspect-ratio:625/460]">
        <iframe
          title={t.mapOf(utama.name)}
          src={`https://www.google.com/maps?q=${encodeURIComponent(kueriPeta)}&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="size-full border-0"
        />
      </div>
    </div>
  );
}
