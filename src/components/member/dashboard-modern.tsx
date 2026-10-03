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
import type { EventLandingConfig, EventRow, LandingMemberConfig } from "@/lib/domain";
import { LANDING_NAV_DEFAULTS, normalizeLandingSections, publicEventName } from "@/lib/domain";
import { formatEventDate, formatEventSchedule, formatEventTime } from "@/lib/event-datetime";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { LANDING_UI, landingDefaultLang, landingEnAvailable, landingPath } from "@/lib/landing-i18n";
import type { MemberSession } from "@/lib/member/account";
import { muatNavPeserta, waktuPengumuman } from "@/lib/member/nav";
import { isUnread, type MemberAnnouncements } from "@/lib/member/pengumuman";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import { KirimUlangKonfirmasi } from "@/components/member/kirim-ulang-konfirmasi";
import { AgendaPills } from "@/components/landing/modern/agenda-pills";
import { LandingNavModern } from "@/components/landing/modern/landing-nav-modern";
import { KakiModern, KV_SCRIM_RATA, PitaMitra, bagianModern, gayaModern, tinta } from "@/components/landing/modern/kerangka";
import { HEAD, LABEL_BAGIAN, MUTED, PIL, SHELL } from "@/components/landing/modern/styles";

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
 * Area peserta belum dwibahasa (dicatat di memori proyek): halaman ini
 * berbahasa Indonesia, dan "EN" di bilah atas membuka halaman acara English.
 */

const ALIS = `${LABEL_BAGIAN} text-[var(--reg-primary)]`;
/** Judul bagian dashboard 32px: satu langkah di bawah sapaan 40/48, bukan 48 seperti halaman acara. */
const JUDUL_DASBOR = `${HEAD} text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[32px]`;
const KARTU = "rounded-lg bg-[var(--reg-panel)] p-6";
const PIL_GARIS_TIPIS = `${PIL} justify-center border border-[var(--reg-outline)] bg-[var(--reg-surface)] font-semibold`;
const PIL_INK_GARIS = `${PIL} min-h-11 border border-[color-mix(in_srgb,var(--ink)_60%,transparent)] px-4 text-label-large font-semibold text-[var(--ink)]`;

