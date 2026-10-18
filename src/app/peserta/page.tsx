import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, ArrowSquareOut, CheckCircle, EnvelopeSimple, Hourglass, XCircle } from "@phosphor-icons/react/dist/ssr";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import { AgendaTabs } from "@/components/landing/agenda-tabs";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { formatEventSchedule } from "@/lib/event-datetime";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { memberPageStyle } from "@/lib/member/page-theme";
import { warnaTandaHalaman } from "@/lib/registration-theme-css";
import { KirimUlangKonfirmasi } from "@/components/member/kirim-ulang-konfirmasi";
import { DashboardModern } from "@/components/member/dashboard-modern";
import { KartuLengkapi } from "@/components/member/kartu-lengkapi";
import { kartuLengkapi } from "@/lib/member/lengkapi";
import { DashboardGathering, type PortalTab } from "@/components/member/dashboard-gathering";
import { isUnread, loadMemberAnnouncements, markAnnouncementsSeen } from "@/lib/member/pengumuman";
import { waktuPengumuman } from "@/lib/member/nav";
import { gatheringHorizon, publicEventName, type EventLandingConfig, type EventRow } from "@/lib/domain";
import { PORTAL_UI } from "@/lib/member/portal-i18n";
import { labelOutfit } from "@/lib/outfit";
import { loadOutfitBagian } from "@/lib/outfit-server";
import { LANDING_UI, landingDefaultLang, landingEnAvailable, landingPath, withQuery, type LandingLang } from "@/lib/landing-i18n";
import { warnaBilahPeramban } from "@/lib/landing-tokens";

/**
 * Area peserta: `/e/<slug>/peserta`.
 *
 * Isinya diambil dari data yang SUDAH ADA, tidak ada yang diisi ulang:
 *   - kode peserta = participants.qr_code (yang dipindai di meja registrasi)
 *   - kursi        = participants.seats (hasil Denah kursi)
 *   - susunan      = rundown acara, sama dengan halaman acara
 *   - voting       = halaman vote, dengan kode peserta sudah terisi
 *
 * "Susunan acara", bukan "Jadwal Anda": rundown berlaku untuk semua peserta,
 * dan menyebutnya jadwal pribadi menjanjikan sesuatu yang datanya tidak ada.
 *
 * Akun yang dibuat dari formulir pendaftaran sudah bisa masuk sebelum
 * pendaftarannya disetujui. Selama itu belum ada baris peserta (kode, kursi),
 * jadi halaman ini menampilkan status pendaftarannya di tempat tiket.
 *
 * Tata letak Modern memakai Dashboard saya (components/member/dashboard-modern):
 * bilah atas, warna, dan kaki halaman acara yang sama. Editorial dan Forum
 * masih memakai halaman di bawah ini, ditambah daftar pengumuman.
 *
 * Bahasa: bahasa utama di `/e/<slug>/peserta`, bahasa lain di
 * `/e/<slug>/en/peserta` (src/proxy.ts mengisi `?bahasa=`). Sama dengan
 * formulir: alamat bahasa lain yang tidak berlaku dialihkan ke alamat utama.
 *
 * Membuka halaman ini menandai semua pengumuman terbaca. Daftarnya dimuat
 * DULU, jadi titik "baru" di halaman ini tetap menunjuk yang baru masuk.
 * Portal Gathering bertab berbeda (U-03): hanya tab Pengumuman yang menandai
 * terbaca (components/member/tandai-pengumuman), jadi membuka QR atau Jadwal
 * tidak menghapus tanda "Baru" sebelum pengumumannya dilihat.
 */

