import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { Avatar, MemberShell } from "@/components/member/member-shell";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { formatEventSchedule } from "@/lib/event-datetime";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { getMemberSession, memberConfig } from "@/lib/member/account";
import { loadMemberLogistics, type MemberLogistics } from "@/lib/member/logistics";
import { memberPageStyle } from "@/lib/member/page-theme";
import { formatJam, formatMoment, summarizeToday, type TodaySummary } from "@/lib/member/schedule";
import { normalizeTimeZone, type EventTimeZone } from "@/lib/timezone";

/**
 * Area peserta, Beranda: `/e/<slug>/peserta`. Desain Figma "Area peserta
 * (member)", 20:2 (layar lebar) dan 22:28 (ponsel).
 *
 * Isinya diambil dari data yang SUDAH ADA, tidak ada yang diisi ulang:
 *   - kode peserta = participants.qr_code (yang dipindai di meja registrasi)
 *   - kursi        = participants.seats (hasil Denah kursi)
 *   - kamar, bus, barang = RPC member_logistics (modul Logistik)
 *   - susunan      = rundown acara, sama dengan halaman acara
 *   - voting       = halaman vote, dengan kode peserta sudah terisi
 *
 * Kartu logistik hanya tampil bila datanya ada. Acara tanpa kamar atau bus
 * tidak perlu kartu kosong yang membuat tamu bertanya "kamar saya mana?".
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Area peserta", robots: { index: false, follow: false } };

const MUTED = "text-[var(--reg-on-surface-variant)]";
const HEAD = "[font-family:var(--landing-heading)]";
/** Sesi yang ditampilkan di beranda. Sisanya di halaman susunan lengkap. */
const MAX_SESI = 6;

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
  const zona = normalizeTimeZone(event.time_zone);
  const schedule = formatEventSchedule(event);
  const tampilKode = member.show_code !== false;
  const tampilKursi = member.show_seat !== false;
  const tampilSusunan = member.show_schedule !== false;
  const tampilVote = member.show_vote !== false;

  const [agenda, logistik] = await Promise.all([
    loadAgendaPreview(event.id),
    loadMemberLogistics(event.id, peserta.id),
  ]);
  const hariIni = summarizeToday(agenda, { event_date: event.event_date, end_date: event.end_date, time_zone: zona });
  const kursi = (peserta.seats ?? []).filter((seat) => seat.label?.trim());
  const fakta = [...(schedule?.split(" · ") ?? []), event.venue_name?.trim()].filter(Boolean) as string[];

  const kartuLogistik = [
    kartuKamar(logistik, zona),
    kartuBus(logistik, zona),
    tampilKursi ? kartuKursi(event.slug, kursi) : null,
    ...kartuBarang(logistik, zona),
  ].filter(Boolean) as ReactNode[];

  return (
    <main className="min-h-dvh bg-[var(--reg-surface)] text-[var(--reg-on-surface)]" style={memberPageStyle(event)}>
      <MemberShell
        slug={event.slug}
        eventName={event.name}
        personName={peserta.name}
        active="beranda"
        showVote={tampilVote}
      >
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 py-6 sm:px-8 lg:gap-12 lg:px-20 lg:py-12">
          <Sapaan nama={peserta.name} fakta={fakta} hariIni={hariIni} />

          <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
            {tampilKode ? (
              <section
                aria-label="Kode peserta"
                className="rounded-2xl bg-[var(--reg-primary)] p-6 text-[var(--reg-on-primary)] sm:p-8 lg:col-span-4 lg:self-start"
              >
                <RegistrationCodeCard
                  code={peserta.qr_code}
                  eventName={event.name}
                  personName={peserta.name}
                  schedule={schedule}
                  inverse
                />
                <p className="mt-4 text-center text-body-medium opacity-85">
                  Tunjukkan di meja registrasi dan di pemindai setiap sesi.
                </p>
              </section>
            ) : null}

            {kartuLogistik.length > 0 ? (
              <div className={`grid gap-4 sm:grid-cols-2 lg:gap-6 ${tampilKode ? "lg:col-span-8" : "lg:col-span-12 lg:grid-cols-3"}`}>
                {kartuLogistik}
              </div>
            ) : null}
          </div>

          {tampilSusunan && hariIni.sessions.length > 0 ? (
            <Susunan slug={event.slug} hariIni={hariIni} />
          ) : null}

          {tampilVote || member.feedback_url ? (
            <section aria-label="Tautan acara" className="grid gap-4 md:grid-cols-2 lg:gap-6">
              {tampilVote ? (
                <AksiKartu
                  judul="Voting langsung"
                  isi="Terbuka saat sesi berlangsung. Kode Anda terisi otomatis."
                  label="Buka voting"
                  href={`/e/${event.slug}/vote`}
                  utama
                />
              ) : null}
              {member.feedback_url ? (
                <AksiKartu
                  judul="Umpan balik acara"
                  isi="Dibuka di tab baru."
                  label="Isi formulir"
                  href={member.feedback_url}
                  eksternal
                />
              ) : null}
            </section>
          ) : null}
        </div>
      </MemberShell>
    </main>
  );
}