export async function DashboardModern({
  event,
  member,
  sesi,
  pengumuman,
  konfirmasi,
}: {
  event: EventRow;
  member: LandingMemberConfig;
  sesi: MemberSession;
  /** Dimuat halaman sebelum menandai terbaca, jadi titik "baru" masih benar. */
  pengumuman: MemberAnnouncements;
  konfirmasi: "ok" | "gagal" | null;
}) {
  const t = LANDING_UI.id;
  const config = (event.landing_config ?? {}) as EventLandingConfig;
  const utama = landingDefaultLang(config);
  const halamanAcara = landingPath(event.slug, "id", utama);
  const sections = normalizeLandingSections(config.sections, config.blocks);
  const agenda = await loadAgendaPreview(event.id, "id");
  const { tampil, speakers, navSections, mitra, kontak } = bagianModern(event, config, sections, agenda, "id");
  // Lonceng di halaman ini tanpa angka: semua pengumumannya sedang ditampilkan
  // di bawah, dan membuka halaman ini menandainya terbaca.
  const nav = await muatNavPeserta(event, sesi, "id", { data: pengumuman, unread: 0 });

  const peserta = sesi.participant;
  const nama = publicEventName(event);
  const namaDepan = sesi.name.trim().split(/\s+/)[0] || sesi.name;
  const tanggal = formatEventDate(event, "id");
  const jam = formatEventTime(event, "id");
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
      ? { label: "Terdaftar", warna: "#4ade80" }
      : sesi.status === "rejected"
        ? { label: "Tidak disetujui", warna: "#f87171" }
        : { label: "Menunggu persetujuan", warna: "#fbbf24" };

  const tautanCepat: { href: string; judul: string; isi: string; luar?: boolean }[] = [
    ...(tampilVote ? [{ href: `/e/${event.slug}/vote`, judul: "Voting langsung", isi: "Terbuka saat sesi berlangsung. Kode Anda sudah terisi." }] : []),
    ...(member.feedback_url ? [{ href: member.feedback_url, judul: "Umpan balik", isi: "Dibuka di tab baru.", luar: true }] : []),
    ...(petaUrl ? [{ href: petaUrl, judul: "Lokasi & peta", isi: venue ?? "Buka peta lokasi acara.", luar: true }] : []),
    ...(tampilKursi ? [{ href: `/e/${event.slug}/denah`, judul: "Denah kursi", isi: "Cari meja dan kursi Anda." }] : []),
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
        lang="id"
        langSwitch={landingEnAvailable(config) ? { href: landingPath(event.slug, "en", utama), lang: "en" } : null}
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
            <p className={`${LABEL_BAGIAN} opacity-85`}>Dashboard peserta</p>
            <h1 className={`${HEAD} mt-1.5 text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[40px]`}>
              Halo, {namaDepan}
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
              Keluar
            </button>
          </form>
        </div>
      </header>

      <div className={SHELL}>
        {konfirmasi === "ok" ? (
          <p role="status" className="mt-6 flex max-w-[720px] items-start gap-3 rounded-md bg-[var(--reg-primary-container)] px-4 py-3 text-body-large text-[var(--reg-on-primary-container)]">
            <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            Email Anda terkonfirmasi.
          </p>
        ) : !sesi.emailVerified && sesi.status !== "rejected" ? (
          <p className="mt-6 flex max-w-[720px] items-start gap-3 rounded-md border border-[var(--reg-outline-variant)] px-4 py-3 text-body-large">
            <EnvelopeSimple size={22} className="mt-0.5 shrink-0 text-[var(--reg-primary)]" aria-hidden />
            <span>
              {konfirmasi === "gagal" ? "Tautan konfirmasi itu sudah dipakai atau kedaluwarsa. " : null}
              Konfirmasi email {sesi.email} lewat tautan yang kami kirim, supaya akun ini bisa dipulihkan bila Anda lupa kata sandi.
              <KirimUlangKonfirmasi slug={event.slug} />
            </span>
          </p>
        ) : null}

        <div className="grid gap-10 pb-16 pt-8 lg:grid-cols-12 lg:gap-6 lg:pb-24">
          {/* Kanan di layar lebar, PERTAMA di ponsel: tiket lalu tautan cepat. */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--nav-h)+24px)] lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:self-start">
            {!peserta ? (
              <section aria-labelledby="status-judul" className={KARTU}>
                {sesi.status === "rejected" ? (
                  <XCircle size={36} className={MUTED} aria-hidden />
                ) : (
                  <Hourglass size={36} className={MUTED} aria-hidden />
                )}
                <h2 id="status-judul" className={`${HEAD} mt-3 text-[24px] font-semibold leading-tight`}>
                  {sesi.status === "rejected" ? "Pendaftaran tidak disetujui" : "Menunggu persetujuan panitia"}
                </h2>
                <p className={`mt-2 text-body-large leading-7 ${MUTED}`}>
                  {sesi.status === "rejected"
                    ? "Panitia tidak menyetujui pendaftaran Anda untuk acara ini. Hubungi panitia bila Anda merasa ini keliru."
                    : "Kode QR untuk meja registrasi muncul di sini setelah panitia menyetujui pendaftaran Anda. Kami juga mengabari Anda lewat email."}
                </p>
              </section>
            ) : tampilKode || tampilKursi ? (
              <section aria-labelledby="tiket-judul" className={KARTU}>
                <p className={`${LABEL_BAGIAN} ${MUTED}`}>Tiket masuk</p>
                <h2 id="tiket-judul" className={`${HEAD} mt-1.5 text-[22px] font-semibold leading-tight sm:text-[24px]`}>
                  {tampilKode ? "Tunjukkan di meja registrasi" : "Kursi Anda"}
                </h2>
                {tampilKode ? (
                  <div className="mt-5">
                    <RegistrationCodeCard
                      code={peserta.qr_code}
                      eventName={nama}
                      personName={peserta.name}
                      schedule={formatEventSchedule(event)}
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
                            <dt className={`text-body-medium ${MUTED}`}>{seat.subEventName?.trim() || "Kursi"}</dt>
                            <dd className="mt-0.5 text-[20px] font-semibold leading-7 tabular-nums">{seat.label}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className={`text-body-large ${MUTED}`}>Kursi belum ditentukan panitia. Halaman ini diperbarui begitu kursinya diatur.</p>
                    )}
                    <Link
                      href={`/e/${event.slug}/denah`}
                      className="m3-state -mx-2 mt-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-title-small font-semibold text-[var(--reg-primary)]"
                    >
                      Lihat denah
                      <ArrowRight size={18} weight="bold" />
                    </Link>
                  </div>
                ) : null}
              </section>
            ) : null}

            {tautanCepat.length > 0 ? (
              <ul aria-label="Tautan acara" className="grid grid-cols-2 gap-3">
                {tautanCepat.map((item) => (
                  <li key={item.judul}>
                    <TautanKartu {...item} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-12 lg:col-span-7 lg:col-start-1 lg:row-start-1">
            <section aria-labelledby="pengumuman-judul">
              <p className={ALIS}>Dari panitia</p>
              <h2 id="pengumuman-judul" className={`${JUDUL_DASBOR} mt-1.5`}>
                Pengumuman
              </h2>
              {pengumuman.items.length === 0 ? (
                <p className={`mt-5 rounded-lg border border-[var(--reg-outline-variant)] px-6 py-5 text-body-large ${MUTED}`}>
                  Belum ada pengumuman. Kabar dari panitia muncul di sini.
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
                              Disematkan
                            </p>
                          ) : null}
                          <h3 className="text-[17px] font-semibold leading-6">
                            {baru ? <span className="sr-only">Baru: </span> : null}
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
                          <p className="mt-1.5 text-body-small text-[#535862]">{waktuPengumuman(item.published_at, event.time_zone, "id")}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {tampilSusunan ? (
              <section aria-labelledby="susunan-judul">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <div>
                    <p className={ALIS}>Susunan acara</p>
                    <h2 id="susunan-judul" className={`${JUDUL_DASBOR} mt-1.5`}>
                      {tanggal ?? "Susunan acara"}
                    </h2>
                  </div>
                  <Link href={`/e/${event.slug}/rundown`} className="inline-flex min-h-11 items-center text-title-small font-semibold text-[var(--reg-primary)]">
                    Layar penuh
                  </Link>
                </div>
                <div className="mt-5">
                  <AgendaPills agenda={agenda} speakers={tampil("speakers") ? speakers : []} lang="id" />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      <PitaMitra mitra={mitra} judul={t.organisedBy} />
      <KakiModern
        nama={nama}
        keterangan={{ catatan: config.footer_note?.trim() || null, baris: [tanggal, venue].filter((baris): baris is string => Boolean(baris)) }}
        tombol={{ href: halamanAcara, label: "Kembali ke halaman acara" }}
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