export const dynamic = "force-dynamic";
/** Bilah alamat ponsel navy pada portal Horizon, termasuk layar QR (U-31). */
export async function generateViewport({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const event = await getPublicPageEvent(searchParams);
  const warna = warnaBilahPeramban(event?.landing_config as EventLandingConfig | null | undefined);
  return warna ? { themeColor: warna } : {};
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // `bahasa` dari proxy (/en/peserta). Alamat yang tidak berlaku dialihkan halamannya.
  const kueri = await searchParams;
  const robots = { index: false, follow: false };
  const event = await getPublicPageEvent(searchParams);
  const landing = (event?.landing_config ?? {}) as EventLandingConfig;
  const lang: LandingLang = kueri.bahasa === "en" || kueri.bahasa === "id" ? kueri.bahasa : landingDefaultLang(landing);
  if (!event) return { title: LANDING_UI[lang].myDashboard, robots };
  return { title: `${await judulTabPortal(event, lang, kueri.tab)} · ${publicEventName(event)}`, robots };
}

/**
 * Judul dokumen per tab (U-13, U-21): "Jadwal · <acara>". Pembaca layar hanya
 * mengumumkan pindah halaman bila document.title berubah, jadi setiap tab
 * portal bertab perlu judulnya sendiri. Portal tanpa tab memakai nama yang
 * sama dengan tombol di bilah halaman acara, "Dashboard saya". Tab yang jatuh
 * kembali ke Beranda di DashboardGathering (Perjalanan di luar Horizon, Outfit
 * tanpa outfit, QR yang disembunyikan) berjudul Beranda juga. Sesi tidak dibaca
 * di sini supaya QR di gerbang tidak menunggu kueri tambahan.
 */
async function judulTabPortal(event: EventRow, lang: LandingLang, tab: string | string[] | undefined): Promise<string> {
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const teks = PORTAL_UI[lang];
  if (landing.layout !== "modern" || landing.gathering !== true) return LANDING_UI[lang].myDashboard;
  const horizon = gatheringHorizon(landing);
  const label = horizon ? teks.horizon.tabs : { ...teks.horizon.tabs, ...teks.tabs };
  const member = memberConfig(event);
  if (tab === "qr" && horizon && member?.show_code !== false) return teks.qrTitle;
  if (tab === "outfit" && horizon && (await adaOutfit(event.id, lang))) return labelOutfit(member?.outfit_label);
  if (tab === "perjalanan" && horizon) return label.perjalanan;
  if (tab === "jadwal" || tab === "info" || tab === "profil") return label[tab];
  return label.beranda;
}

/** Sama dengan adaOutfit di DashboardGathering: ada outfit di hari Agenda yang terbit. */
async function adaOutfit(eventId: string, lang: LandingLang): Promise<boolean> {
  const [agenda, peta] = await Promise.all([loadAgendaPreview(eventId, lang), loadOutfitBagian(eventId)]);
  return agenda.some((bagian) => bagian.id !== undefined && (peta.get(bagian.id)?.length ?? 0) > 0);
}

const MUTED = "text-[var(--reg-on-surface-variant)]";
const HEAD = "[font-family:var(--landing-heading)]";

export default async function AreaPesertaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const event = await getPublicPageEvent(searchParams);
  if (!event || event.status === "archived") notFound();
  const member = memberConfig(event);
  if (!member) notFound();
  const kueri = await searchParams;
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const utama = landingDefaultLang(landing);
  const minta: LandingLang | null = kueri.bahasa === "en" || kueri.bahasa === "id" ? kueri.bahasa : null;
  if (minta && (minta === utama || !landingEnAvailable(landing))) {
    const sisa = Object.fromEntries(Object.entries(kueri).filter(([kunci]) => kunci !== "eventSlug" && kunci !== "bahasa"));
    redirect(withQuery(`/e/${event.slug}/peserta`, sisa));
  }
  const lang = minta ?? utama;
  const sesi = await getMemberSession(event);
  // Belum masuk: dialog masuk di halaman acara dalam bahasa yang sama.
  if (!sesi) redirect(`${landingPath(event.slug, lang, utama)}/masuk`);

  const peserta = sesi.participant;
  const schedule = formatEventSchedule(event);
  const namaDepan = sesi.name.trim().split(/\s+/)[0] || sesi.name;
  const tampilKode = Boolean(peserta) && member.show_code !== false;
  const tampilKursi = Boolean(peserta) && member.show_seat !== false;
  const tampilSusunan = member.show_schedule !== false;
  const tampilVote = Boolean(peserta) && member.show_vote !== false;
  const kursi = (peserta?.seats ?? []).filter((seat) => seat.label?.trim());
  const konfirmasi = kueri.konfirmasi === "ok" ? "ok" : kueri.konfirmasi === "gagal" ? "gagal" : null;
  const gathering = landing.layout === "modern" && landing.gathering === true;
  // QR Horizon yang dimuat ulang atau dibuka dari tautan hanya menampilkan
  // kode, nama, dan bus: pengumuman tidak dibaca di sana, jadi tidak ditunggu
  // (U-10). Sama dengan syarat jalur QR di DashboardGathering.
  const hanyaQr = gathering && gatheringHorizon(landing) && kueri.tab === "qr" && tampilKode;
  const pengumuman = hanyaQr ? { ready: false, items: [], unread: 0, seenAt: null } : await loadMemberAnnouncements(event.id, sesi);
  if (!gathering && pengumuman.unread > 0) await markAnnouncementsSeen(sesi.accountId);

  // Preset Gathering: portal bergaya aplikasi dengan tab (rancangan 2026-10-07).
  if (gathering) {
    const tab: PortalTab =
      kueri.tab === "jadwal" || kueri.tab === "perjalanan" || kueri.tab === "outfit" || kueri.tab === "info" || kueri.tab === "profil" || kueri.tab === "qr" ? kueri.tab : "beranda";
    const hari = typeof kueri.hari === "string" && /^\d{1,2}$/.test(kueri.hari) ? Number(kueri.hari) : null;
    // QR layar penuh dibuka dari tab lain: tutup kembali ke tab (dan hari) asalnya.
    const dari =
      kueri.dari === "jadwal" || kueri.dari === "perjalanan" || kueri.dari === "outfit" || kueri.dari === "info" || kueri.dari === "profil" ? kueri.dari : null;
    return <DashboardGathering event={event} lang={lang} member={member} sesi={sesi} pengumuman={pengumuman} konfirmasi={konfirmasi} tab={tab} hari={hari} dari={dari} />;
  }
  if (landing.layout === "modern") {
    return <DashboardModern event={event} lang={lang} member={member} sesi={sesi} pengumuman={pengumuman} konfirmasi={konfirmasi} />;
  }
  const agenda = tampilSusunan ? await loadAgendaPreview(event.id) : [];
  const lengkapi = await kartuLengkapi(event, peserta?.id);

  return (
    <main className="min-h-dvh bg-[var(--reg-surface)] text-[var(--reg-on-surface)]" style={memberPageStyle(event)}>
      <header className="border-b border-[var(--reg-outline-variant)]">
        <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-4 px-5 sm:px-8 lg:min-h-[72px] lg:px-10">
          <Link
            href={`/e/${event.slug}`}
            className={`flex min-h-11 min-w-0 flex-1 items-center text-title-large font-semibold ${HEAD}`}
          >
            <span className="truncate">{event.name}</span>
          </Link>
          <span className={`hidden max-w-[16rem] truncate text-body-large sm:block ${MUTED}`}>{sesi.name}</span>
          <form method="post" action={`/e/${event.slug}/api/peserta/keluar`}>
            <button
              type="submit"
              className="m3-state inline-flex min-h-11 items-center rounded-md border border-[var(--reg-outline)] px-4 text-label-large font-semibold"
            >
              Keluar
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        {schedule ? <p className={`text-body-large font-medium ${MUTED}`}>{schedule}</p> : null}
        <h1 className={`mt-3 text-balance text-[36px] font-semibold leading-[1.1] sm:text-[48px] ${HEAD}`}>
          Selamat datang, {namaDepan}
        </h1>

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

        <KartuLengkapi lang="id" href={`/e/${event.slug}/lengkapi`} fields={lengkapi} gaya="klasik" className="mt-6 max-w-[720px]" />

        <div className="mt-10 grid gap-12 lg:grid-cols-12 lg:gap-6">
          {!peserta ? (
            <section aria-labelledby="status-judul" className="lg:col-span-5 lg:self-start">
              <div className="rounded-md border border-[var(--reg-outline-variant)] bg-[var(--reg-panel)] p-6 sm:p-8">
                {sesi.status === "rejected" ? (
                  <XCircle size={40} className={MUTED} aria-hidden />
                ) : (
                  <Hourglass size={40} className={MUTED} aria-hidden />
                )}
                <h2 id="status-judul" className={`mt-4 text-[24px] font-semibold leading-tight ${HEAD}`}>
                  {sesi.status === "rejected" ? "Pendaftaran tidak disetujui" : "Menunggu persetujuan panitia"}
                </h2>
                <p className={`mt-2 text-body-large leading-7 ${MUTED}`}>
                  {sesi.status === "rejected"
                    ? "Panitia tidak menyetujui pendaftaran Anda untuk acara ini. Hubungi panitia bila Anda merasa ini keliru."
                    : "QR kehadiran muncul di sini setelah panitia menyetujui pendaftaran Anda. Kami juga mengabari Anda lewat email."}
                </p>
              </div>
            </section>
          ) : null}

          {peserta && (tampilKode || tampilKursi) ? (
            <section aria-label="QR kehadiran" className="lg:sticky lg:top-8 lg:col-span-5 lg:self-start">
              <div className="rounded-md border border-[var(--reg-outline-variant)] bg-[var(--reg-panel)] p-6 sm:p-8">
                {tampilKode ? (
                  <>
                    <h2 className={`text-[24px] font-semibold leading-tight ${HEAD}`}>QR kehadiran</h2>
                    <p className={`mt-2 text-body-large ${MUTED}`}>Tunjukkan QR ini ke panitia.</p>
                    <RegistrationCodeCard
                      code={peserta.qr_code}
                      eventName={event.name}
                      personName={peserta.name}
                      schedule={schedule}
                    />
                  </>
                ) : null}

                {tampilKursi ? (
                  <div className={tampilKode ? "mt-8 border-t border-[var(--reg-outline-variant)] pt-6" : ""}>
                    <h2 className={`text-[24px] font-semibold leading-tight ${HEAD}`}>Kursi</h2>
                    {kursi.length > 0 ? (
                      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                        {kursi.map((seat, index) => (
                          <div key={`${seat.subEventId ?? index}-${seat.label}`}>
                            <dt className={`text-body-medium ${MUTED}`}>{seat.subEventName?.trim() || "Kursi"}</dt>
                            <dd className="mt-1 text-[22px] font-semibold tabular-nums">{seat.label}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className={`mt-2 text-body-large ${MUTED}`}>
                        Kursi belum ditentukan panitia. Halaman ini diperbarui begitu kursinya diatur.
                      </p>
                    )}
                    <Link
                      href={`/e/${event.slug}/denah`}
                      className="m3-state -mx-2 mt-4 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-title-small font-semibold text-[var(--reg-primary)]"
                    >
                      Lihat denah
                      <ArrowRight size={18} weight="bold" />
                    </Link>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className={`flex flex-col gap-12 ${!peserta || tampilKode || tampilKursi ? "lg:col-span-6 lg:col-start-7" : "lg:col-span-8"}`}>
            {pengumuman.items.length > 0 ? (
              <section aria-labelledby="pengumuman-judul">
                <h2 id="pengumuman-judul" className={`text-[28px] font-semibold leading-tight sm:text-[32px] ${HEAD}`}>
                  Pengumuman
                </h2>
                <ul className="mt-4 divide-y divide-[var(--reg-outline-variant)] rounded-md border border-[var(--reg-outline-variant)]">
                  {pengumuman.items.map((item) => (
                    <li key={item.id} className="px-5 py-4">
                      <h3 className="text-title-medium font-semibold">
                        {isUnread(item, pengumuman.seenAt) ? <span className="mr-2 inline-block size-2 rounded-full bg-[var(--reg-primary)] align-middle" aria-label="Baru" /> : null}
                        {item.pinned ? "Disematkan: " : null}
                        {item.title}
                      </h3>
                      {item.body ? <p className={`mt-1 whitespace-pre-line text-body-large ${MUTED}`}>{item.body}</p> : null}
                      {item.link_url ? (
                        <a href={item.link_url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex min-h-10 items-center text-title-small font-semibold text-[var(--reg-primary)]">
                          {item.link_label?.trim() || item.link_url}
                        </a>
                      ) : null}
                      <p className={`mt-1 text-body-small ${MUTED}`}>{waktuPengumuman(item.published_at, event.time_zone, "id")}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {tampilVote || member.feedback_url ? (
              <section aria-label="Tautan acara" className="grid gap-4 sm:grid-cols-2">
                {tampilVote ? (
                  <Link
                    href={`/e/${event.slug}/vote`}
                    className="m3-state flex min-h-28 flex-col gap-2 rounded-md border border-[var(--reg-outline-variant)] p-5"
                  >
                    <span className="flex items-center justify-between gap-2 text-title-medium font-semibold">
                      Voting langsung
                      <ArrowRight size={18} weight="bold" className="shrink-0 text-[var(--reg-primary)]" />
                    </span>
                    <span className={`text-body-medium leading-6 ${MUTED}`}>
                      Terbuka saat sesi berlangsung. Kode peserta Anda sudah terisi.
                    </span>
                  </Link>
                ) : null}
                {member.feedback_url ? (
                  <a
                    href={member.feedback_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="m3-state flex min-h-28 flex-col gap-2 rounded-md border border-[var(--reg-outline-variant)] p-5"
                  >
                    <span className="flex items-center justify-between gap-2 text-title-medium font-semibold">
                      Formulir umpan balik
                      <ArrowSquareOut size={18} className="shrink-0 text-[var(--reg-primary)]" />
                    </span>
                    <span className={`text-body-medium leading-6 ${MUTED}`}>Dibuka di tab baru.</span>
                  </a>
                ) : null}
              </section>
            ) : null}

            {tampilSusunan && agenda.length > 0 ? (
              <section aria-labelledby="susunan-judul">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <h2 id="susunan-judul" className={`text-[28px] font-semibold leading-tight sm:text-[32px] ${HEAD}`}>
                    Susunan acara
                  </h2>
                  <Link
                    href={`/e/${event.slug}/rundown`}
                    className="inline-flex min-h-11 items-center text-title-small font-semibold text-[var(--reg-primary)]"
                  >
                    Layar penuh
                  </Link>
                </div>
                <div className="mt-6">
                  <AgendaTabs agenda={agenda} stacked warnaTanda={warnaTandaHalaman(memberPageStyle(event), landing.accent)} />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
