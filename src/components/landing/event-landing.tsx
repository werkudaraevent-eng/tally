import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarBlank,
  CalendarPlus,
  CaretDown,
  ChatCircleText,
  Clock,
  Envelope,
  MapPin,
  Phone,
} from "@phosphor-icons/react/dist/ssr";
import type {
  EventLandingConfig,
  EventRow,
  LandingHeroHeight,
  LandingSection,
  LandingSectionId,
} from "@/lib/domain";
import { LANDING_SECTION_LABELS } from "@/lib/domain";
import { formatEventDate, formatEventTime } from "@/lib/event-datetime";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { LandingNav } from "./landing-nav";

/**
 * Landing page publik acara.
 *
 * Template tetap dengan slot, BUKAN penyusun blok bebas. Admin mengatur bagian
 * mana yang tampil dan urutannya; markup, tipografi, dan jaraknya ditentukan di
 * sini. Alasannya sama dengan alasan warna form hanya menerima satu warna
 * merek: halaman ini dilihat tamu sebelum mereka memutuskan datang, dan
 * kualitasnya tidak boleh bergantung pada seberapa teliti admin menyusun blok.
 *
 * Bagian yang kosong TIDAK dirender sama sekali — acara tanpa sponsor tidak
 * menampilkan judul "Sponsor & mitra" di atas ruang kosong.
 *
 * ---- Tata letak ----------------------------------------------------------
 *
 * Grid halaman sama dengan grid layar admin (DESIGN.md "Grid halaman"):
 * `max-w-[1440px]` dengan pinggir yang melebar mengikuti kelas jendela M3
 * (compact 20px, medium 32px, expanded ke atas 40px). Sebelumnya halaman ini
 * memakai `max-w-5xl` — satu kolom 1024px yang dipusatkan, sehingga di layar
 * lebar seluruh isinya terbaca sebagai balok mengambang di tengah dengan ruang
 * kosong selebar layar di kanan-kirinya.
 *
 * Lebarnya melebar, tetapi teksnya TIDAK ikut melebar. Isi tiap bagian berdiri
 * di kolom kanan dengan judul bagian sebagai rel kiri yang menempel saat
 * digulir — pola supporting pane M3. Judul jadi penanda posisi sepanjang bagian
 * itu dibaca, dan panjang barisnya tetap di kisaran 65–75 karakter.
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

/**
 * Banner dilebur ke warna halaman. Gradien, bukan lapisan rata: banner dipilih
 * admin dan bisa terang di bagian bawah tempat teks berada, dan gradien menjaga
 * kontras teks tanpa memudarkan seluruh gambar.
 */
const BANNER_WASH =
  "linear-gradient(to bottom, color-mix(in srgb, var(--reg-surface) 55%, transparent), color-mix(in srgb, var(--reg-surface) 92%, transparent))";

/**
 * Banner tampil dengan warna aslinya.
 *
 * Dua lapisan, dan urutannya penting — yang ditulis lebih dulu berada di ATAS:
 *
 *   1. Pudar ke warna halaman di 12% terbawah, supaya hero tidak berakhir dengan
 *      garis potong mendadak di batas bagian berikutnya.
 *   2. Bayangan diagonal ke sudut kiri-bawah, tempat pil tanggal, judul, dan
 *      tombol berdiri di semua lebar layar. Sudut kanan-atas dibiarkan bersih,
 *      jadi gambarnya tetap terbaca sebagai gambar.
 *
 * Tanpa lapisan kedua, teks hero berdiri langsung di atas gambar yang isinya
 * tidak diketahui siapa pun saat kode ini ditulis.
 */
const BANNER_SCRIM = [
  "linear-gradient(to top, var(--reg-surface), transparent 12%)",
  "linear-gradient(to top right, rgb(0 0 0 / 0.72), rgb(0 0 0 / 0.32) 46%, rgb(0 0 0 / 0) 78%)",
].join(", ");

