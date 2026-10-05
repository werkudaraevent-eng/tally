import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowSquareOut,
  CalendarPlus,
  CheckCircle,
  EnvelopeSimple,
  Hourglass,
  PushPin,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { EventRow, LandingMemberConfig } from "@/lib/domain";
import { LANDING_NAV_DEFAULTS, isLandingBlockId, normalizeLandingSections, publicEventName } from "@/lib/domain";
import { formatEventDate, formatEventSchedule, formatEventTime } from "@/lib/event-datetime";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { LANDING_UI, landingDefaultLang, landingEnAvailable, landingPath, resolveLanding, type LandingLang } from "@/lib/landing-i18n";
import { PESERTA_UI } from "@/lib/member/peserta-i18n";
import type { MemberSession } from "@/lib/member/account";
import { muatNavPeserta, waktuPengumuman } from "@/lib/member/nav";
import { isUnread, type MemberAnnouncements } from "@/lib/member/pengumuman";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import { KirimUlangKonfirmasi } from "@/components/member/kirim-ulang-konfirmasi";
import { AgendaPills } from "@/components/landing/modern/agenda-pills";
import { LandingNavModern } from "@/components/landing/modern/landing-nav-modern";
import { KakiModern, KV_SCRIM_RATA, PitaMitra, bagianModern, gayaModern, tinta } from "@/components/landing/modern/kerangka";
import { HEAD, LABEL_BAGIAN, MUTED, PIL, SHELL } from "@/components/landing/modern/styles";
import { KartuBarang, KartuBerikutnya, KartuBus, KartuKamar } from "@/components/member/kartu-logistik";
import { agendaBerikutnya, loadMemberLogistics } from "@/lib/logistik/peserta";
import { loadLandingLodging } from "@/lib/landing-hotel";

/**
 * Dashboard saya (`/e/<slug>/peserta`), tata letak Modern.
 *
 * Bagian dari halaman acara, bukan situs terpisah: bilah atas, warna, huruf,
 * pita penyelenggara, dan kaki navy sama persis (modern/kerangka.tsx), dan menu
 * atas kembali ke bagian halaman acara. Rujukannya Luma (pesan panitia tampil
 * di halaman acara bagi tamu yang login) dan pusat pengumuman Whova/Swapcard.
 *
 * Susunan, layar lebar: pita KV pendek (bukan hero penuh, supaya tiket masuk
 * layar pertama laptop 1280x588), lalu kiri 7 kolom Pengumuman dan Susunan
 * acara, kanan 5 kolom Tiket dan tautan cepat yang menempel saat digulir.
 * Ponsel: tiket, tautan cepat, pengumuman, susunan acara. Tiket paling atas
 * karena itu yang dicari di meja registrasi; Voting sebelum rundown karena itu
 * yang dibuka saat sesi berjalan.
 *
 * Dwibahasa seperti halaman acara: `/e/<slug>/en/peserta` memakai isian English
 * acara (dengan cadangan Indonesia, resolveLanding) dan teks PESERTA_UI.en.
 * "ID | EN" di bilah atas berpindah antara kedua versi dashboard ini.
 * Logistik gathering (kartu kamar, bus, barang) masih berbahasa Indonesia.
 */

const ALIS = `${LABEL_BAGIAN} text-[var(--reg-primary)]`;
/** Judul bagian dashboard 32px: satu langkah di bawah sapaan 40/48, bukan 48 seperti halaman acara. */
const JUDUL_DASBOR = `${HEAD} text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[32px]`;
const KARTU = "rounded-lg bg-[var(--reg-panel)] p-6";
const PIL_GARIS_TIPIS = `${PIL} justify-center border border-[var(--reg-outline)] bg-[var(--reg-surface)] font-semibold`;
const PIL_INK_GARIS = `${PIL} min-h-11 border border-[color-mix(in_srgb,var(--ink)_60%,transparent)] px-4 text-label-large font-semibold text-[var(--ink)]`;

