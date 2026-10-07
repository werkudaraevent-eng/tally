import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  Bed,
  Bell,
  Bus,
  CalendarBlank,
  CaretRight,
  CheckCircle,
  EnvelopeSimple,
  Globe,
  House,
  Hourglass,
  MapPin,
  Megaphone,
  Phone,
  PushPin,
  SignOut,
  Ticket,
  User,
  Users,
  X,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { EventRow, LandingMemberConfig } from "@/lib/domain";
import { normalizeLandingSections, publicEventName } from "@/lib/domain";
import { formatEventDate, formatEventSchedule } from "@/lib/event-datetime";
import { loadAgendaPreview, type AgendaItem, type AgendaPreview } from "@/lib/landing-agenda";
import { landingDefaultLang, landingEnAvailable, landingPath, resolveLanding, withQuery, type LandingLang } from "@/lib/landing-i18n";
import { PESERTA_UI } from "@/lib/member/peserta-i18n";
import { PORTAL_UI } from "@/lib/member/portal-i18n";
import type { MemberSession } from "@/lib/member/account";
import { inisialNama, waktuPengumuman } from "@/lib/member/nav";
import { isUnread, type MemberAnnouncements } from "@/lib/member/pengumuman";
import { agendaBerikutnya, loadMemberLogistics } from "@/lib/logistik/peserta";
import { gatheringColors } from "@/lib/registration-theme-css";
import { landingTokens } from "@/lib/landing-tokens";
import { normalizeTimeZone, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import { KirimUlangKonfirmasi } from "@/components/member/kirim-ulang-konfirmasi";
import { gayaModern } from "@/components/landing/modern/kerangka";
import { HEAD } from "@/components/landing/modern/styles";
import { tanpaBintang } from "@/components/landing/modern/gathering-app";

/**
 * Portal peserta gaya gathering (`/e/<slug>/peserta`, preset Gathering),
 * rancangan pen.dev Hanung yang disetujui 2026-10-07 dengan tombol hijau.
 *
 * Empat tab lewat `?tab=` (beranda, jadwal, info, profil) dan QR layar penuh
 * (`?tab=qr`): tautan biasa, jadi tombol Kembali peramban dan tautan yang
 * dibagikan tetap bekerja tanpa JavaScript. Ponsel memakai bilah tab bawah;
 * layar lebar memakai tab di bilah atas.
 *
 * Semua isi dari data yang sudah ada: rundown, pengumuman, logistik
 * (member_logistics), kontak acara. Yang datanya belum ada di skema (tiket
 * kereta, kategori pengumuman, kontak darurat) tidak ditampilkan.
 *
 * Acara Modern non-gathering tetap memakai DashboardModern.
 */

export type PortalTab = "beranda" | "jadwal" | "info" | "profil" | "qr";

const KARTU = "rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:p-6";
const MUTED = "text-[#5F6B7F]";
const LABEL = "text-[12px] font-bold uppercase tracking-[0.08em]";
const PANEL = "#F4F6F8";
const LATAR_NAVY = "linear-gradient(160deg, color-mix(in srgb, var(--reg-brand) 70%, black) 0%, var(--reg-brand) 100%)";

/** Tanggal "YYYY-MM-DD" dan menit sejak tengah malam di zona waktu acara. */
function sekarangDi(zona: EventTimeZone, now: Date) {
  const bagian = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { tanggal: `${bagian.year}-${bagian.month}-${bagian.day}`, menit: Number(bagian.hour) * 60 + Number(bagian.minute), jam: Number(bagian.hour) };
}

/** "09.00" atau "09:00" menjadi menit; null bila bukan jam. */
function menitDari(jam: string | null): number | null {
  const cocok = jam?.match(/^(\d{1,2})[.:](\d{2})/);
  return cocok ? Number(cocok[1]) * 60 + Number(cocok[2]) : null;
}

type StatusButir = "berlangsung" | "berikutnya" | null;

/** Status tiap butir hari ini: yang sedang berjalan dan yang berikutnya. */
function statusHari(items: AgendaItem[], menit: number): Map<number, StatusButir> {
  const hasil = new Map<number, StatusButir>();
  const isi = items.filter((item) => menitDari(item.time) !== null);
  isi.forEach((item, index) => {
    const mulai = menitDari(item.time)!;
    const selesai = menitDari(item.end) ?? menitDari(isi[index + 1]?.time ?? null) ?? mulai + 60;
    if (mulai <= menit && menit < selesai) hasil.set(item.id, "berlangsung");
  });
  const berikut = isi.find((item) => menitDari(item.time)! > menit);
  if (berikut) hasil.set(berikut.id, "berikutnya");
  return hasil;
}

export async function DashboardGathering({
  event: asli,
  lang = "id",
  member,
  sesi,
  pengumuman,
  konfirmasi,
  tab,
  hari,
}: {
  event: EventRow;
  lang?: LandingLang;
  member: LandingMemberConfig;
  sesi: MemberSession;
  pengumuman: MemberAnnouncements;
  konfirmasi: "ok" | "gagal" | null;
  tab: PortalTab;
  /** Hari yang dipilih di tab Jadwal (1, 2, ...). */
  hari: number | null;
}) {
  const t = PORTAL_UI[lang];
  const p = PESERTA_UI[lang];
  const { event, config } = resolveLanding(asli, lang);
  const utama = landingDefaultLang(config);
  const halamanAcara = landingPath(event.slug, lang, utama);
  const dasar = `${halamanAcara}/peserta`;
  const keTab = (tujuan: PortalTab, ekstra: Record<string, string> = {}) => (tujuan === "beranda" ? withQuery(dasar, ekstra) : withQuery(dasar, { tab: tujuan, ...ekstra }));
  const lainnya: LandingLang = lang === "en" ? "id" : "en";

  const zona = normalizeTimeZone(event.time_zone);
  const singkatanZona = timeZoneAbbr(zona);
  const sekarang = new Date();
  const kini = sekarangDi(zona, sekarang);

  const tampilSusunan = member.show_schedule !== false;
  const agenda = tampilSusunan ? await loadAgendaPreview(event.id, lang) : [];
  const peserta = sesi.participant;
  const logistik = peserta ? await loadMemberLogistics(event.id, peserta.id, member.show_logistics === true) : null;
  const tampilKode = Boolean(peserta) && member.show_code !== false;

  const nama = publicEventName(event);
  const subjudul = event.tagline?.trim() ? tanpaBintang(event.tagline.trim()) : t.portal;
  const tanggal = formatEventDate(event, lang);
  const venue = event.venue_name?.trim() || null;
  const inisial = inisialNama(sesi.name);
  const logo = config.nav?.logo_url ?? null;
  const petaUrl =
    event.venue_map_url ||
    (venue || event.venue_address?.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue, event.venue_address?.trim()].filter(Boolean).join(", "))}`
      : null);
  // Nomor panitia hanya bila bagian Kontak dinyalakan di halaman acara.
  const kontakTampil = normalizeLandingSections(config.sections, config.blocks).some((section) => section.id === "contact" && section.enabled);
  const telepon = kontakTampil ? config.contact_phone?.trim() || null : null;

  // Hari yang tampil di Beranda: hari ini selama acara, hari pertama sebelumnya,
  // hari terakhir sesudahnya.
  const indeksHariIni = agenda.findIndex((bagian) => bagian.tanggal === kini.tanggal);
  const sesudahAcara = agenda.length > 0 && agenda.every((bagian) => bagian.tanggal && bagian.tanggal < kini.tanggal);
  const indeksBeranda = indeksHariIni >= 0 ? indeksHariIni : sesudahAcara ? agenda.length - 1 : 0;
  const statusHariIni = indeksHariIni >= 0 ? statusHari(agenda[indeksHariIni].items, kini.menit) : new Map<number, StatusButir>();

  // Agenda selanjutnya: butir rundown berikutnya hari ini, atau butir pertama
  // hari acara berikutnya.
  const selanjutnya = (() => {
    if (indeksHariIni >= 0) {
      const item = agenda[indeksHariIni].items.find((butir) => statusHariIni.get(butir.id) === "berikutnya");
      if (item) return { item, hitung: t.inMinutes(menitDari(item.time)! - kini.menit), hari: null as string | null };
    }
    const bagian = agenda.find((b) => b.tanggal && b.tanggal > kini.tanggal);
    const item = bagian?.items.find((butir) => !butir.jeda) ?? null;
    const besok = sekarangDi(zona, new Date(sekarang.getTime() + 864e5)).tanggal;
    return item && bagian ? { item, hitung: null, hari: bagian.tanggal === besok ? t.tomorrow : bagian.hari } : null;
  })();

  const warna = gatheringColors(landingTokens(config, "modern").accent ?? undefined, landingTokens(config, "modern").brand, false, config.button_color);
  const gaya = {
    ...gayaModern(config),
    "--aksi": warna.cta,
    "--on-aksi": warna.onCta,
    "--alis": warna.aksiTeks,
    "--aksen": warna.aksen,
    "--aksen-teks": warna.aksenTeks,
    "--hero-angka": warna.heroAngka,
    backgroundColor: PANEL,
  } as CSSProperties;

  const tautanCepat = [
    ...(tampilKode ? [{ href: keTab("qr"), label: t.quick.tiket, Ikon: Ticket, warna: "text-[var(--alis)]", luar: false }] : []),
    ...(petaUrl ? [{ href: petaUrl, label: t.quick.peta, Ikon: MapPin, warna: "text-[var(--reg-brand)]", luar: true }] : []),
    ...(telepon ? [{ href: `tel:${telepon.replace(/[^\d+]/g, "")}`, label: t.quick.panitia, Ikon: Phone, warna: "text-[var(--aksen-teks)]", luar: true }] : []),
  ];

  const menuTab: { id: Exclude<PortalTab, "qr">; label: string; Ikon: typeof House }[] = [
    { id: "beranda", label: t.tabs.beranda, Ikon: House },
    { id: "jadwal", label: t.tabs.jadwal, Ikon: CalendarBlank },
    { id: "info", label: t.tabs.info, Ikon: Bell },
    { id: "profil", label: t.tabs.profil, Ikon: User },
  ];

  if (tab === "qr" && tampilKode && peserta) {
    return (
      <main className="min-h-dvh" style={{ ...gaya, background: "var(--reg-brand)", color: "#ffffff" }}>
        <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 pb-10 pt-4">
          <div className="flex min-h-14 items-center justify-between gap-3">
            <h1 className={`${HEAD} text-[22px] font-bold`}>{t.qrTitle}</h1>
            <Link href={keTab("beranda")} aria-label={t.qrClose} className="m3-state flex size-12 items-center justify-center rounded-full bg-white/10">
              <X size={22} aria-hidden />
            </Link>
          </div>
          <div className="mt-6 rounded-[24px] bg-white p-6 text-[#1A2333]">
            <p className="text-center text-[20px] font-bold">{peserta.name}</p>
            {[peserta.title, peserta.company].filter(Boolean).length > 0 ? (
              <p className={`mt-1 text-center text-body-medium ${MUTED}`}>{[peserta.title, peserta.company].filter(Boolean).join(" · ")}</p>
            ) : null}
            <div className="mt-4">
              <RegistrationCodeCard code={peserta.qr_code} eventName={nama} personName={peserta.name} schedule={formatEventSchedule(event, lang)} lang={lang} />
            </div>
          </div>
          <p className="mt-8 text-center text-title-medium font-bold">{t.qrShow}</p>
          <p className="mt-1 text-center text-body-medium opacity-85">{t.qrShowNote}</p>
          <p className="mt-6 text-center text-body-small opacity-75">{t.qrBrightness}</p>
        </div>
      </main>
    );
  }

  const tabAktif: Exclude<PortalTab, "qr"> = tab === "qr" ? "beranda" : tab;

  // ---- Kartu yang dipakai Beranda ----------------------------------------
  const kartuPengumuman = pengumuman.ready ? (
    <section aria-labelledby="pengumuman-judul" className={KARTU}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--reg-brand)_8%,white)] text-[var(--reg-brand)]">
          <Megaphone size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 id="pengumuman-judul" className="text-title-medium font-bold">
              {t.announcementsTitle}
            </h2>
            {pengumuman.items[0] && isUnread(pengumuman.items[0], pengumuman.seenAt) ? <Chip nada="brand">{t.isNew}</Chip> : null}
          </div>
          {pengumuman.items[0] ? (
            <>
              <p className="mt-1.5 text-body-large font-semibold">{pengumuman.items[0].title}</p>
              {pengumuman.items[0].body ? <p className={`mt-0.5 line-clamp-3 whitespace-pre-line text-body-medium ${MUTED}`}>{pengumuman.items[0].body}</p> : null}
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className={`text-body-small ${MUTED}`}>{waktuPengumuman(pengumuman.items[0].published_at, zona, lang)}</p>
                {pengumuman.items.length > 1 ? (
                  <Link href={keTab("info")} className="inline-flex min-h-12 items-center text-title-small font-bold text-[var(--alis)]">
                    {t.seeAllInfo}
                  </Link>
                ) : null}
              </div>
            </>
          ) : (
            <p className={`mt-1 text-body-medium ${MUTED}`}>{t.noAnnouncements}</p>
          )}
        </div>
      </div>
    </section>
  ) : null;

  const kartuSelanjutnya = (gelap: boolean) =>
    selanjutnya ? (
      <section aria-labelledby="selanjutnya-judul" className={gelap ? "rounded-[20px] border border-white/15 bg-white/10 p-6 text-white backdrop-blur-sm" : `${KARTU} flex items-center justify-between gap-4`}>
        <div className="min-w-0">
          <p id="selanjutnya-judul" className={`${LABEL} flex items-center gap-2 ${gelap ? "text-[var(--hero-angka)]" : MUTED}`}>
            <span aria-hidden className="size-2 rounded-full bg-[#22C55E]" />
            {t.nextUp}
          </p>
          <p className={`${HEAD} mt-2 text-[24px] font-extrabold leading-tight lg:text-[28px]`}>{selanjutnya.item.title}</p>
          <p className={`mt-1 text-body-medium ${gelap ? "opacity-85" : MUTED}`}>
            {[selanjutnya.hari, `${selanjutnya.item.time} ${singkatanZona}`, selanjutnya.item.subtitle, gelap ? selanjutnya.hitung : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {!gelap && selanjutnya.hitung ? <Chip nada="aksi">{selanjutnya.hitung}</Chip> : null}
      </section>
    ) : null;

  const perjalananBus = logistik ? agendaBerikutnya(logistik, sekarang) : null;
  const namaBus = perjalananBus?.bus ?? logistik?.transport?.default_bus ?? null;
  const kamar = logistik?.lodging ?? null;
  const teman = kamar?.roommates ?? null;

  const kartuBus = namaBus ? (
    <KartuAngka id="bus" Ikon={Bus} ikonWarna="brand" label={t.yourBus} angka={namaBus} catatan={perjalananBus?.meeting_point ? t.meetAt(perjalananBus.meeting_point) : null} />
  ) : null;
  const kartuKamar = kamar ? (
    <KartuAngka
      id="kamar"
      Ikon={Bed}
      ikonWarna="aksen"
      label={t.yourRoom}
      angka={kamar.room_number}
      catatan={teman && teman.length > 0 ? t.withRoommate(teman.map((orang) => orang.name).join(", ")) : [kamar.floor ? t.floor(kamar.floor) : null, kamar.room_type].filter(Boolean).join(" · ") || kamar.hotel.name}
    />
  ) : null;
  const kartuTeman =
    teman && teman.length > 0 ? (
      <section aria-labelledby="teman-judul" className={KARTU}>
        <h2 id="teman-judul" className="flex items-center gap-2 text-title-medium font-bold">
          <Users size={20} aria-hidden className="text-[var(--alis)]" />
          {t.roommates}
        </h2>
        <ul className="mt-3 flex flex-col gap-3">
          {teman.map((orang) => (
            <li key={orang.name} className="flex items-center gap-3">
              <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--reg-brand)_8%,white)] text-title-small font-bold text-[var(--reg-brand)]">
                {inisialNama(orang.name)}
              </span>
              <div className="min-w-0">
                <p className="text-title-medium font-bold">{orang.name}</p>
                <p className={`text-body-medium ${MUTED}`}>{[orang.company, kamar ? t.room(kamar.room_number) : null].filter(Boolean).join(" · ")}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const bagianBeranda = agenda[indeksBeranda];
  const kartuRundown = bagianBeranda ? (
    <section aria-labelledby="rundown-judul" className={KARTU}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="rundown-judul" className="text-title-large font-bold">
          {indeksHariIni >= 0 ? t.todayRundown : t.dayRundown(indeksBeranda + 1)}
        </h2>
        {agenda.length > 1 ? (
          <Link href={keTab("jadwal", { hari: String(indeksBeranda + 1) })} className="inline-flex min-h-12 items-center text-title-small font-bold text-[var(--alis)]">
            {t.seeDays(agenda.length)}
          </Link>
        ) : null}
      </div>
      <ul className="mt-2">
        {bagianBeranda.items.map((item, index) => {
          const status = indeksHariIni >= 0 ? statusHariIni.get(item.id) ?? null : null;
          return (
            <li key={item.id} className={`flex gap-4 py-3.5 ${index > 0 ? "border-t border-[#E6E9EE]" : ""}`}>
              <span className={`w-12 shrink-0 text-body-large font-bold tabular-nums ${status ? "text-[var(--alis)]" : MUTED}`}>{item.time}</span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-large font-semibold">
                  {item.title}
                  {status ? <Chip nada="aksi">{status === "berlangsung" ? t.now : t.next}</Chip> : null}
                </p>
                {item.subtitle ? <p className={`text-body-medium ${MUTED}`}>{item.subtitle}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  ) : null;

  const statusPendaftaran = !peserta ? (
    <section aria-labelledby="status-judul" className={KARTU}>
      {sesi.status === "rejected" ? <XCircle size={32} className={MUTED} aria-hidden /> : <Hourglass size={32} className={MUTED} aria-hidden />}
      <h2 id="status-judul" className="mt-3 text-title-large font-bold">
        {sesi.status === "rejected" ? p.rejectedTitle : p.pendingTitle}
      </h2>
      <p className={`mt-1 text-body-large ${MUTED}`}>{sesi.status === "rejected" ? p.rejectedBody : p.pendingBody}</p>
    </section>
  ) : null;

  const pitaEmail =
    konfirmasi === "ok" ? (
      <p role="status" className="flex items-start gap-3 rounded-[16px] bg-[color-mix(in_srgb,var(--aksi)_10%,white)] px-4 py-3 text-body-large">
        <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-[var(--alis)]" aria-hidden />
        {p.emailConfirmed}
      </p>
    ) : !sesi.emailVerified && sesi.status !== "rejected" ? (
      <div className="flex items-start gap-3 rounded-[16px] bg-white px-4 py-3 text-body-large">
        <EnvelopeSimple size={22} className="mt-0.5 shrink-0 text-[var(--alis)]" aria-hidden />
        <span>
          {konfirmasi === "gagal" ? p.confirmLinkUsed : null}
          {p.confirmEmail(sesi.email)}
          <KirimUlangKonfirmasi slug={event.slug} lang={lang} />
        </span>
      </div>
    ) : null;

  const aksesCepat =
    tautanCepat.length > 0 ? (
      <ul aria-label={t.quickAria} className={`grid gap-3 ${tautanCepat.length === 1 ? "grid-cols-1" : tautanCepat.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {tautanCepat.map(({ href, label, Ikon, warna: warnaIkon, luar }) => (
          <li key={label}>
            <TautanPortal href={href} luar={luar} className={`m3-state flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-[16px] bg-white px-2 text-title-small font-bold shadow-[0_1px_2px_rgb(16_24_40/0.06)]`}>
              <Ikon size={24} aria-hidden className={warnaIkon} />
              {label}
            </TautanPortal>
          </li>
        ))}
      </ul>
    ) : null;

  // ---- Isi tiap tab ------------------------------------------------------
  let isi: ReactNode;
  let kepala: ReactNode;
  if (tabAktif === "beranda") {
    kepala = (
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-body-large opacity-85">{t.greeting(kini.jam)}</p>
          <h1 className={`${HEAD} mt-1 text-[32px] font-extrabold leading-tight tracking-[-0.02em] lg:text-[48px]`}>{sesi.name}</h1>
        </div>
        <div className="hidden w-full max-w-[400px] lg:block">{kartuSelanjutnya(true)}</div>
      </div>
    );
    isi = (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {pitaEmail}
          <div className="lg:hidden">{aksesCepat}</div>
          {statusPendaftaran}
          {kartuPengumuman}
          <div className="lg:hidden">{kartuSelanjutnya(false)}</div>
          {kartuBus || kartuKamar ? (
            <div className="grid grid-cols-2 gap-4 lg:hidden">
              {kartuBus}
              {kartuKamar}
            </div>
          ) : null}
          <div className="lg:hidden">{kartuTeman}</div>
          {kartuRundown}
        </div>
        <div className="hidden flex-col gap-4 lg:flex">
          {kartuBus}
          {kartuKamar}
          {kartuTeman}
          {aksesCepat}
        </div>
      </div>
    );
  } else if (tabAktif === "jadwal") {
    const pilihan = Math.min(Math.max((hari ?? (indeksHariIni >= 0 ? indeksHariIni + 1 : 1)) - 1, 0), Math.max(agenda.length - 1, 0));
    const bagian: AgendaPreview | undefined = agenda[pilihan];
    const statusBagian = bagian && bagian.tanggal === kini.tanggal ? statusHari(bagian.items, kini.menit) : new Map<number, StatusButir>();
    kepala = <JudulKepala judul={t.schedule} catatan={[tanggal, venue].filter(Boolean).join(" · ")} />;
    isi =
      agenda.length === 0 ? (
        <p className={`${KARTU} text-body-large ${MUTED}`}>{t.noSchedule}</p>
      ) : (
        <div className="mx-auto w-full max-w-[720px]">
          {agenda.length > 1 ? (
            <nav aria-label={t.daysAria} className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              <ul className="flex gap-2">
                {agenda.map((b, index) => (
                  <li key={index} className="shrink-0">
                    <Link
                      href={keTab("jadwal", { hari: String(index + 1) })}
                      aria-current={index === pilihan ? "page" : undefined}
                      className={`m3-state inline-flex min-h-12 min-w-[104px] items-center justify-center rounded-full px-5 text-title-small font-bold ${
                        index === pilihan ? "bg-[var(--aksi)] text-[var(--on-aksi)]" : "bg-white text-[#1A2333] shadow-[inset_0_0_0_1px_#E6E9EE]"
                      }`}
                    >
                      {t.day(index + 1)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {bagian ? (
            <>
              {bagian.sectionTitle?.trim() || bagian.hari ? (
                <p className={`mt-5 text-body-medium font-semibold ${MUTED}`}>{[bagian.hari, bagian.sectionTitle?.trim()].filter(Boolean).join(" · ")}</p>
              ) : null}
              <ol className="mt-3 flex flex-col gap-3">
                {bagian.items.map((item) => {
                  const status = statusBagian.get(item.id) ?? null;
                  return (
                    <li key={item.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3">
                      <span className={`pt-4 text-body-medium font-bold tabular-nums ${status === "berlangsung" ? "text-[var(--alis)]" : MUTED}`}>{item.time}</span>
                      <div
                        className={`rounded-[16px] bg-white px-4 py-3.5 ${
                          status === "berlangsung" ? "shadow-[inset_0_0_0_2px_var(--aksi)]" : "shadow-[0_1px_2px_rgb(16_24_40/0.06)]"
                        } ${item.jeda ? "opacity-80" : ""}`}
                      >
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-large font-bold">
                          {item.title}
                          {status ? <Chip nada="aksi">{status === "berlangsung" ? t.now : t.next}</Chip> : null}
                        </p>
                        {item.subtitle ? <p className={`mt-0.5 text-body-medium ${MUTED}`}>{item.subtitle}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : null}
        </div>
      );
  } else if (tabAktif === "info") {
    kepala = <JudulKepala judul={t.info} catatan={t.infoNote} />;
    isi = (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
        {pengumuman.items.length === 0 ? (
          <p className={`${KARTU} text-body-large ${MUTED}`}>{t.noAnnouncements}</p>
        ) : (
          pengumuman.items.map((item) => {
            const baru = isUnread(item, pengumuman.seenAt);
            return (
              <article key={item.id} className={`${KARTU} ${item.pinned ? "shadow-[inset_0_0_0_2px_var(--aksen)]!" : ""}`}>
                {item.pinned || baru ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {item.pinned ? (
                      <Chip nada="aksen">
                        <PushPin size={13} weight="fill" aria-hidden />
                        {t.pinned}
                      </Chip>
                    ) : null}
                    {baru ? <Chip nada="aksi">{t.isNew}</Chip> : null}
                  </div>
                ) : null}
                <h2 className="text-title-large font-bold">{item.title}</h2>
                {item.body ? <p className={`mt-1.5 whitespace-pre-line text-body-large ${MUTED}`}>{item.body}</p> : null}
                {item.link_url ? (
                  <a href={item.link_url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex min-h-12 items-center gap-1.5 text-title-small font-bold text-[var(--alis)]">
                    {item.link_label?.trim() || item.link_url}
                    <ArrowSquareOut size={16} aria-hidden />
                  </a>
                ) : null}
                <p className={`mt-2 text-body-small ${MUTED}`}>{waktuPengumuman(item.published_at, zona, lang)}</p>
              </article>
            );
          })
        )}
      </div>
    );
  } else {
    const statusLabel = sesi.status === "approved" ? p.status.approved : sesi.status === "rejected" ? p.status.rejected : p.status.pending;
    kepala = (
      <div className="flex flex-col items-center text-center">
        <span aria-hidden className="flex size-20 items-center justify-center rounded-full bg-[var(--aksen)] text-[28px] font-extrabold text-[#1A2333]">
          {inisial}
        </span>
        <h1 className={`${HEAD} mt-3 text-[26px] font-extrabold`}>{sesi.name}</h1>
        {peserta && [peserta.title, peserta.company].filter(Boolean).length > 0 ? (
          <p className="mt-0.5 text-body-medium opacity-85">{[peserta.title, peserta.company].filter(Boolean).join(" · ")}</p>
        ) : null}
        <p className="mt-3 inline-flex min-h-7 items-center rounded-full border border-white/25 bg-white/10 px-3 text-label-large font-semibold">{statusLabel}</p>
      </div>
    );
    const baris: { href: string; judul: string; isi: string | null; Ikon: typeof House; luar?: boolean }[] = [
      ...(tampilKode && peserta ? [{ href: keTab("qr"), judul: t.ticket, isi: peserta.qr_code, Ikon: Ticket }] : []),
      ...(kamar ? [{ href: `${keTab("beranda")}#kamar`, judul: t.roomRow, isi: [kamar.room_number, teman?.map((o) => o.name).join(", ")].filter(Boolean).join(" · "), Ikon: Bed }] : []),
      ...(namaBus ? [{ href: `${keTab("beranda")}#bus`, judul: t.busRow, isi: [namaBus, perjalananBus?.meeting_point].filter(Boolean).join(" · "), Ikon: Bus }] : []),
      ...(telepon ? [{ href: `tel:${telepon.replace(/[^\d+]/g, "")}`, judul: t.contactRow, isi: [config.contact_name?.trim(), telepon].filter(Boolean).join(" · "), Ikon: Phone, luar: true }] : []),
      ...(landingEnAvailable(config) ? [{ href: `${landingPath(event.slug, lainnya, utama)}/peserta?tab=profil`, judul: t.languageRow, isi: null, Ikon: Globe }] : []),
      { href: halamanAcara, judul: t.eventPageRow, isi: nama, Ikon: CalendarBlank },
    ];
    isi = (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3">
        {pitaEmail}
        {statusPendaftaran}
        <ul className="flex flex-col gap-3">
          {baris.map(({ href, judul, isi: keterangan, Ikon, luar }) => (
            <li key={judul}>
              <TautanPortal href={href} luar={Boolean(luar)} className={`m3-state flex min-h-[72px] items-center gap-4 rounded-[16px] bg-white px-4 shadow-[0_1px_2px_rgb(16_24_40/0.06)]`}>
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F4F6F8] text-[var(--reg-brand)]">
                  <Ikon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-title-medium font-bold">{judul}</span>
                  {keterangan ? <span className={`block truncate text-body-medium ${MUTED}`}>{keterangan}</span> : null}
                </span>
                <CaretRight size={18} aria-hidden className={MUTED} />
              </TautanPortal>
            </li>
          ))}
          <li>
            <form method="post" action={`/e/${encodeURIComponent(event.slug)}/api/peserta/keluar`}>
              <button type="submit" className="m3-state flex min-h-[72px] w-full items-center gap-4 rounded-[16px] bg-white px-4 text-left shadow-[0_1px_2px_rgb(16_24_40/0.06)]">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FDECEC] text-[#B42318]">
                  <SignOut size={20} />
                </span>
                <span className="text-title-medium font-bold">{t.signOut}</span>
              </button>
            </form>
          </li>
        </ul>
      </div>
    );
  }

  return (
    <main className="min-h-dvh pb-[calc(88px+env(safe-area-inset-bottom))] text-[#1A2333] lg:pb-16" style={gaya}>
      {/* ---- Bilah atas layar lebar ---------------------------------------- */}
      <header className="hidden border-b border-[#E6E9EE] bg-white lg:block">
        <div className="mx-auto flex min-h-20 w-full max-w-[1440px] items-center gap-6 px-12">
          <Link href={halamanAcara} className="flex min-w-0 flex-1 items-center gap-3">
            <Lencana logo={logo} nama={nama} />
            <span className="min-w-0">
              <span className="block truncate text-title-medium font-extrabold">{nama}</span>
              <span className={`block ${LABEL} ${MUTED}`}>{t.portal}</span>
            </span>
          </Link>
          <nav aria-label={t.tabsAria}>
            <ul className="flex gap-1">
              {menuTab.slice(0, 3).map(({ id, label }) => (
                <li key={id}>
                  <Link
                    href={keTab(id)}
                    aria-current={id === tabAktif ? "page" : undefined}
                    className={`m3-state inline-flex min-h-12 items-center rounded-full px-5 text-title-small font-bold ${
                      id === tabAktif ? "bg-[color-mix(in_srgb,var(--aksi)_12%,white)] text-[var(--alis)]" : MUTED
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-1 items-center justify-end gap-4">
            <p className={`text-body-medium ${MUTED}`}>{[tanggal, venue].filter(Boolean).join(" · ")}</p>
            <Link
              href={keTab("profil")}
              aria-label={t.tabs.profil}
              aria-current={tabAktif === "profil" ? "page" : undefined}
              className="m3-state flex size-12 items-center justify-center rounded-full bg-[var(--aksen)] text-title-small font-extrabold text-[#1A2333]"
            >
              {inisial}
            </Link>
          </div>
        </div>
      </header>

      {/* ---- Kepala navy ---------------------------------------------------- */}
      <div className="text-white" style={{ background: LATAR_NAVY }}>
        <div className="mx-auto w-full max-w-[1440px] px-5 pb-8 pt-6 sm:px-8 lg:px-12 lg:pb-16 lg:pt-14">
          {tabAktif !== "profil" ? (
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              {tabAktif === "beranda" ? (
                <Link href={halamanAcara} className="flex min-w-0 flex-1 items-center gap-3">
                  <Lencana logo={logo} nama={nama} />
                  <span className="min-w-0">
                    <span className="block truncate text-title-medium font-extrabold">{nama}</span>
                    <span className="block truncate text-body-medium opacity-85">{subjudul}</span>
                  </span>
                </Link>
              ) : (
                <span className="flex-1" />
              )}
              <Link href={keTab("profil")} aria-label={t.tabs.profil} className="m3-state flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--aksen)] text-title-small font-extrabold text-[#1A2333]">
                {inisial}
              </Link>
            </div>
          ) : null}
          {kepala}
        </div>
      </div>

      <div className="mx-auto -mt-3 w-full max-w-[1440px] px-4 sm:px-8 lg:-mt-6 lg:px-12">{isi}</div>

      {/* ---- Bilah tab bawah (ponsel) -------------------------------------- */}
      <nav aria-label={t.tabsAria} className="fixed inset-x-0 bottom-0 z-20 border-t border-[#E6E9EE] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid max-w-[560px] grid-cols-4">
          {menuTab.map(({ id, label, Ikon }) => (
            <li key={id}>
              <Link
                href={keTab(id)}
                aria-current={id === tabAktif ? "page" : undefined}
                className={`m3-state flex min-h-16 flex-col items-center justify-center gap-1 text-label-large font-bold ${id === tabAktif ? "text-[var(--alis)]" : MUTED}`}
              >
                <Ikon size={24} weight={id === tabAktif ? "fill" : "regular"} aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}

function JudulKepala({ judul, catatan }: { judul: string; catatan: string | null }) {
  return (
    <div>
      <h1 className={`${HEAD} text-[28px] font-extrabold leading-tight tracking-[-0.02em] lg:text-[40px]`}>{judul}</h1>
      {catatan ? <p className="mt-1 text-body-medium opacity-85">{catatan}</p> : null}
    </div>
  );
}

function Lencana({ logo, nama }: { logo: string | null; nama: string }) {
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" className="size-12 shrink-0 rounded-xl bg-white object-contain p-1" />
  ) : (
    <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--aksen)] text-title-medium font-extrabold text-[#1A2333]">
      {inisialNama(nama)}
    </span>
  );
}

function Chip({ nada, children }: { nada: "aksi" | "brand" | "aksen"; children: ReactNode }) {
  const warna =
    nada === "aksi"
      ? "bg-[color-mix(in_srgb,var(--aksi)_12%,white)] text-[var(--alis)]"
      : nada === "aksen"
        ? "bg-[color-mix(in_srgb,var(--aksen)_22%,white)] text-[var(--aksen-teks)]"
        : "bg-[color-mix(in_srgb,var(--reg-brand)_8%,white)] text-[var(--reg-brand)]";
  return <span className={`inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-bold ${warna}`}>{children}</span>;
}

function KartuAngka({
  id,
  Ikon,
  ikonWarna,
  label,
  angka,
  catatan,
}: {
  id: string;
  Ikon: typeof House;
  ikonWarna: "brand" | "aksen";
  label: string;
  angka: string;
  catatan: string | null;
}) {
  return (
    <section id={id} className={`${KARTU} scroll-mt-6`}>
      <span
        aria-hidden
        className={`flex size-12 items-center justify-center rounded-xl ${
          ikonWarna === "brand" ? "bg-[color-mix(in_srgb,var(--reg-brand)_8%,white)] text-[var(--reg-brand)]" : "bg-[color-mix(in_srgb,var(--aksen)_22%,white)] text-[var(--aksen-teks)]"
        }`}
      >
        <Ikon size={24} />
      </span>
      <h2 className={`mt-3 text-body-medium ${MUTED}`}>{label}</h2>
      <p className={`${HEAD} mt-1 break-words text-[28px] font-extrabold leading-tight lg:text-[32px]`}>{angka}</p>
      {catatan ? <p className={`mt-1 text-body-medium ${MUTED}`}>{catatan}</p> : null}
    </section>
  );
}

function TautanPortal({ href, luar, className, children }: { href: string; luar: boolean; className: string; children: ReactNode }) {
  if (luar) {
    const baru = href.startsWith("http");
    return (
      <a href={href} className={className} {...(baru ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

