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
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Area peserta", robots: { index: false, follow: false } };

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
  const sesi = await getMemberSession(event);
  if (!sesi) redirect(`/e/${event.slug}/masuk`);

  const peserta = sesi.participant;
  const schedule = formatEventSchedule(event);
  const namaDepan = sesi.name.trim().split(/\s+/)[0] || sesi.name;
  const tampilKode = Boolean(peserta) && member.show_code !== false;
  const tampilKursi = Boolean(peserta) && member.show_seat !== false;
  const tampilSusunan = member.show_schedule !== false;
  const tampilVote = Boolean(peserta) && member.show_vote !== false;
  const agenda = tampilSusunan ? await loadAgendaPreview(event.id) : [];
  const kursi = (peserta?.seats ?? []).filter((seat) => seat.label?.trim());
  const kueri = await searchParams;
  const konfirmasi = kueri.konfirmasi === "ok" ? "ok" : kueri.konfirmasi === "gagal" ? "gagal" : null;

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
        ) : !sesi.emailVerified ? (
          <p className="mt-6 flex max-w-[720px] items-start gap-3 rounded-md border border-[var(--reg-outline-variant)] px-4 py-3 text-body-large">
            <EnvelopeSimple size={22} className="mt-0.5 shrink-0 text-[var(--reg-primary)]" aria-hidden />
            <span>
              {konfirmasi === "gagal" ? "Tautan konfirmasi itu sudah dipakai atau kedaluwarsa. " : null}
              Konfirmasi email {sesi.email} lewat tautan yang kami kirim, supaya akun ini bisa dipulihkan bila Anda lupa kata sandi.
            </span>
          </p>
        ) : null}

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
                    : "Kode QR untuk meja registrasi muncul di sini setelah panitia menyetujui pendaftaran Anda. Kami juga mengabari Anda lewat email."}
                </p>
              </div>
            </section>
          ) : null}

          {peserta && (tampilKode || tampilKursi) ? (
            <section aria-label="Tiket masuk" className="lg:sticky lg:top-8 lg:col-span-5 lg:self-start">
              <div className="rounded-md border border-[var(--reg-outline-variant)] bg-[var(--reg-panel)] p-6 sm:p-8">
                {tampilKode ? (
                  <>
                    <h2 className={`text-[24px] font-semibold leading-tight ${HEAD}`}>Tiket masuk</h2>
                    <p className={`mt-2 text-body-large ${MUTED}`}>Tunjukkan kode ini di meja registrasi.</p>
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
                    <h2 className={`text-[24px] font-semibold leading-tight ${HEAD}`}>Kursi Anda</h2>
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
                  <AgendaTabs agenda={agenda} stacked />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