/**
 * Tinggi minimum hero per kelas jendela M3 (compact / medium / expanded).
 *
 * Ditulis sebagai kelas lengkap, bukan disusun dari potongan string: Tailwind
 * memindai berkas sumber sebagai teks, dan kelas yang baru terbentuk saat
 * runtime tidak pernah ikut ke dalam CSS yang dihasilkan.
 *
 * `standard` adalah patokan yang dipakai sebelum pilihan ini ada, jadi acara
 * yang belum pernah menyentuh pengaturannya tidak berubah tampilannya.
 */
const HERO_HEIGHT: Record<LandingHeroHeight, string> = {
  compact: "min-h-[320px] sm:min-h-[360px] lg:min-h-[400px]",
  standard: "min-h-[420px] sm:min-h-[480px] lg:min-h-[540px]",
  tall: "min-h-[520px] sm:min-h-[600px] lg:min-h-[680px]",
};
/** Kolom baca. Paragraf body-large melewati ~75 karakter per baris di atas ini. */
const PROSE = "max-w-[68ch]";

function SectionShell({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[var(--reg-outline-variant)] py-14 sm:py-20">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <h2 className="text-headline-small font-semibold tracking-tight sm:text-headline-medium lg:sticky lg:top-24 lg:col-span-4 lg:self-start xl:col-span-3">
          {title}
        </h2>
        <div className="lg:col-span-8 xl:col-span-9">{children}</div>
      </div>
    </section>
  );
}

/** Satu baris fakta di kartu detail hero: ikon, label kecil, nilai. */
function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 py-4">
      <span className="mt-0.5 shrink-0 text-[var(--reg-primary)]">{icon}</span>
      <div className="min-w-0">
        <p className={`text-label-medium uppercase tracking-[0.14em] ${MUTED}`}>{label}</p>
        <div className="mt-1 text-body-large">{children}</div>
      </div>
    </div>
  );
}