export async function DashboardModern({
  event: asli,
  lang = "id",
  member,
  sesi,
  pengumuman,
  konfirmasi,
}: {
  event: EventRow;
  lang?: LandingLang;
  member: LandingMemberConfig;
  sesi: MemberSession;
  /** Dimuat halaman sebelum menandai terbaca, jadi titik "baru" masih benar. */
  pengumuman: MemberAnnouncements;
  konfirmasi: "ok" | "gagal" | null;
}) {
  const t = LANDING_UI[lang];
  const p = PESERTA_UI[lang];
  // Isian English acara (venue, label menu, judul blok) dengan cadangan Indonesia.
  const { event, config } = resolveLanding(asli, lang);
  const utama = landingDefaultLang(config);
  const halamanAcara = landingPath(event.slug, lang, utama);
  const lainnya: LandingLang = lang === "en" ? "id" : "en";
  const sections = normalizeLandingSections(config.sections, config.blocks);
  const agenda = await loadAgendaPreview(event.id, lang);
  // Gaya gathering: menu dan susunan acara sama dengan halaman acaranya.
  const gaya = config.gathering === true;
  const adaHotel = gaya ? (await loadLandingLodging(event.id)).hotels.length > 0 : false;
  const { aktif, blokById, tampil, speakers, navSections, mitra: sponsor, kontak } = bagianModern(event, config, sections, agenda, lang, { gathering: gaya, adaHotel });
  // Pita mitra seperti di kaki halaman acara. Banyak acara (ILO salah satunya)
  // memasang logo lewat blok Logo, bukan daftar Sponsor; tanpa sponsor, pakai
  // blok Logo pertama yang tampil supaya kaki dashboard sama dengan halaman acara.
  const blokLogo = sponsor.length
    ? null
    : sections
        .map((section) => (isLandingBlockId(section.id) ? blokById.get(section.id) : undefined))
        .find((block) => block?.type === "logos" && aktif.has(block.id) && block.items?.some((item) => item.image_url));
  const mitra = blokLogo
    ? (blokLogo.items ?? []).filter((item) => item.image_url).map((item) => ({ logo_url: item.image_url, name: item.label }))
    : sponsor;
  const judulMitra = blokLogo?.heading?.trim() || t.organisedBy;
  // Lonceng di halaman ini tanpa angka: semua pengumumannya sedang ditampilkan
  // di bawah, dan membuka halaman ini menandainya terbaca.
  const nav = await muatNavPeserta(event, sesi, lang, { data: pengumuman, unread: 0 });

  const peserta = sesi.participant;
  // Logistik gathering (kamar, bus, barang). null di acara tanpa logistik:
  // ILO dan acara lain tampil persis seperti sebelumnya.
  const logistik = peserta ? await loadMemberLogistics(event.id, peserta.id, member.show_logistics === true) : null;
  const sekarang = new Date();
  const berikutnya = logistik ? agendaBerikutnya(logistik, sekarang) : null;
  const nama = publicEventName(event);
  const namaDepan = sesi.name.trim().split(/\s+/)[0] || sesi.name;
  const tanggal = formatEventDate(event, lang);
  const jam = formatEventTime(event, lang);
  const venue = event.venue_name?.trim() || null;
  const kv = config.banner_url ?? null;
  const tampilKode = Boolean(peserta) && member.show_code !== false;
  const tampilKursi = Boolean(peserta) && member.show_seat !== false;
  const tampilSusunan = member.show_schedule !== false && agenda.length > 0;
  const tampilVote = Boolean(peserta) && member.show_vote !== false;
  const kursi = (peserta?.seats ?? []).filter((seat) => seat.label?.trim());
  const kalenderUrl = event.event_date ? `/kalender.ics?eventSlug=${encodeURIComponent(event.slug)}` : null;
  const petaUrl =
    event.venue_map_url ||
    (venue || event.venue_address?.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue, event.venue_address?.trim()].filter(Boolean).join(", "))}`
      : null);
  const tahun = (event.event_date ?? new Date().toISOString()).slice(0, 4);

  const status =
    sesi.status === "approved"
      ? { label: p.status.approved, warna: "#4ade80" }
      : sesi.status === "rejected"
        ? { label: p.status.rejected, warna: "#f87171" }
        : { label: p.status.pending, warna: "#fbbf24" };

  const tautanCepat: { href: string; judul: string; isi: string; luar?: boolean }[] = [
    ...(tampilVote ? [{ href: `/e/${event.slug}/vote`, ...p.vote }] : []),
    ...(member.feedback_url ? [{ href: member.feedback_url, ...p.feedback, luar: true }] : []),
    ...(petaUrl ? [{ href: petaUrl, judul: p.map.judul, isi: venue ?? p.map.isiCadangan, luar: true }] : []),
    ...(tampilKursi ? [{ href: `/e/${event.slug}/denah`, ...p.seatingPlan }] : []),
  ];

  return (
    <main className="min-h-dvh bg-[var(--reg-surface)] text-[var(--reg-on-surface)]" style={gayaModern(config)}>
      <LandingNavModern
        eventName={nama}
        daftarUrl={`${halamanAcara}/daftar`}
        registrationOpen={false}
        sections={navSections}
        sectionBase={halamanAcara}
        homeHref={halamanAcara}
        width={config.nav?.width ?? "full"}
        logoUrl={config.nav?.logo_url ?? null}
        logoOnDark={Boolean(kv) && (config.nav?.opacity ?? LANDING_NAV_DEFAULTS.opacity) < 50}
        lang={lang}
        langSwitch={landingEnAvailable(config) ? { href: `${landingPath(event.slug, lainnya, utama)}/peserta`, lang: lainnya } : null}
        peserta={nav}
        dashboardAktif
      />

      {/* ---- Pita sapaan --------------------------------------------------
          KV acara yang sama dengan hero, dipotong pendek (~150px di bawah
          bilah). Tetap `data-landing-hero` dan ditarik ke bawah bilah, supaya
          bilah tembus pandang berperilaku sama seperti di halaman acara. */}
      <header
        data-landing-hero
        className={`relative isolate -mt-[var(--nav-h)] overflow-hidden ${kv ? "bg-black" : "bg-[var(--reg-brand)]"}`}
        style={tinta(Boolean(kv))}
      >
        {kv ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={kv} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10" style={{ background: KV_SCRIM_RATA }} />
          </>
        ) : null}
        <div className={`${SHELL} flex items-end justify-between gap-6 pb-6 pt-[calc(var(--nav-h)+24px)] text-[var(--ink)]`}>
          <div className="min-w-0">
            <p className={`${LABEL_BAGIAN} opacity-85`}>{p.dashboardEyebrow}</p>
            <h1 className={`${HEAD} mt-1.5 text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[40px]`}>
              {p.hello(namaDepan)}
            </h1>
            <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-body-large font-medium">
              {[tanggal, jam, venue].filter(Boolean).map((teks) => (
                <li key={teks} className="tabular-nums opacity-90">
                  {teks}
                </li>
              ))}
              <li>
                <span className="inline-flex min-h-7 items-center gap-2 rounded-[8px] bg-white/15 px-2.5 text-label-large font-semibold backdrop-blur-sm">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: status.warna }} />
                  {status.label}
                </span>
              </li>
            </ul>
          </div>
          <form method="post" action={nav.keluarAction} className="hidden shrink-0 sm:block">
            <button type="submit" className={PIL_INK_GARIS}>
              {t.signOut}
            </button>
          </form>
        </div>
      </header>

      <div className={SHELL}>
        {konfirmasi === "ok" ? (
          <p role="status" className="mt-6 flex max-w-[720px] items-start gap-3 rounded-md bg-[var(--reg-primary-container)] px-4 py-3 text-body-large text-[var(--reg-on-primary-container)]">
            <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            {p.emailConfirmed}
          </p>
        ) : !sesi.emailVerified && sesi.status !== "rejected" ? (
          <p className="mt-6 flex max-w-[720px] items-start gap-3 rounded-md border border-[var(--reg-outline-variant)] px-4 py-3 text-body-large">
            <EnvelopeSimple size={22} className="mt-0.5 shrink-0 text-[var(--reg-primary)]" aria-hidden />
            <span>
              {konfirmasi === "gagal" ? p.confirmLinkUsed : null}
              {p.confirmEmail(sesi.email)}
              <KirimUlangKonfirmasi slug={event.slug} lang={lang} />
            </span>
          </p>
        ) : null}

        <div className="grid gap-10 pb-16 pt-8 lg:grid-cols-12 lg:gap-6 lg:pb-24">
          {/* Kanan di layar lebar, PERTAMA di ponsel: tiket lalu tautan cepat. */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--nav-h)+24px)] lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:self-start">
            {berikutnya ? <KartuBerikutnya agenda={berikutnya} zona={event.time_zone} now={sekarang} className="lg:hidden" /> : null}
            {!peserta ? (
              <section aria-labelledby="status-judul" className={KARTU}>
                {sesi.status === "rejected" ? (
                  <XCircle size={36} className={MUTED} aria-hidden />
                ) : (
                  <Hourglass size={36} className={MUTED} aria-hidden />
                )}
                <h2 id="status-judul" className={`${HEAD} mt-3 text-[24px] font-semibold leading-tight`}>
                  {sesi.status === "rejected" ? p.rejectedTitle : p.pendingTitle}
                </h2>
                <p className={`mt-2 text-body-large leading-7 ${MUTED}`}>
                  {sesi.status === "rejected" ? p.rejectedBody : p.pendingBody}
                </p>
              </section>
            ) : tampilKode || tampilKursi ? (
              <section aria-labelledby="tiket-judul" className={KARTU}>
                <p className={`${LABEL_BAGIAN} ${MUTED}`}>{p.ticketEyebrow}</p>
                <h2 id="tiket-judul" className={`${HEAD} mt-1.5 text-[22px] font-semibold leading-tight sm:text-[24px]`}>
                  {tampilKode ? p.showAtDesk : p.yourSeat}
                </h2>
                {tampilKode ? (
                  <div className="mt-5">
                    <RegistrationCodeCard
                      code={peserta.qr_code}
                      eventName={nama}
                      personName={peserta.name}
                      schedule={formatEventSchedule(event, lang)}
                      lang={lang}
                      layout="samping"
                    >
                      {kalenderUrl ? (
                        <a href={kalenderUrl} className={`${PIL_GARIS_TIPIS} whitespace-nowrap px-4!`}>
                          <CalendarPlus size={18} aria-hidden />
                          {t.addToCalendar}
                        </a>
                      ) : null}
                    </RegistrationCodeCard>
                  </div>
                ) : null}
                {tampilKursi ? (
                  <div className={tampilKode ? "mt-6 border-t border-[var(--reg-outline-variant)] pt-5" : "mt-4"}>
                    {kursi.length > 0 ? (
                      <dl className={`grid gap-4 ${kursi.length > 1 ? "sm:grid-cols-2" : ""}`}>
                        {kursi.map((seat, index) => (
                          <div key={`${seat.subEventId ?? index}-${seat.label}`}>
                            <dt className={`text-body-medium ${MUTED}`}>{seat.subEventName?.trim() || p.seat}</dt>
                            <dd className="mt-0.5 text-[20px] font-semibold leading-7 tabular-nums">{seat.label}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className={`text-body-large ${MUTED}`}>{p.seatPending}</p>
                    )}
                    <Link
                      href={`/e/${event.slug}/denah`}
                      className="m3-state -mx-2 mt-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-title-small font-semibold text-[var(--reg-primary)]"
                    >
                      {p.viewSeatingPlan}
                      <ArrowRight size={18} weight="bold" />
                    </Link>
                  </div>
                ) : null}
              </section>
            ) : null}

            {logistik ? (
              <>
                <KartuKamar logistik={logistik} zona={event.time_zone} />
                <KartuBus logistik={logistik} zona={event.time_zone} />
                <KartuBarang logistik={logistik} />
              </>
            ) : null}

            {tautanCepat.length > 0 ? (
              <ul aria-label={p.quickLinksAria} className="grid grid-cols-2 gap-3">
                {tautanCepat.map((item) => (
                  <li key={item.judul}>
                    <TautanKartu {...item} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-12 lg:col-span-7 lg:col-start-1 lg:row-start-1">
            {/* Di ponsel kartu ini tampil paling atas kolom kanan (sebelum tiket). */}
            {berikutnya ? <KartuBerikutnya agenda={berikutnya} zona={event.time_zone} now={sekarang} className="hidden lg:block" /> : null}
            {pengumuman.ready ? (
              <section aria-labelledby="pengumuman-judul">
                <p className={ALIS}>{p.fromOrganisers}</p>
                <h2 id="pengumuman-judul" className={`${JUDUL_DASBOR} mt-1.5`}>
                  {t.announcements}
                </h2>
                {pengumuman.items.length === 0 ? (
                  <p className={`mt-5 rounded-lg border border-[var(--reg-outline-variant)] px-6 py-5 text-body-large ${MUTED}`}>
                    {p.noAnnouncements}
                  </p>
                ) : (
                  <ul className="mt-5 overflow-hidden rounded-lg border border-[var(--reg-outline-variant)]">
                    {pengumuman.items.map((item, index) => {
                      const baru = isUnread(item, pengumuman.seenAt);
                      return (
                        <li
                          key={item.id}
                          className={`grid grid-cols-[8px_minmax(0,1fr)] gap-3 px-5 py-4 sm:gap-4 sm:px-6 sm:py-5 ${
                            index > 0 ? "border-t border-[var(--reg-outline-variant)]" : ""
                          }`}
                        >
                          <span aria-hidden className={`mt-2 size-2 rounded-full ${baru ? "bg-[#b41340]" : ""}`} />
                          <div className="min-w-0">
                            {item.pinned ? (
                              <p className="mb-1 inline-flex items-center gap-1 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-[var(--reg-primary)]">
                                <PushPin size={13} weight="fill" aria-hidden />
                                {t.pinned}
                              </p>
                            ) : null}
                            <h3 className="text-[17px] font-semibold leading-6">
                              {baru ? <span className="sr-only">{p.newPrefix}</span> : null}
                              {item.title}
                            </h3>
                            {item.body ? <p className={`mt-1 whitespace-pre-line text-isi ${MUTED}`}>{item.body}</p> : null}
                            {item.link_url ? (
                              <a
                                href={item.link_url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="mt-1 inline-flex min-h-10 items-center gap-1.5 text-title-small font-semibold text-[var(--reg-primary)] underline-offset-4 hover:underline"
                              >
                                {item.link_label?.trim() || item.link_url}
                                <ArrowSquareOut size={16} aria-hidden />
                              </a>
                            ) : null}
                            <p className="mt-1.5 text-body-small text-[#535862]">{waktuPengumuman(item.published_at, event.time_zone, lang)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}

            {tampilSusunan ? (
              <section aria-labelledby="susunan-judul">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <div>
                    <p className={ALIS}>{p.agendaEyebrow}</p>
                    <h2 id="susunan-judul" className={`${JUDUL_DASBOR} mt-1.5`}>
                      {tanggal ?? p.agendaEyebrow}
                    </h2>
                  </div>
                  <Link href={`/e/${event.slug}/rundown`} className="inline-flex min-h-11 items-center text-title-small font-semibold text-[var(--reg-primary)]">
                    {p.fullScreen}
                  </Link>
                </div>
                <div className="mt-5">
                  <AgendaPills agenda={agenda} speakers={tampil("speakers") ? speakers : []} lang={lang} perHari={gaya} />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      <PitaMitra mitra={mitra} judul={judulMitra} />
      <KakiModern
        nama={nama}
        keterangan={{ catatan: config.footer_note?.trim() || null, baris: [tanggal, venue].filter((baris): baris is string => Boolean(baris)) }}
        tombol={{ href: halamanAcara, label: p.backToEventPage }}
        kolom={[
          { judul: t.footerEvent, tautan: navSections.map((item) => ({ label: item.label, href: `${halamanAcara}#${item.id}` })) },
          { judul: t.footerContact, tautan: kontak },
        ]}
        tahun={tahun}
        poweredBy={t.poweredBy}
        pil={`${PIL} bg-[var(--ink)] font-semibold text-[var(--ink-accent)]`}
      />
    </main>
  );
}

function TautanKartu({ href, judul, isi, luar = false }: { href: string; judul: string; isi: string; luar?: boolean }) {
  const kelas = "m3-state flex h-full min-h-[88px] flex-col gap-1 rounded-lg border border-[var(--reg-outline-variant)] bg-[var(--reg-surface)] p-4";
  const badan: ReactNode = (
    <>
      <span className="flex items-start justify-between gap-2 text-title-small font-semibold">
        {judul}
        {luar ? (
          <ArrowSquareOut size={16} className="mt-0.5 shrink-0 text-[var(--reg-primary)]" aria-hidden />
        ) : (
          <ArrowRight size={16} weight="bold" className="mt-0.5 shrink-0 text-[var(--reg-primary)]" aria-hidden />
        )}
      </span>
      <span className={`text-body-medium leading-5 ${MUTED}`}>{isi}</span>
    </>
  );
  return luar ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className={kelas} style={{ "--m3-state-color": "var(--reg-on-surface)" } as CSSProperties}>
      {badan}
    </a>
  ) : (
    <Link href={href} className={kelas}>
      {badan}
    </Link>
  );
}