function Sapaan({ nama, fakta, hariIni }: { nama: string; fakta: string[]; hariIni: TodaySummary }) {
  const sisi = hariIni.isEventDay
    ? {
        besar: "Hari ini",
        kecil: hariIni.next
          ? `Sesi berikutnya ${hariIni.next.time}${hariIni.next.section ? `, ${hariIni.next.section}` : ""}`
          : null,
      }
    : hariIni.daysLeft !== null && hariIni.daysLeft > 0
      ? { besar: `${hariIni.daysLeft} hari lagi`, kecil: null }
      : null;

  return (
    <section
      aria-label="Sapaan"
      className="flex flex-col gap-6 rounded-2xl bg-[linear-gradient(180deg,var(--reg-primary)_0%,color-mix(in_oklab,var(--reg-primary)_72%,white)_100%)] px-6 py-7 text-[var(--reg-on-primary)] sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:justify-between lg:px-12"
    >
      <div className="min-w-0">
        <p className="text-body-large opacity-85">Selamat datang,</p>
        <h1 className={`mt-2 text-balance text-[32px] font-semibold leading-[1.1] sm:text-[48px] ${HEAD}`}>{nama}</h1>
        {fakta.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {fakta.map((isi) => (
              <li key={isi} className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-label-large font-medium">
                {isi}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {sisi ? (
        <div className="lg:text-right">
          <p className={`text-[28px] font-semibold leading-tight sm:text-[36px] ${HEAD}`}>{sisi.besar}</p>
          {sisi.kecil ? <p className="mt-1 text-body-medium opacity-85">{sisi.kecil}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function Kartu({
  label,
  judul,
  baris,
  children,
}: {
  label: string;
  judul: string;
  baris: (string | null | undefined)[];
  children?: ReactNode;
}) {
  const isi = baris.filter(Boolean) as string[];
  return (
    <section aria-label={label} className="flex flex-col rounded-2xl bg-[var(--reg-panel)] p-6 sm:p-7">
      <h2 className={`text-label-large font-medium ${MUTED}`}>{label}</h2>
      <p className={`mt-3 text-[28px] font-semibold leading-tight sm:text-[32px] ${HEAD}`}>{judul}</p>
      {isi.length > 0 ? (
        <div className={`mt-3 flex flex-col gap-1 text-body-medium leading-6 ${MUTED}`}>
          {isi.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function TombolGaris({ href, children, eksternal = false }: { href: string; children: ReactNode; eksternal?: boolean }) {
  const kelas =
    "m3-state mt-5 inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-[var(--reg-on-surface)] px-4 text-label-large font-semibold";
  return eksternal ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className={kelas}>
      {children}
      <ArrowUpRight size={16} weight="bold" aria-hidden />
    </a>
  ) : (
    <Link href={href} className={kelas}>
      {children}
      <ArrowUpRight size={16} weight="bold" aria-hidden />
    </Link>
  );
}

function kartuKamar({ lodging }: MemberLogistics, zona: EventTimeZone) {
  if (!lodging) return null;
  const hotel = [lodging.hotel.name, lodging.floor ? `lantai ${lodging.floor}` : null].filter(Boolean).join(", ");
  const masuk = formatMoment(lodging.check_in_at, zona);
  const keluar = formatMoment(lodging.check_out_at, zona);
  const jadwal = [masuk ? `Check-in ${masuk}` : null, keluar ? `Check-out ${keluar}` : null].filter(Boolean).join(" · ");
  const teman = lodging.roommates ?? [];
  return (
    <Kartu key="kamar" label="Kamar" judul={lodging.room_number ? `Kamar ${lodging.room_number}` : "Kamar"} baris={[hotel, jadwal]}>
      {teman.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-3 border-t border-[var(--reg-outline-variant)] pt-4">
          {teman.map((orang) => (
            <li key={`${orang.name}-${orang.company}`} className="flex items-center gap-3">
              <Avatar name={orang.name} />
              <span className="min-w-0">
                <span className={`block text-body-small ${MUTED}`}>Satu kamar dengan</span>
                <span className="block truncate text-body-medium font-semibold">
                  {[orang.name, orang.company].filter(Boolean).join(" · ")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {lodging.hotel.map_url ? (
        <TombolGaris href={lodging.hotel.map_url} eksternal>
          Peta hotel
        </TombolGaris>
      ) : null}
    </Kartu>
  );
}

function kartuBus({ transport }: MemberLogistics, zona: EventTimeZone) {
  if (!transport) return null;
  const bus = transport.default_bus ?? transport.trips.find((trip) => trip.bus)?.bus ?? null;
  const baris = transport.trips.slice(0, 3).map((trip) => {
    const jam = formatJam(trip.depart_at, zona);
    const dari = trip.meeting_point || trip.origin;
    const lain = trip.differs_from_default && trip.bus ? ` (naik ${trip.bus})` : "";
    return [trip.name, jam, dari ? `dari ${dari}` : null].filter(Boolean).join(" ") + lain;
  });
  if (transport.trips.length > 3) baris.push(`dan ${transport.trips.length - 3} perjalanan lain di Profil`);
  return <Kartu key="bus" label="Bus" judul={bus ?? "Bus belum ditentukan"} baris={baris} />;
}

function kartuKursi(slug: string, kursi: { subEventName?: string | null; label?: string | null }[]) {
  const [utama, ...lain] = kursi;
  return (
    <Kartu
      key="kursi"
      label="Tempat duduk"
      judul={utama?.label?.trim() || "Belum ditentukan"}
      baris={
        utama
          ? [utama.subEventName?.trim(), ...lain.map((seat) => `${seat.subEventName?.trim() || "Kursi"}: ${seat.label}`)]
          : ["Halaman ini diperbarui begitu panitia mengatur kursinya."]
      }
    >
      <TombolGaris href={`/e/${slug}/denah`}>Lihat denah</TombolGaris>
    </Kartu>
  );
}

function kartuBarang({ items }: MemberLogistics, zona: EventTimeZone) {
  return items.map((item) => {
    const diambil = formatMoment(item.picked_up_at, zona);
    return (
      <Kartu
        key={`barang-${item.name}`}
        label={item.size ? `${item.name}, ukuran` : "Barang acara"}
        judul={item.size ?? item.name}
        baris={[diambil ? `Sudah diambil ${diambil}` : item.pickup_note || "Ambil di meja registrasi, tunjukkan kode QR."]}
      />
    );
  });
}

function Susunan({ slug, hariIni }: { slug: string; hariIni: TodaySummary }) {
  // Di hari acara, mulai dari sesi yang sedang atau akan berlangsung.
  const mulai = hariIni.isEventDay
    ? Math.max(0, hariIni.sessions.findIndex((sesi) => sesi.live || sesi === hariIni.next))
    : 0;
  const sesi = hariIni.sessions.slice(mulai, mulai + MAX_SESI);

  return (
    <section aria-labelledby="susunan-judul">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="susunan-judul" className={`text-[28px] font-semibold leading-tight sm:text-[36px] ${HEAD}`}>
          {hariIni.isEventDay ? "Jadwal hari ini" : "Susunan acara"}
        </h2>
        <TombolGarisKecil href={`/e/${slug}/rundown`}>Susunan lengkap</TombolGarisKecil>
      </div>
      <ol className="mt-4 divide-y divide-[var(--reg-outline-variant)] border-t border-[var(--reg-outline-variant)]">
        {sesi.map((item, index) => (
          <li key={`${item.time}-${index}`} className="grid gap-2 py-5 sm:grid-cols-[7rem_1fr_auto] sm:items-center sm:gap-6">
            <span className={`flex items-center gap-3 text-[22px] font-semibold tabular-nums sm:text-[28px] ${HEAD}`}>
              {item.time}
              {item.live ? <Berlangsung className="sm:hidden" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-title-medium font-semibold">{item.title}</span>
              {item.subtitle ? <span className={`mt-1 block text-body-medium ${MUTED}`}>{item.subtitle}</span> : null}
            </span>
            {item.live ? <Berlangsung className="hidden sm:inline-flex" /> : <span className="hidden sm:block" />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Berlangsung({ className }: { className: string }) {
  return (
    <span
      className={`items-center gap-2 rounded-full bg-[var(--reg-primary-container)] px-3 py-1 text-label-medium font-semibold text-[var(--reg-on-primary-container)] ${className}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      Sedang berlangsung
    </span>
  );
}

function TombolGarisKecil({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="m3-state inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--reg-on-surface)] px-4 text-label-large font-semibold"
    >
      {children}
      <ArrowUpRight size={16} weight="bold" aria-hidden />
    </Link>
  );
}

function AksiKartu({
  judul,
  isi,
  label,
  href,
  utama = false,
  eksternal = false,
}: {
  judul: string;
  isi: string;
  label: string;
  href: string;
  utama?: boolean;
  eksternal?: boolean;
}) {
  const tombol = `m3-state inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-label-large font-semibold ${
    utama ? "bg-[var(--reg-on-primary)] text-[var(--reg-primary)]" : "border border-[var(--reg-on-surface)]"
  }`;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6 sm:p-8 ${
        utama ? "bg-[var(--reg-primary)] text-[var(--reg-on-primary)]" : "bg-[var(--reg-panel)]"
      }`}
    >
      <div>
        <h2 className="text-title-large font-semibold">{judul}</h2>
        <p className={`mt-1 text-body-medium ${utama ? "opacity-85" : MUTED}`}>{isi}</p>
      </div>
      {eksternal ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className={tombol}>
          {label}
          <ArrowUpRight size={16} weight="bold" aria-hidden />
        </a>
      ) : (
        <Link href={href} className={tombol}>
          {label}
          <ArrowUpRight size={16} weight="bold" aria-hidden />
        </Link>
      )}
    </div>
  );
}