export async function EventLanding({ event, config, sections, theme, schedule }: Props) {
  const aktif = sections.filter((section) => section.enabled);
  const daftarUrl = `/e/${event.slug}/daftar`;
  const ctaLabel = config.cta_label?.trim() || "Daftar sekarang";

  const tanggal = formatEventDate(event);
  const waktu = formatEventTime(event);

  // Agenda hanya diambil bila bagiannya memang dinyalakan. Query rundown pada
  // halaman yang tidak menampilkannya adalah biaya yang dibayar setiap tamu.
  const agenda = aktif.some((section) => section.id === "agenda")
    ? await loadAgendaPreview(event.id)
    : [];

  // Bagian yang tidak punya isi dibuang di sini, sekali, sebelum apa pun
  // dirender — termasuk dari navigasi jangkar di atas. Nav yang menunjuk ke
  // bagian yang tidak ada adalah tautan yang tidak melakukan apa-apa.
  const isi: Record<LandingSectionId, boolean> = {
    about: Boolean(event.description?.trim()),
    highlights: (config.highlights ?? []).length > 0,
    agenda: agenda.length > 0,
    venue: Boolean(event.venue_name?.trim() || event.venue_address?.trim()),
    faq: (config.faq ?? []).length > 0,
    sponsors: (config.sponsors ?? []).length > 0,
    contact: Boolean(config.contact_name || config.contact_phone || config.contact_email),
  };
  const tampil = aktif.filter((section) => isi[section.id]);

  // Kartu detail hero hanya berdiri kalau memang ada fakta di dalamnya. Kartu
  // berisi satu baris di sebelah judul raksasa terbaca sebagai kotak yang lupa
  // diisi, dan lebih baik hero memakai seluruh lebarnya.
  const adaDetail = Boolean(tanggal || waktu || event.venue_name || event.venue_address);

  // Banner tampil apa adanya. Berlaku hanya kalau bannernya memang ada — tanpa
  // gambar, "warna asli" tidak menggambarkan apa pun dan teks putih akan berdiri
  // di atas latar terang.
  const fotoAsli = Boolean(config.banner_url) && config.banner_style === "photo";
  // Di atas bayangan gelap, warna teks tema (gelap di atas terang) tidak lagi
  // berlaku. Yang dipakai putih, bukan `on-primary` milik tema: `on-primary`
  // mengikuti warna merek dan bisa gelap.
  const heroTeks = fotoAsli ? "text-white" : "";
  const heroMuted = fotoAsli ? "text-white/85" : MUTED;

  return (
    <main className="min-h-dvh" style={theme}>
      <LandingNav
        eventName={event.name}
        ctaLabel={ctaLabel}
        daftarUrl={daftarUrl}
        registrationOpen={event.registration_enabled}
        sections={tampil.map((section) => ({ id: section.id, label: LANDING_SECTION_LABELS[section.id] }))}
      />

      {/* ---- Hero -------------------------------------------------------- */}
      <header className="relative isolate overflow-hidden">
        {config.banner_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={config.banner_url} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
            <div
              className="absolute inset-0 -z-10"
              style={{ background: fotoAsli ? BANNER_SCRIM : BANNER_WASH }}
            />
          </>
        ) : (
          // Tanpa banner, hero dulunya bidang rata seluas layar. Sapuan tonal
          // dari warna merek memberi hero tepi atas yang terlihat tanpa menuntut
          // admin mengunggah gambar — dan karena ia gradien CSS, tidak ada satu
          // pun bita tambahan yang diunduh tamu.
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(120% 100% at 82% -10%, color-mix(in srgb, var(--reg-primary) 22%, transparent), transparent 60%), radial-gradient(90% 80% at 0% 0%, color-mix(in srgb, var(--reg-primary) 10%, transparent), transparent 55%)",
            }}
          />
        )}

        <div
          // Pinggir bawah lebih besar daripada pinggir atas: isi hero diletakkan
          // sedikit di ATAS titik tengah geometris. Blok yang dipusatkan persis
          // selalu terbaca jatuh ke bawah, dan pinggir atas juga sudah menanggung
          // ruang bebas untuk bilah navigasi setinggi 64px yang muncul saat
          // halaman digulir.
          // Tinggi hero dipatok, dan isinya DIPUSATKAN di dalam patokan itu.
          // Sebelumnya patokannya 620px dengan isi rata bawah, jadi seluruh sisa
          // tinggi menumpuk menjadi satu bidang kosong di atas judul.
          className={`${SHELL} relative flex flex-col justify-center pb-16 pt-20 sm:pb-20 sm:pt-24 lg:pb-24 ${
            HERO_HEIGHT[config.hero_height ?? "standard"]
          }`}
        >
          <div className="grid items-end gap-10 lg:grid-cols-12 lg:gap-12">
            <div className={`lg:col-span-7 ${heroTeks}`}>
              {schedule ? (
                // Pil tonal, bukan teks huruf besar yang melayang. Ia fakta
                // pertama yang dicari tamu, dan pil memberinya bentuk yang bisa
                // ditemukan mata tanpa dibaca dulu.
                // Radius 24px, bukan `rounded-full`. Jadwal acara dua hari
                // dengan jam dan zona waktu ("6 – 8 Agustus 2026 · 09.00–17.00
                // WITA") melewati lebar layar 375px dan pil itu menjadi dua
                // baris; pada kapsul penuh, barisnya lalu menempel di lengkungan.
                <p className="inline-flex items-start gap-2 rounded-3xl bg-[var(--reg-primary-container)] px-4 py-2 text-label-large font-semibold text-[var(--reg-on-primary-container)]">
                  <CalendarBlank size={18} weight="fill" className="mt-0.5 shrink-0" />
                  {schedule}
                </p>
              ) : null}

              <h1 className="mt-6 text-balance text-display-small font-semibold tracking-[-0.03em] sm:text-display-medium lg:text-display-large">
                {event.name}
              </h1>

              {event.tagline ? (
                <p className={`mt-5 max-w-[52ch] text-title-large ${heroMuted}`}>{event.tagline}</p>
              ) : null}

              <div className="mt-9 flex flex-wrap items-center gap-3">
                {/* Tombol daftar hanya muncul saat pendaftaran memang terbuka.
                    Tombol yang mengantar ke halaman "pendaftaran ditutup" membuat
                    tamu mengira dirinya terlambat karena salahnya sendiri. */}
                {event.registration_enabled ? (
                  <Link
                    href={daftarUrl}
                    className="m3-state inline-flex min-h-14 items-center gap-2 rounded-full bg-[var(--reg-primary)] px-8 text-title-medium font-semibold text-[var(--reg-on-primary)] shadow-[var(--md-sys-elevation-level1)]"
                    style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
                  >
                    {ctaLabel}
                    <ArrowRight size={20} weight="bold" />
                  </Link>
                ) : (
                  <span
                    className={`inline-flex min-h-14 items-center rounded-full border px-8 text-title-medium font-semibold ${
                      fotoAsli ? "border-white/60" : "border-[var(--reg-outline)]"
                    }`}
                  >
                    Pendaftaran belum dibuka
                  </span>
                )}
              </div>
            </div>

            {adaDetail ? (
              // Kartu fakta mengisi sisi kanan hero — sisi yang sebelumnya
              // kosong di layar lebar. Isinya bukan hiasan: tanggal, jam, dan
              // lokasi adalah tiga hal yang dicari tamu sebelum memutuskan
              // datang, dan sebelumnya ketiganya tersebar di tiga tempat.
              <aside className="lg:col-span-5 xl:col-span-4 xl:col-start-9">
                <div className="rounded-[28px] border border-[var(--reg-outline-variant)] bg-[var(--reg-panel)] p-6 shadow-[var(--md-sys-elevation-level1)] sm:p-7">
                  <div className="divide-y divide-[var(--reg-outline-variant)]">
                    {tanggal ? (
                      <DetailRow icon={<CalendarBlank size={22} weight="fill" />} label="Tanggal">
                        {tanggal}
                      </DetailRow>
                    ) : null}
                    {waktu ? (
                      <DetailRow icon={<Clock size={22} weight="fill" />} label="Waktu">
                        {waktu}
                      </DetailRow>
                    ) : null}
                    {event.venue_name || event.venue_address ? (
                      <DetailRow icon={<MapPin size={22} weight="fill" />} label="Lokasi">
                        {event.venue_name ? <p className="font-semibold">{event.venue_name}</p> : null}
                        {event.venue_address ? (
                          <p className={`mt-1 whitespace-pre-line text-body-medium leading-6 ${MUTED}`}>
                            {event.venue_address}
                          </p>
                        ) : null}
                      </DetailRow>
                    ) : null}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {event.event_date ? (
                      <a
                        // Slug ditulis sebagai query, BUKAN sebagai segmen path.
                        //
                        // `/e/<slug>/kalender.ics` akan di-rewrite proxy, dan parameter
                        // yang DITAMBAHKAN saat rewrite tidak pernah sampai ke route
                        // handler — berkasnya lalu jatuh ke "event aktif tunggal" dan
                        // tamu mengunduh jadwal acara yang sama sekali lain. Terukur:
                        // sebelum perbaikan ini, halaman Prima menghasilkan berkas
                        // berisi Marugame. Proxy melewatkan permintaan yang sudah
                        // membawa `eventSlug` sendiri.
                        href={`/kalender.ics?eventSlug=${encodeURIComponent(event.slug)}`}
                        className="m3-state inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--reg-outline)] px-5 text-label-large font-semibold"
                      >
                        <CalendarPlus size={18} />
                        Tambah ke kalender
                      </a>
                    ) : null}
                    {event.venue_map_url ? (
                      <a
                        href={event.venue_map_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="m3-state inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--reg-outline)] px-5 text-label-large font-semibold"
                      >
                        <MapPin size={18} />
                        Buka peta
                      </a>
                    ) : null}
                  </div>
                </div>
              </aside>
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
                  {/* whitespace-pre-line: deskripsi diketik admin di textarea, dan
                      paragrafnya dipisah dengan enter. Tanpa ini seluruhnya
                      menyatu jadi satu blok tanpa jeda. */}
                  <p className={`${PROSE} whitespace-pre-line text-body-large leading-8 ${MUTED}`}>
                    {event.description}
                  </p>
                </SectionShell>
              );

            case "highlights":
              return (
                <SectionShell key="highlights" id="highlights" title={LANDING_SECTION_LABELS.highlights}>
                  <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {(config.highlights ?? []).map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[28px] border border-[var(--reg-outline-variant)] bg-[var(--reg-field)] p-6"
                      >
                        <dt className={`text-label-large uppercase tracking-[0.14em] ${MUTED}`}>{item.label}</dt>
                        <dd className="mt-3 text-headline-medium font-semibold tabular-nums text-[var(--reg-primary)]">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </SectionShell>
              );

            case "agenda":
              return (
                <SectionShell key="agenda" id="agenda" title={LANDING_SECTION_LABELS.agenda}>
                  <div className="space-y-10">
                    {agenda.map((blok, index) => (
                      <div key={blok.sectionTitle ?? index}>
                        {blok.sectionTitle ? (
                          <h3 className="text-title-large font-semibold">{blok.sectionTitle}</h3>
                        ) : null}
                        <ol className="mt-4 divide-y divide-[var(--reg-outline-variant)]">
                          {blok.items.map((item) => (
                            <li key={`${item.time}-${item.title}`} className="flex gap-5 py-4 sm:gap-8">
                              <span className="w-16 shrink-0 text-body-large font-semibold tabular-nums text-[var(--reg-primary)]">
                                {item.time}
                              </span>
                              <span className="text-body-large">{item.title}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                  <Link
                    href={`/e/${event.slug}/rundown`}
                    className="m3-state mt-8 inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--reg-outline)] px-6 text-label-large font-semibold"
                  >
                    Lihat susunan acara lengkap
                    <ArrowRight size={18} weight="bold" />
                  </Link>
                </SectionShell>
              );

            case "venue":
              return (
                <SectionShell key="venue" id="venue" title={LANDING_SECTION_LABELS.venue}>
                  <div className="rounded-[28px] border border-[var(--reg-outline-variant)] bg-[var(--reg-field)] p-6 sm:p-8">
                    {event.venue_name ? <p className="text-title-large font-semibold">{event.venue_name}</p> : null}
                    {event.venue_address ? (
                      <p className={`mt-3 max-w-[46ch] whitespace-pre-line text-body-large leading-7 ${MUTED}`}>
                        {event.venue_address}
                      </p>
                    ) : null}
                    <div className="mt-6 flex flex-wrap gap-3">
                      {/* Peta dibuka sebagai TAUTAN, tidak disematkan sebagai
                          iframe. Penyemat peta memuat skrip pihak ketiga ke
                          halaman yang dibuka tamu, dan itu harga yang tidak
                          sebanding untuk sebuah kotak yang tetap harus diketuk
                          untuk berguna. */}
                      {event.venue_map_url ? (
                        <a
                          href={event.venue_map_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="m3-state inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--reg-primary)] px-6 text-label-large font-semibold text-[var(--reg-on-primary)]"
                          style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
                        >
                          <MapPin size={18} weight="fill" />
                          Buka peta
                        </a>
                      ) : null}
                      <Link
                        href={`/e/${event.slug}/denah`}
                        className="m3-state inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--reg-outline)] px-6 text-label-large font-semibold"
                      >
                        Denah tempat duduk
                      </Link>
                    </div>
                  </div>
                </SectionShell>
              );

            case "faq":
              return (
                <SectionShell key="faq" id="faq" title={LANDING_SECTION_LABELS.faq}>
                  {/* <details>, bukan akordeon buatan sendiri. Ia sudah bisa
                      dibuka dengan papan ketik, sudah diumumkan pembaca layar
                      sebagai dapat dilipat, dan tetap bekerja bila JavaScript
                      gagal dimuat di jaringan tamu. */}
                  <div className="divide-y divide-[var(--reg-outline-variant)]">
                    {(config.faq ?? []).map((item) => (
                      <details key={item.q} className="group py-5">
                        <summary className="m3-state -mx-4 flex cursor-pointer list-none items-start justify-between gap-4 rounded-2xl px-4 py-2 text-title-medium font-semibold">
                          {item.q}
                          <CaretDown size={20} className="mt-1 shrink-0 transition-transform group-open:rotate-180" />
                        </summary>
                        <p className={`mt-4 ${PROSE} whitespace-pre-line text-body-large leading-7 ${MUTED}`}>
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
                  {/* Grid rata, bukan tingkatan sponsor berukuran berbeda.
                      Ukuran logo yang berbeda-beda adalah janji tentang nilai
                      kontrak, dan itu keputusan komersial yang tidak boleh
                      diambil oleh urutan unggah. */}
                  <ul className="grid grid-cols-2 items-center gap-4 sm:grid-cols-3 xl:grid-cols-4">
                    {(config.sponsors ?? []).map((sponsor) => (
                      <li
                        key={sponsor.logo_url}
                        className="flex h-24 items-center justify-center rounded-2xl border border-[var(--reg-outline-variant)] bg-[var(--reg-field)] p-5"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={sponsor.logo_url}
                          alt={sponsor.name ?? ""}
                          className="max-h-full max-w-full object-contain"
                        />
                      </li>
                    ))}
                  </ul>
                </SectionShell>
              );

            case "contact":
              return (
                <SectionShell key="contact" id="contact" title={LANDING_SECTION_LABELS.contact}>
                  <div className="rounded-[28px] border border-[var(--reg-outline-variant)] bg-[var(--reg-field)] p-6 sm:p-8">
                    {config.contact_name ? <p className="text-title-large font-semibold">{config.contact_name}</p> : null}
                    <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                      {config.contact_phone ? (
                        <a href={`tel:${config.contact_phone}`} className="inline-flex items-center gap-2 text-body-large font-semibold text-[var(--reg-primary)]">
                          <Phone size={18} weight="fill" />
                          {config.contact_phone}
                        </a>
                      ) : null}
                      {config.contact_email ? (
                        <a href={`mailto:${config.contact_email}`} className="inline-flex items-center gap-2 text-body-large font-semibold text-[var(--reg-primary)]">
                          <Envelope size={18} weight="fill" />
                          {config.contact_email}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </SectionShell>
              );

            default:
              return null;
          }
        })}

        {/* ---- Penutup ---------------------------------------------------- */}
        {event.registration_enabled ? (
          // Pita tonal, bukan blok rata tengah di atas latar halaman. Rata
          // tengah tetap benar di sini — ini akhir halaman dan hanya ada satu
          // hal yang bisa dilakukan — tetapi tanpa bidang di belakangnya ia
          // terbaca sebagai teks yang tersesat di ruang kosong.
          <section className="my-14 rounded-[32px] bg-[var(--reg-panel)] px-6 py-14 text-center sm:my-20 sm:px-10 sm:py-16">
            <ChatCircleText size={40} weight="duotone" className="mx-auto text-[var(--reg-primary)]" />
            <h2 className="mt-5 text-headline-medium font-semibold tracking-tight">Sampai jumpa di acara</h2>
            {schedule ? <p className={`mt-3 text-body-large ${MUTED}`}>{schedule}</p> : null}
            <Link
              href={daftarUrl}
              className="m3-state mt-8 inline-flex min-h-14 items-center gap-2 rounded-full bg-[var(--reg-primary)] px-8 text-title-medium font-semibold text-[var(--reg-on-primary)] shadow-[var(--md-sys-elevation-level1)]"
              style={{ "--m3-state-color": "var(--reg-on-primary)" } as CSSProperties}
            >
              {ctaLabel}
              <ArrowRight size={20} weight="bold" />
            </Link>
          </section>
        ) : null}

        <footer
          className={`flex flex-wrap items-center justify-between gap-3 border-t border-[var(--reg-outline-variant)] py-10 text-body-small ${MUTED}`}
        >
          <span>{event.name}</span>
          {schedule ? <span>{schedule}</span> : null}
        </footer>
      </div>
    </main>
  );
}
