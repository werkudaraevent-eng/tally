import { Fragment, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  Bed,
  Bell,
  Bus,
  CalendarBlank,
  CaretRight,
  CheckCircle,
  CoatHanger,
  EnvelopeSimple,
  Globe,
  House,
  Hourglass,
  MapPin,
  Megaphone,
  Phone,
  PushPin,
  SignOut,
  Suitcase,
  Ticket,
  Train,
  User,
  Users,
  X,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { EventRow, LandingMemberConfig } from "@/lib/domain";
import { kontakPanitia, telHref } from "@/lib/kontak-panitia";
import { logoNavPutih, isPortalEntry, landingMemberBlocks, memberHomeOrder, normalizeLandingSections, publicEventName, susunanDenganPortal } from "@/lib/domain";
import { KartuRute } from "@/components/landing/modern/blok-rute";
import { KartuHitungMundur } from "@/components/landing/modern/landing-blocks";
import { BagianBeranda } from "@/components/member/bagian-beranda";
import { KartuBlok } from "@/components/member/kartu-blok";
import { formatEventDate, formatEventDateRingkas, formatEventSchedule } from "@/lib/event-datetime";
import { jumlahHariAgenda, loadAgendaPreview, type AgendaItem, type AgendaPreview } from "@/lib/landing-agenda";
import { LANDING_UI, landingDefaultLang, landingEnAvailable, landingPath, resolveLanding, withQuery, type LandingLang } from "@/lib/landing-i18n";
import { PESERTA_UI } from "@/lib/member/peserta-i18n";
import { PORTAL_UI } from "@/lib/member/portal-i18n";
import type { MemberSession } from "@/lib/member/account";
import { inisialNama, muatNavPeserta, waktuPengumuman } from "@/lib/member/nav";
import { isUnread, type MemberAnnouncements } from "@/lib/member/pengumuman";
import { nomorKru } from "@/lib/logistik/kontak-kru";
import { agendaBerikutnya, loadMemberLogistics } from "@/lib/logistik/peserta";
import { KartuKereta, KontakKru } from "@/components/member/kartu-logistik";
import { KartuCheckpoint } from "@/components/member/kartu-checkpoint";
import { KartuCheckpointHorizon } from "@/components/member/kartu-checkpoint-horizon";
import { loadCheckpointPeserta } from "@/lib/checkpoint/server";
import { gatheringColors, kvGathering, latarGathering } from "@/lib/registration-theme-css";
import { loadLandingLodging } from "@/lib/landing-hotel";
import { landingTokens } from "@/lib/landing-tokens";
import { normalizeTimeZone, timeZoneAbbr, type EventTimeZone } from "@/lib/timezone";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import { KirimUlangKonfirmasi } from "@/components/member/kirim-ulang-konfirmasi";
import { KartuLengkapi } from "@/components/member/kartu-lengkapi";
import { kartuLengkapi, updatableFields } from "@/lib/member/lengkapi";
import { FokusPemicuQr, PemicuQr, TutupQrEscape } from "@/components/member/qr-fokus";
import { QrMini } from "@/components/member/qr-mini";
import { bagianModern, gayaModern } from "@/components/landing/modern/kerangka";
import { HEAD, SHELL } from "@/components/landing/modern/styles";
import { LandingNavModern } from "@/components/landing/modern/landing-nav-modern";
import { LatarKv, inisialNama as inisialAcara } from "@/components/landing/modern/gathering-app";
import { teksPolos } from "@/lib/landing-teks-kaya";
import { kontras } from "@/lib/landing-hitung-mundur";
import { HORIZON_GOLD_DEFAULT } from "@/lib/landing-tokens";
import { gayaHorizon } from "@/components/landing/modern/horizon";
import {
  BarisTautanHorizon,
  ChipHariHorizon,
  HariJadwalHorizon,
  BantuanPonselHorizon,
  KartuInfoHorizon,
  KartuOutfitHorizon,
  KepalaHorizon,
  KontakKruHorizon,
  LATAR_PORTAL_HORIZON,
  NavBawahHorizon,
  PassHorizon,
  ProfilHorizon,
  PerjalananBusHorizon,
  PitaKepalaHorizon,
  QrHorizon,
  SapaanHorizon,
  SelanjutnyaHorizon,
  TemanSekamarHorizon,
  TiketKeretaHorizon,
  type FaktaPass,
  type LegKereta,
  type TabHorizon,
} from "@/components/member/portal-horizon";
import { jamLeg, ruteLeg, tanggalLeg } from "@/lib/logistik/kereta-tampil";
import { hariOutfitBeranda, labelOutfit } from "@/lib/outfit";
import { loadOutfitBagian } from "@/lib/outfit-server";

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

/**
 * `perjalanan` dan `outfit` hanya untuk Gathering Horizon; preset lain
 * membukanya sebagai Beranda. `outfit` juga Beranda selama belum ada outfit.
 */
export type PortalTab = "beranda" | "jadwal" | "perjalanan" | "outfit" | "info" | "profil" | "qr";

const KARTU = "rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:p-6";
const MUTED = "text-[#5F6B7F]";
const LABEL = "text-[12px] font-bold uppercase tracking-[0.08em]";
const PANEL = "#F4F6F8";
/** Gradasi hero halaman acara (LATAR_HERO di gathering-app), dari `--latar-gathering`. */
const LATAR_HERO =
  "var(--latar-gathering, linear-gradient(160deg, color-mix(in srgb, var(--reg-brand) 62%, black) 0%, color-mix(in srgb, var(--reg-brand) 85%, black) 60%, var(--reg-brand) 100%))";
/** Lencana di atas judul, sama dengan hero halaman acara. */
const ALIS_HERO =
  "inline-flex items-center rounded-full bg-white/10 px-[18px] py-2 text-[12px] font-semibold uppercase leading-[1.2] tracking-[2px] text-[var(--hero-lencana,var(--hero-alis))]";
const REDUP_HERO = "text-[var(--hero-redup,rgb(255_255_255/0.8))]";

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
  tab: tabDiminta,
  hari,
  dari = null,
  pratinjau = false,
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
  /** Tab asal QR layar penuh (`?dari=`): tombol tutup dan Escape kembali ke sana. */
  dari?: "jadwal" | "perjalanan" | "outfit" | "info" | "profil" | null;
  /** Pratinjau di Participant area: tiap isi Beranda diberi penanda untuk digulir ke sana. */
  pratinjau?: boolean;
}) {
  const t = PORTAL_UI[lang];
  const p = PESERTA_UI[lang];
  const { event, config } = resolveLanding(asli, lang);
  const utama = landingDefaultLang(config);
  const halamanAcara = landingPath(event.slug, lang, utama);
  const dasar = `${halamanAcara}/peserta`;
  const keTab = (tujuan: PortalTab, ekstra: Record<string, string> = {}) => (tujuan === "beranda" ? withQuery(dasar, ekstra) : withQuery(dasar, { tab: tujuan, ...ekstra }));
  const lainnya: LandingLang = lang === "en" ? "id" : "en";
  // Gathering Horizon (rancangan V5): halaman per topik, termasuk Perjalanan dan Outfit.
  const horizon = config.gathering_variant === "horizon";

  const zona = normalizeTimeZone(event.time_zone);
  const singkatanZona = timeZoneAbbr(zona);
  const sekarang = new Date();
  const kini = sekarangDi(zona, sekarang);

  const tampilSusunan = member.show_schedule !== false;
  // Outfit per bagian Agenda (kolom rundown_sections.outfit): hanya Horizon,
  // kueri sendiri yang kembali kosong sebelum migrasinya dijalankan.
  const [agenda, petaOutfit] = await Promise.all([tampilSusunan ? loadAgendaPreview(event.id, lang) : [], horizon ? loadOutfitBagian(event.id) : null]);
  const agendaNav = tampilSusunan ? agenda : await loadAgendaPreview(event.id, lang);
  // Hari Outfit = hari tab Jadwal (bagian yang diterbitkan dan berisi), juga bila Jadwal disembunyikan.
  const hariOutfit = petaOutfit ? agendaNav.map((bagian) => ({ ...bagian, outfit: (bagian.id !== undefined ? petaOutfit.get(bagian.id) : undefined) ?? [] })) : [];
  const adaOutfit = hariOutfit.some((bagian) => bagian.outfit.length > 0);
  const labelMenuOutfit = labelOutfit(member.outfit_label);
  const tab: PortalTab =
    (!horizon && tabDiminta === "perjalanan") || (tabDiminta === "outfit" && !adaOutfit) ? "beranda" : tabDiminta;
  const peserta = sesi.participant;
  // Kartu Lengkapi data hanya di Beranda. Pratinjau admin: semua pertanyaannya.
  const lengkapi = tab !== "beranda" && tab !== "qr" ? [] : pratinjau ? updatableFields(asli) : await kartuLengkapi(asli, peserta?.id);
  // Checkpoint (Check-in > Checkpoints): hanya Beranda, hanya bila dinyalakan
  // dan tidak disembunyikan di Participant home.
  const [logistik, checkpoint] = peserta
    ? await Promise.all([
        loadMemberLogistics(event.id, peserta.id, member.show_logistics === true, { plate: member.show_bus_plate === true, crew: member.show_bus_crew === true }),
        tab === "beranda" && !(member.home?.hidden ?? []).includes("checkpoints") ? loadCheckpointPeserta(event.id, peserta.id, lang) : null,
      ])
    : [null, null];
  const tampilKode = Boolean(peserta) && member.show_code !== false;

  const nama = publicEventName(event);
  const tanggal = formatEventDate(event, lang);
  const venue = event.venue_name?.trim() || null;
  const inisial = inisialNama(sesi.name);
  // Bilah atas sama dengan halaman acara (Mas Hanung, 9 Okt): logo, menu
  // bagian yang kembali ke halaman acara, lonceng, dan "Dashboard saya".
  const sectionsHalaman = normalizeLandingSections(config.sections, config.blocks);
  const inap = await loadLandingLodging(event.id);
  const adaHotel = inap.hotels.length > 0;
  // Blok yang admin pilih untuk halaman peserta (Show on), dalam urutan
  // Participant home (bawaannya tepat sebelum Rundown hari ini).
  const hotelIds = new Set(inap.hotels.map((hotel) => hotel.id));
  const blokPeserta = landingMemberBlocks(config.sections, config.blocks, hotelIds);
  const tokensTema = landingTokens(config, "modern");
  const warnaTema = { brand: tokensTema.brand, accent: tokensTema.accent ?? null };
  const kartuBlok = new Map(
    blokPeserta.map((block) => [
      block.id as string,
      block.type === "route" ? (
        <KartuRute block={block} hotels={inap.hotels} lang={lang} />
      ) : block.type === "countdown" ? (
        <KartuHitungMundur block={block} acara={event} lang={lang} warnaTema={warnaTema} />
      ) : (
        <KartuBlok block={block} lang={lang} />
      ),
    ]),
  );
  const beranda = memberHomeOrder(member.home, [...kartuBlok.keys()], true);
  const diBeranda = (id: string) => !beranda.hidden.has(id);
  const { navSections, tampil } = bagianModern(event, config, sectionsHalaman, agendaNav, lang, { gathering: true, adaHotel, hotelIds });
  const menuAtas = (() => {
    const urutan = susunanDenganPortal(config.sections, config.blocks);
    if (config.portal_section === false || navSections.some((section) => section.id === "portal")) return navSections;
    const posisiPortal = urutan.findIndex(isPortalEntry);
    const posisiNav = (id: string) => urutan.findIndex((section) => section.id === (id === "program" ? (tampil("about") ? "about" : "agenda") : id));
    const sesudah = navSections.findIndex((section) => posisiNav(section.id) > posisiPortal);
    const tautan = { id: "portal", label: LANDING_UI[lang].navPortal };
    return sesudah < 0 ? [...navSections, tautan] : [...navSections.slice(0, sesudah), tautan, ...navSections.slice(sesudah)];
  })();
  const navPeserta = await muatNavPeserta(event, sesi, lang, { data: pengumuman });
  const subNama = event.name.trim() && event.name.trim() !== nama ? event.name.trim() : null;
  const alis = config.hero_eyebrow?.trim() || nama;
  const logo = config.nav?.logo_url ?? null;
  // KV yang sama dengan hero halaman acara, 20% di kepala navy (Figma Hanung).
  const latarKv = kvGathering(config);
  const petaUrl =
    event.venue_map_url ||
    (venue || event.venue_address?.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue, event.venue_address?.trim()].filter(Boolean).join(", "))}`
      : null);
  // Nomor panitia dari Event settings > Kontak panitia. Tidak lagi menunggu
  // bagian Kontak halaman acara dinyalakan: peserta yang sudah masuk tetap
  // perlu tahu siapa yang dihubungi.
  const telepon = kontakPanitia(config)?.telepon ?? null;

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

  const latarHalaman = latarGathering(landingTokens(config, "modern").brand);
  const warna = gatheringColors(landingTokens(config, "modern").accent ?? undefined, landingTokens(config, "modern").brand, false, config.button_color);
  const gaya = {
    ...gayaModern(config),
    // Portal berlatar putih dan abu-abu muda: tombol versi putih (QA #103 M3).
    "--aksi": warna.ctaPutih,
    "--on-aksi": warna.onCtaPutih,
    "--chip-aksi": warna.chipAksi.latar,
    "--on-chip-aksi": warna.chipAksi.teks,
    "--chip-merek": warna.chipMerek.latar,
    "--on-chip-merek": warna.chipMerek.teks,
    "--chip-aksen": warna.chipAksen.latar,
    "--on-chip-aksen": warna.chipAksen.teks,
    "--alis": warna.aksiTeks,
    "--aksen": warna.aksen,
    "--aksen-teks": warna.aksenTeks,
    "--hero-angka": warna.heroAngka,
    // Hero sama dengan halaman acara: gradasi, teks redup, lencana, tepi 56px.
    "--latar-gathering": latarHalaman.latar,
    "--hero-redup": latarHalaman.redup ?? undefined,
    "--hero-lencana": warna.heroLencana,
    "--hero-alis": warna.heroAlis,
    "--tanda-latar": warna.tanda.latar,
    "--tanda-teks": warna.tanda.teks,
    "--pinggir-lg": "56px",
    "--pinggir-xl": "56px",
    // Sama dengan halaman acara: Inter polos, tanpa varian global (cv01/ss03)
    // dan angka tabel, supaya bilah atas sama persis.
    fontFeatureSettings: "normal",
    fontVariantNumeric: "normal",
    backgroundColor: PANEL,
  } as CSSProperties;
  // Gathering Horizon (rancangan V5): navy dan emas dari Tema, latar krem.
  if (horizon) {
    const emas = [config.button_color, tokensTema.accent].find((warna) => /^#[0-9a-f]{6}$/i.test(warna ?? "")) ?? HORIZON_GOLD_DEFAULT;
    Object.assign(gaya, gayaHorizon(tokensTema.brand, emas, kontras(emas, "#101E38") >= 4.5 ? "#101E38" : "#ffffff"), { backgroundColor: LATAR_PORTAL_HORIZON });
  }
  const tH = t.horizon;
  const infoBaru = pengumuman.items.some((item) => isUnread(item, pengumuman.seenAt));

  const tautanCepat = [
    ...(tampilKode ? [{ href: keTab("qr"), label: t.quick.tiket, Ikon: Ticket, warna: "text-[var(--alis)]", luar: false, pemicuQr: "pemicu-qr-cepat" }] : []),
    ...(petaUrl ? [{ href: petaUrl, label: t.quick.peta, Ikon: MapPin, warna: "text-[var(--reg-brand)]", luar: true }] : []),
    ...(telepon ? [{ href: `tel:${telepon.replace(/[^\d+]/g, "")}`, label: t.quick.panitia, Ikon: Phone, warna: "text-[var(--aksen-teks)]", luar: true }] : []),
  ];

  const menuTab: { id: Exclude<PortalTab, "qr">; label: string; Ikon: typeof House }[] = [
    { id: "beranda", label: t.tabs.beranda, Ikon: House },
    { id: "jadwal", label: t.tabs.jadwal, Ikon: CalendarBlank },
    { id: "info", label: t.tabs.info, Ikon: Bell },
    { id: "profil", label: t.tabs.profil, Ikon: User },
  ];

  if (tab === "qr" && tampilKode && peserta && horizon) {
    const tutupQr = dari ? keTab(dari, (dari === "jadwal" || dari === "outfit") && hari ? { hari: String(hari) } : {}) : keTab("beranda");
    return (
      <main className="min-h-dvh" style={{ ...gaya, backgroundColor: "var(--hz-navy)", color: "#ffffff" }}>
        <TutupQrEscape href={tutupQr} />
        <QrHorizon
          judul={t.qrTitle}
          tutup={tutupQr}
          tutupLabel={t.qrClose}
          nama={peserta.name}
          sub={[peserta.title, peserta.company].filter(Boolean).join(" • ") || null}
          kartuKode={<RegistrationCodeCard code={peserta.qr_code} eventName={nama} personName={peserta.name} schedule={formatEventSchedule(event, lang)} lang={lang} horizon />}
          petunjuk={t.qrShow}
          petunjukCatatan={t.qrShowNote}
          kecerahan={t.qrBrightness}
        />
      </main>
    );
  }

  if (tab === "qr" && tampilKode && peserta) {
    return (
      <main className="min-h-dvh" style={{ ...gaya, background: "var(--reg-brand)", color: "#ffffff" }}>
        <TutupQrEscape href={keTab("beranda")} />
        <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 pb-10 pt-4">
          <div className="flex min-h-14 items-center justify-between gap-3">
            <h1 className={`${HEAD} text-[22px] font-bold`}>{t.qrTitle}</h1>
            <Link href={keTab("beranda")} aria-label={t.qrClose} className="m3-state flex size-12 items-center justify-center rounded-full bg-white/10">
              <X size={22} aria-hidden />
            </Link>
          </div>
          <div className="mt-6 rounded-[24px] bg-white px-4 py-6 text-[#1A2333]">
            <p className="text-center text-[20px] font-bold">{peserta.name}</p>
            {[peserta.title, peserta.company].filter(Boolean).length > 0 ? (
              <p className={`mt-1 text-center text-body-medium ${MUTED}`}>{[peserta.title, peserta.company].filter(Boolean).join(" · ")}</p>
            ) : null}
            <div className="mt-4">
              <RegistrationCodeCard code={peserta.qr_code} eventName={nama} personName={peserta.name} schedule={formatEventSchedule(event, lang)} lang={lang} qrBesar />
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
                  <Link href={keTab("info")} className="inline-flex min-h-12 min-w-12 items-center justify-center text-title-small font-bold text-[var(--alis)]">
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
            {[selanjutnya.hari, `${selanjutnya.item.time} ${singkatanZona}`, teksPolos(selanjutnya.item.subtitle) || null, gelap ? selanjutnya.hitung : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {!gelap && selanjutnya.hitung ? <Chip nada="aksi">{selanjutnya.hitung}</Chip> : null}
      </section>
    ) : null;

  const perjalananBus = logistik ? agendaBerikutnya(logistik, sekarang) : null;
  const namaBus = perjalananBus?.bus ?? logistik?.transport?.default_bus ?? null;
  const kamar = logistik?.lodging ?? null;
  const teman = kamar?.roommates ?? null;
  // Horizon: halaman Perjalanan (dan menunya) hanya ada bila panitia membagikan
  // hotel, bus, atau tiket kereta peserta ini.
  const perjalananBusHorizon = (logistik?.transport?.trips ?? []).filter((trip) => trip.bus);
  const adaPerjalanan = horizon && Boolean(kamar || namaBus || perjalananBusHorizon.length > 0 || (logistik?.trains.length ?? 0) > 0);

  // Plat dan kru bus yang ditampilkan kartu (bila panitia menyalakannya di Logistics > Buses).
  const detailNamaBus = namaBus ? logistik?.buses.find((bus) => bus.code === namaBus) : undefined;
  const kartuBus = namaBus ? (
    <KartuAngka
      id="bus"
      Ikon={Bus}
      ikonWarna="brand"
      label={t.yourBus}
      angka={namaBus}
      catatan={perjalananBus?.meeting_point ? t.meetAt(perjalananBus.meeting_point) : null}
    >
      {detailNamaBus?.plate ? <p className={`mt-1 text-body-medium ${MUTED}`}>{`${tH.travel.plate}: ${detailNamaBus.plate}`}</p> : null}
      {detailNamaBus?.crew ? (
        <div className="mt-3 flex flex-col gap-1">
          <KontakKru
            ringkas
            teks={detailNamaBus.crew}
            awalan={`${tH.travel.crew}: `}
            aksi={{ call: tH.travel.call, whatsapp: tH.travel.whatsapp, callAria: tH.travel.contactLabel(tH.travel.call, namaBus), whatsappAria: tH.travel.contactLabel(tH.travel.whatsapp, namaBus) }}
          />
        </div>
      ) : null}
    </KartuAngka>
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
  const kartuKereta = logistik && logistik.trains.length > 0 ? <KartuKereta logistik={logistik} lang={lang} kelas={KARTU} redup={MUTED} /> : null;
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

  // Tiket kereta Horizon: kartu di halaman Perjalanan, baris ringkas di Beranda.
  const legKereta: LegKereta[] = (logistik?.trains ?? []).map((tiket) => {
    const rute = ruteLeg(tiket);
    return {
      kunci: tiket.direction,
      arah: [tiket.direction === "outbound" ? tH.train.outbound : tH.train.return, tanggalLeg(tiket.depart_date, lang)].filter(Boolean).join(" • "),
      judul: rute ?? tiket.train_name,
      baris: [rute ? tiket.train_name : null, tiket.travel_class].filter(Boolean).join(" • ") || null,
      jam: jamLeg(tiket, lang),
      gerbong: tiket.carriage,
      kursi: tiket.seat,
      kode: tiket.booking_code,
    };
  });

  const kartuCheckpoint = () => (checkpoint ? <KartuCheckpoint data={checkpoint} lang={lang} zona={zona} gaya="gathering" qrHref={tampilKode ? keTab("qr") : null} /> : null);

  const bagianBeranda = agenda[indeksBeranda];
  const kartuRundown = bagianBeranda ? (
    <section aria-labelledby="rundown-judul" className={KARTU}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="rundown-judul" className="text-title-large font-bold">
          {indeksHariIni >= 0 ? t.todayRundown : bagianBeranda.sectionTitle?.trim() || t.dayRundown(indeksBeranda + 1)}
        </h2>
        {agenda.length > 1 ? (
          <Link href={keTab("jadwal", { hari: String(indeksBeranda + 1) })} className="inline-flex min-h-12 items-center text-title-small font-bold text-[var(--alis)]">
            {t.seeSchedule}
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
                {item.subtitle ? <p className={`text-body-medium ${MUTED}`}>{teksPolos(item.subtitle)}</p> : null}
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
        {tautanCepat.map(({ href, label, Ikon, warna: warnaIkon, luar, ...sisa }) => (
          <li key={label}>
            <TautanPortal href={href} luar={luar} pemicuQr={"pemicuQr" in sisa ? sisa.pemicuQr : undefined} className={`m3-state flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-[16px] bg-white px-2 text-title-small font-bold shadow-[0_1px_2px_rgb(16_24_40/0.06)]`}>
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
  // Horizon: judul tab di atas latar krem seperti sapaan Beranda, bukan pita navy.
  let judulHorizon: { alis: string; judul: string; judulPonsel?: string; catatan: string } | null = null;
  if (tabAktif === "beranda") {
    kepala = (
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col items-start gap-5">
          <p className={ALIS_HERO}>{alis}</p>
          <div>
            <p className={`text-[16px] leading-[1.6] ${REDUP_HERO}`}>{t.greeting(kini.jam)}</p>
            <h1 className={`${HEAD} mt-1 text-balance [overflow-wrap:anywhere] text-[40px] font-extrabold leading-[1.08] sm:text-[52px] lg:text-[62px] lg:leading-[1.05]`}>{sesi.name}</h1>
          </div>
        </div>
        {diBeranda("next") ? <div className="hidden w-full max-w-[400px] lg:block">{kartuSelanjutnya(true)}</div> : null}
      </div>
    );
    isi = (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
        {/* Ponsel: urutan Participant home dari atas ke bawah. Layar lebar:
            Tautan cepat, Bus dan kamar, dan Teman sekamar di kolom samping. */}
        <div className="flex min-w-0 flex-col gap-4">
          {pitaEmail}
          <KartuLengkapi lang={lang} href={`${halamanAcara}/lengkapi`} fields={lengkapi} gaya="gathering" />
          {beranda.order.map((id, index) => {
            // Status pendaftaran sebelum isi pertama selain Tautan cepat, seperti sebelum urutan ini ada.
            const status = index === beranda.order.findIndex((lain) => lain !== "quick") ? statusPendaftaran : null;
            const isi = !diBeranda(id) ? null : id === "quick" ? (
              <div className="lg:hidden">{aksesCepat}</div>
            ) : id === "announcements" ? (
              kartuPengumuman
            ) : id === "next" ? (
              <div className="lg:hidden">{kartuSelanjutnya(false)}</div>
            ) : id === "checkpoints" ? (
              kartuCheckpoint()
            ) : id === "logistics" ? (
              kartuBus || kartuKamar || kartuKereta ? (
                <>
                  {kartuBus || kartuKamar ? (
                    <div className="grid grid-cols-2 gap-4 lg:hidden">
                      {kartuBus}
                      {kartuKamar}
                    </div>
                  ) : null}
                  {kartuKereta ? <div className="lg:hidden">{kartuKereta}</div> : null}
                </>
              ) : null
            ) : id === "roommates" ? (
              <div className="lg:hidden">{kartuTeman}</div>
            ) : id === "agenda" ? (
              kartuRundown
            ) : (
              kartuBlok.get(id) ?? null
            );
            return (
              <Fragment key={id}>
                {status}
                <BagianBeranda id={id} pratinjau={pratinjau}>{isi}</BagianBeranda>
              </Fragment>
            );
          })}
        </div>
        <div className="hidden flex-col gap-4 lg:flex">
          {/* Kolom samping urutannya tetap (Bus dan kamar, Teman sekamar, Akses
              cepat), sama dengan sebelum Participant home ada: urutan Beranda
              hanya mengatur kolom utama dan tampilan ponsel. */}
          {(["logistics", "roommates", "quick"] as const).map((id) =>
            !diBeranda(id) ? null : id === "logistics" ? (
              <BagianBeranda key={id} id={id} pratinjau={pratinjau}>
                {kartuBus}
                {kartuKamar}
                {kartuKereta}
              </BagianBeranda>
            ) : id === "roommates" || id === "quick" ? (
              <BagianBeranda key={id} id={id} pratinjau={pratinjau}>{id === "roommates" ? kartuTeman : aksesCepat}</BagianBeranda>
            ) : null,
          )}
        </div>
      </div>
    );
  } else if (tabAktif === "jadwal") {
    const pilihan = Math.min(Math.max((hari ?? (indeksHariIni >= 0 ? indeksHariIni + 1 : 1)) - 1, 0), Math.max(agenda.length - 1, 0));
    const bagian: AgendaPreview | undefined = agenda[pilihan];
    const statusBagian = bagian && bagian.tanggal === kini.tanggal ? statusHari(bagian.items, kini.menit) : new Map<number, StatusButir>();
    kepala = <JudulKepala judul={t.schedule} catatan={[tanggal, venue].filter(Boolean).join(" · ")} />;
    judulHorizon = { alis: nama, judul: t.schedule, catatan: [tanggal, venue].filter(Boolean).join(" · ") };
    isi =
      agenda.length === 0 ? (
        <p className={`${KARTU} text-body-large ${MUTED}`}>{t.noSchedule}</p>
      ) : (
        <div className={!horizon ? "mx-auto w-full max-w-[720px]" : agenda.length > 1 ? "w-full lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14" : "w-full"}>
          {horizon && agenda.length > 1 ? (
            <HariJadwalHorizon
              aria={t.daysAria}
              hari={agenda.map((b, index) => ({
                label: [String(index + 1).padStart(2, "0"), b.tanggal ? tanggalBab(b.tanggal, lang) : null].filter(Boolean).join(" / "),
                judul: b.sectionTitle?.trim() || t.day(index + 1),
                href: keTab("jadwal", { hari: String(index + 1) }),
                aktif: index === pilihan,
              }))}
            />
          ) : null}
          <div className={horizon ? "min-w-0 lg:col-start-2 lg:max-w-[880px]" : "contents"}>
          {agenda.length > 1 ? (
            <nav
              aria-label={t.daysAria}
              className={`-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0 ${
                // Horizon: tanggal yang terpotong di tepi layar memudar, jadi jelas deretannya bisa digeser.
                horizon ? "[mask-image:linear-gradient(to_right,transparent,#000_20px,#000_calc(100%-56px),transparent)] sm:[mask-image:none] lg:hidden" : ""
              }`}
            >
              <ul className="flex gap-2">
                {agenda.map((b, index) => (
                  <li key={index} className="shrink-0">
                    <Link
                      href={keTab("jadwal", { hari: String(index + 1) })}
                      aria-current={index === pilihan ? "page" : undefined}
                      className={`m3-state inline-flex min-h-12 min-w-[104px] items-center justify-center whitespace-nowrap rounded-full px-5 ${horizon ? "text-[14px] font-semibold leading-5" : "text-title-small font-bold"} ${
                        index === pilihan
                          ? horizon
                            ? "bg-[var(--hz-emas)] text-[var(--hz-on-emas)]"
                            : "bg-[var(--aksi)] text-[var(--on-aksi)]"
                          : "bg-white text-[#1A2333] shadow-[inset_0_0_0_1px_#E6E9EE]"
                      }`}
                    >
                      {/* Label tab dari CMS; "Hari N" dari posisi hanya cadangan
                          karena satu hari bisa punya dua bagian (Batch 1 dan 2). */}
                      {b.sectionTitle?.trim() || t.day(index + 1)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {bagian ? (
            <>
              {horizon ? (
                // Layar lebar: judul hari di atas daftar; tanggal panjang dari tanggal bagian, jadi tanggal yang salah di CMS langsung terlihat.
                <div className="mt-5 flex flex-col gap-1 lg:mt-0">
                  {bagian.tanggal ? <p className={`text-[14px] font-medium leading-5 ${MUTED}`}>{tanggalPanjangBab(bagian.tanggal, lang)}</p> : null}
                  <h2 className="text-[22px] font-semibold leading-7 [overflow-wrap:anywhere] lg:text-[24px] lg:leading-8">{bagian.sectionTitle?.trim() || t.day(pilihan + 1)}</h2>
                </div>
              ) : bagian.sectionTitle?.trim() || bagian.hari ? (
                <p className={`mt-5 text-body-medium font-semibold ${MUTED}`}>{[bagian.hari, bagian.sectionTitle?.trim()].filter(Boolean).join(" · ")}</p>
              ) : null}
              <ol className={`flex flex-col ${horizon ? "mt-4 gap-2" : "mt-3 gap-3"}`}>
                {bagian.items.map((item, _i, semua) => {
                  // Kolom jam dilebarkan hanya bila hari ini punya jam selesai, supaya semua baris sejajar.
                  const adaJamSelesai = horizon && semua.some((butir) => butir.end);
                  const status = statusBagian.get(item.id) ?? null;
                  return (
                    <li key={item.id} className={`grid gap-3 ${adaJamSelesai ? "grid-cols-[92px_minmax(0,1fr)] md:grid-cols-[104px_minmax(0,1fr)]" : "grid-cols-[52px_minmax(0,1fr)]"}`}>
                      <span
                        className={`tabular-nums ${
                          // Horizon mengikuti skala M3: label-large 14/20 tebal 500, tanpa tracking tambahan (Plus Jakarta sudah lebar).
                          horizon ? "pt-[18px] text-[14px] font-medium leading-5" : "pt-4 text-body-medium font-bold"
                        } ${status === "berlangsung" ? "text-[var(--alis)]" : MUTED}`}
                      >
                        {/* Horizon: jam mulai dan selesai satu baris, "07.00–08.00". */}
                        {horizon && item.end ? `${item.time}–${item.end}` : item.time}
                      </span>
                      <div
                        className={`rounded-[16px] bg-white ${horizon ? "flex min-h-14 flex-col justify-center px-4 py-4" : "px-4 py-3.5"} ${
                          status === "berlangsung" ? "shadow-[inset_0_0_0_2px_var(--aksi)]" : "shadow-[0_1px_2px_rgb(16_24_40/0.06)]"
                        } ${item.jeda ? (horizon ? "" : "opacity-80") : ""}`}
                      >
                        <p
                          className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${
                            // M3 title-medium 16/24 tebal 500; jeda memakai warna redup, bukan opacity.
                            horizon ? `text-[16px] font-medium leading-6 ${item.jeda ? MUTED : ""}` : "text-body-large font-bold"
                          }`}
                        >
                          {item.title}
                          {status ? <Chip nada="aksi">{status === "berlangsung" ? t.now : t.next}</Chip> : null}
                        </p>
                        {item.subtitle ? <p className={`${horizon ? "mt-1 text-[14px] leading-5" : "mt-0.5 text-body-medium"} ${MUTED}`}>{teksPolos(item.subtitle)}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : null}
          </div>
        </div>
      );
  } else if (tabAktif === "perjalanan") {
    // Hanya Horizon (preset lain sudah dialihkan ke Beranda di atas).
    const tv = tH.travel;
    judulHorizon = { alis: nama, judul: tH.tabs.perjalanan, catatan: tv.note };
    const hotel = kamar?.hotel ?? null;
    const peta = hotel
      ? hotel.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([hotel.name, hotel.address].filter(Boolean).join(", "))}`
      : null;
    const kartuHotel = kamar ? (
      <KartuInfoHorizon
        judul={tv.hotelTitle}
        Ikon={Bed}
        nama={hotel?.name?.trim() || null}
        alamat={hotel?.address?.trim() || null}
        tautan={peta ? { href: peta, label: tv.openMap } : null}
        kolom={4}
        fakta={[
          { label: tH.room, nilai: kamar.room_number, besar: true },
          ...(teman && teman.length > 0 ? [{ label: tH.roommate(teman.length), nilai: teman.map((orang) => orang.name).join(", ") }] : []),
          ...(kamar.floor ? [{ label: tv.floor, nilai: kamar.floor }] : []),
          ...(kamar.room_type ? [{ label: tv.roomType, nilai: kamar.room_type }] : []),
          // Tanggal sebagai nilai, jam di bawahnya: kolom ponsel sempit tidak memotong "Kam, 5 Nov • 14.00".
          ...(kamar.check_in_at ? [{ label: tv.checkIn, nilai: hariHorizon(kamar.check_in_at, zona, lang), catatan: jamHorizon(kamar.check_in_at, zona, lang) }] : []),
          ...(kamar.check_out_at ? [{ label: tv.checkOut, nilai: hariHorizon(kamar.check_out_at, zona, lang), catatan: jamHorizon(kamar.check_out_at, zona, lang) }] : []),
        ]}
      />
    ) : null;
    const busUtama = logistik?.transport?.default_bus ?? namaBus;
    // Plat dan kru hanya ada bila panitia menyalakannya di Logistics > Buses.
    const detailBus = new Map((logistik?.buses ?? []).map((bus) => [bus.code, bus]));
    const utama = busUtama ? detailBus.get(busUtama) : undefined;
    const kontakKru = (bus: string, teks: string, label: string | null) => (
      <KontakKruHorizon
        label={label}
        teks={teks}
        nomor={nomorKru(teks)}
        aksi={{ call: tv.call, whatsapp: tv.whatsapp, callAria: tv.contactLabel(tv.call, bus), whatsappAria: tv.contactLabel(tv.whatsapp, bus) }}
      />
    );
    const kartuBusHorizon =
      busUtama || perjalananBusHorizon.length > 0 ? (
        <KartuInfoHorizon
          judul={tv.busTitle}
          Ikon={Bus}
          kolom={3}
          fakta={busUtama ? [{ label: tv.mainBus, nilai: busUtama, besar: true }, ...(utama?.plate ? [{ label: tv.plate, nilai: utama.plate }] : [])] : []}
        >
          {busUtama && utama?.crew ? kontakKru(busUtama, utama.crew, tv.crew) : null}
          <PerjalananBusHorizon
            baris={perjalananBusHorizon.map((trip, index) => {
              // Bus lain dari bus utama: plat ditulis bersama namanya, kru di bawahnya.
              // Bus yang sama dengan "Bus utama" tidak diulang (juga bila peserta
              // tanpa bus bawaan, saat bus utama diambil dari agenda berikutnya).
              const lain = trip.bus && trip.bus !== busUtama ? trip.bus : null;
              const detail = lain ? detailBus.get(lain) : undefined;
              return {
              kunci: `${index}-${trip.name}`,
              judul: trip.name,
              jam: trip.depart_at ? hariJamHorizon(trip.depart_at, zona, lang) : null,
              detail: [
                [trip.origin?.trim(), trip.destination?.trim()].filter(Boolean).join(" → "),
                trip.meeting_point?.trim() ? `${tv.meetingPoint}: ${trip.meeting_point.trim()}` : "",
                // Nama bus dari Logistics sudah berbunyi "Bus 5"; hanya ditulis bila berbeda dari bus utama.
                lain ? [lain, detail?.plate].filter(Boolean).join(" · ") : "",
              ].filter(Boolean),
              kru: lain && detail?.crew ? kontakKru(lain, detail.crew, null) : undefined,
              };
            })}
          />
        </KartuInfoHorizon>
      ) : null;
    const kartuKeretaHorizon =
      legKereta.length > 0 ? <TiketKeretaHorizon judul={tH.train.title} label={{ gerbong: tH.train.carriage, kursi: tH.train.seat, kode: tH.train.booking }} leg={legKereta} /> : null;
    isi = !adaPerjalanan ? (
      <p className={`${KARTU} max-w-[720px] text-body-large ${MUTED}`}>{tv.empty}</p>
    ) : (
      <div className="flex flex-col gap-4 md:gap-6">
        {kartuHotel && kartuBusHorizon ? (
          <div className="flex flex-col gap-4 md:gap-6 xl:grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
            {kartuHotel}
            {kartuBusHorizon}
          </div>
        ) : (
          (kartuHotel ?? kartuBusHorizon)
        )}
        {kartuKeretaHorizon}
      </div>
    );
  } else if (tabAktif === "outfit") {
    // Hanya Horizon dengan outfit (selain itu sudah dialihkan ke Beranda di atas).
    // Kerangka hari sama dengan tab Jadwal: daftar hari di kiri (lg), pil di ponsel.
    const to = tH.outfit;
    judulHorizon = { alis: nama, judul: labelMenuOutfit, catatan: to.note };
    const indeksHariIniOutfit = hariOutfit.findIndex((bagian) => bagian.tanggal === kini.tanggal);
    const pilihan = Math.min(Math.max((hari ?? (indeksHariIniOutfit >= 0 ? indeksHariIniOutfit + 1 : 1)) - 1, 0), Math.max(hariOutfit.length - 1, 0));
    const bagian = hariOutfit[pilihan];
    const daftarHari = hariOutfit.map((b, index) => ({
      label: [String(index + 1).padStart(2, "0"), b.tanggal ? tanggalBab(b.tanggal, lang) : null].filter(Boolean).join(" / "),
      judul: b.sectionTitle?.trim() || t.day(index + 1),
      href: keTab("outfit", { hari: String(index + 1) }),
      aktif: index === pilihan,
    }));
    isi = (
      <div className={hariOutfit.length > 1 ? "w-full lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14" : "w-full"}>
        {hariOutfit.length > 1 ? <HariJadwalHorizon aria={t.daysAria} hari={daftarHari} /> : null}
        <div className="min-w-0 lg:col-start-2 lg:max-w-[880px]">
          {hariOutfit.length > 1 ? <ChipHariHorizon aria={t.daysAria} hari={daftarHari.map((item) => ({ label: item.judul, href: item.href, aktif: item.aktif }))} /> : null}
          {bagian ? (
            <>
              <div className={`flex flex-col gap-1 ${hariOutfit.length > 1 ? "mt-5 lg:mt-0" : ""}`}>
                {bagian.tanggal ? <p className={`text-[14px] font-medium leading-5 ${MUTED}`}>{tanggalPanjangBab(bagian.tanggal, lang)}</p> : null}
                <h2 className="text-[22px] font-semibold leading-7 [overflow-wrap:anywhere] lg:text-[24px] lg:leading-8">{bagian.sectionTitle?.trim() || t.day(pilihan + 1)}</h2>
              </div>
              {bagian.outfit.length === 0 ? (
                <p className={`mt-4 text-[16px] leading-6 ${MUTED}`}>{to.dayEmpty}</p>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
                  {bagian.outfit.map((isian, index) => (
                    <KartuOutfitHorizon key={index} kapan={isian.when ?? null} apa={isian.what} catatan={isian.note ?? null} foto={isian.photo_url ?? null} />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    );
  } else if (tabAktif === "info") {
    kepala = <JudulKepala judul={t.info} catatan={t.infoNote} />;
    // Horizon: judul halaman sama dengan nama menunya ("Pengumuman").
    judulHorizon = { alis: nama, judul: horizon ? tH.tabs.info : t.info, catatan: t.infoNote };
    isi = (
      // Horizon di layar lebar: kartu dua kolom selebar halaman, yang disematkan selebar penuh.
      <div className={horizon ? "grid gap-4 md:grid-cols-2" : "mx-auto flex w-full max-w-[720px] flex-col gap-3"}>
        {pengumuman.items.length === 0 ? (
          <p className={`${KARTU} text-body-large ${MUTED}`}>{t.noAnnouncements}</p>
        ) : (
          pengumuman.items.map((item) => {
            const baru = isUnread(item, pengumuman.seenAt);
            return (
              <article key={item.id} className={`${KARTU} ${item.pinned ? `shadow-[inset_0_0_0_2px_var(--aksen)]! ${horizon ? "md:col-span-2" : ""}` : ""}`}>
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
                <h2 className="max-w-[70ch] text-title-large font-bold">{item.title}</h2>
                {item.body ? <p className={`mt-1.5 max-w-[70ch] whitespace-pre-line text-body-large ${MUTED}`}>{item.body}</p> : null}
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
  } else if (horizon) {
    // Profil Horizon: header sama dengan tab lain, lalu kartu tiket, data diri, dan bantuan.
    const tp = tH.profile;
    const statusLabel = sesi.status === "approved" ? p.status.approved : sesi.status === "rejected" ? p.status.rejected : p.status.pending;
    const instansi = peserta ? [peserta.title, peserta.company].filter(Boolean).join(" · ") : "";
    const tautanTelepon = telepon ? telHref(telepon) : null;
    judulHorizon = { alis: nama, judul: tH.tabs.profil, judulPonsel: tH.tabsShort.profil, catatan: tp.note };
    isi = (
      <ProfilHorizon
        sisipan={pitaEmail || statusPendaftaran ? <div className="flex flex-col gap-4">{pitaEmail}{statusPendaftaran}</div> : null}
        kartu={{
          inisial,
          nama: sesi.name,
          catatan: instansi || null,
          status: statusLabel,
          qr:
            tampilKode && peserta
              ? { href: keTab("qr", { dari: "profil" }), label: t.ticket, kode: peserta.qr_code, petunjuk: tp.ticketHint, perbesar: tp.enlarge, gambar: <QrMini code={peserta.qr_code} alt="" /> }
              : null,
        }}
        menu={{
          judul: tp.menu,
          baris: [
            ...(adaPerjalanan ? [{ href: keTab("perjalanan"), judul: tH.tabs.perjalanan, isi: tH.travel.menuRow, Ikon: Suitcase }] : []),
            ...(adaOutfit ? [{ href: keTab("outfit"), judul: labelMenuOutfit, isi: tH.outfit.menuRow, Ikon: CoatHanger }] : []),
          ],
        }}
        data={{
          judul: tp.details,
          fakta: [
            { label: tp.name, nilai: sesi.name },
            ...((peserta?.email ?? sesi.email) ? [{ label: tp.email, nilai: peserta?.email ?? sesi.email }] : []),
            ...(peserta?.company ? [{ label: tp.company, nilai: peserta.company }] : []),
            ...(peserta?.title ? [{ label: tp.jobTitle, nilai: peserta.title }] : []),
            ...(tampilKode && peserta ? [{ label: tp.code, nilai: peserta.qr_code }] : []),
          ],
          salah: tautanTelepon ? { teks: tp.wrong, tautan: { href: tautanTelepon, label: tp.contact } } : null,
        }}
        bantuan={{
          judul: tp.help,
          baris: [
            ...(tautanTelepon ? [{ href: tautanTelepon, judul: t.contactRow, isi: [config.contact_name?.trim(), telepon].filter(Boolean).join(" · "), Ikon: Phone, luar: true }] : []),
            ...(landingEnAvailable(config) ? [{ href: `${landingPath(event.slug, lainnya, utama)}/peserta?tab=profil`, judul: tp.language, isi: t.languageRow, Ikon: Globe }] : []),
            { href: halamanAcara, judul: t.eventPageRow, isi: nama, Ikon: CalendarBlank },
          ],
        }}
        keluar={{ action: `/e/${encodeURIComponent(event.slug)}/api/peserta/keluar`, label: t.signOut }}
      />
    );
  } else {
    const statusLabel = sesi.status === "approved" ? p.status.approved : sesi.status === "rejected" ? p.status.rejected : p.status.pending;
    judulHorizon = { alis: statusLabel, judul: sesi.name, catatan: peserta ? [peserta.title, peserta.company].filter(Boolean).join(" · ") : "" };
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
    const baris: { href: string; judul: string; isi: string | null; Ikon: typeof House; luar?: boolean; pemicuQr?: string }[] = [
      ...(tampilKode && peserta ? [{ href: keTab("qr"), judul: t.ticket, isi: peserta.qr_code, Ikon: Ticket, pemicuQr: "pemicu-qr-profil" }] : []),
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
          {baris.map(({ href, judul, isi: keterangan, Ikon, luar, pemicuQr }) => (
            <li key={judul}>
              <TautanPortal href={href} luar={Boolean(luar)} pemicuQr={pemicuQr} className={`m3-state flex min-h-[72px] items-center gap-4 rounded-[16px] bg-white px-4 shadow-[0_1px_2px_rgb(16_24_40/0.06)]`}>
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

  if (horizon) {
    const tabHorizon = (id: TabHorizon["id"]): TabHorizon =>
      id === "outfit" ? { id, label: labelMenuOutfit, labelPendek: labelMenuOutfit, href: keTab(id) } : { id, label: tH.tabs[id], labelPendek: tH.tabsShort[id], href: keTab(id) };
    // Desktop: semua halaman di bilah atas (Profil lewat inisial). Ponsel: lima
    // tujuan (Beranda, Jadwal, QR, Pengumuman, Menu); Perjalanan dan Outfit dibuka dari Menu.
    const tabsHorizon = (
      ["beranda", "jadwal", ...(adaPerjalanan ? (["perjalanan"] as const) : []), ...(adaOutfit ? (["outfit"] as const) : []), "info", "profil"] as const
    ).map(tabHorizon);
    const tabsBawahHorizon = (["beranda", "jadwal", "info", "profil"] as const).map(tabHorizon);
    let badan: ReactNode;
    if (tabAktif === "beranda") {
      const namaDepan = sesi.name.trim().split(/\s+/)[0] || sesi.name;
      const tampilLogistik = diBeranda("logistics");
      const tampilTeman = diBeranda("roommates") && teman && teman.length > 0;
      const fakta: FaktaPass[] = [
        { label: tH.participant, nilai: sesi.name, ponsel: false },
        ...(tampilLogistik && kamar?.hotel?.name?.trim() ? [{ label: tH.hotel, nilai: kamar.hotel.name.trim(), ponsel: true, lebar: true }] : []),
        ...(tampilLogistik && namaBus ? [{ label: tH.bus, nilai: namaBus, ponsel: true, pendek: true }] : []),
        ...(tampilLogistik && kamar ? [{ label: tH.room, nilai: kamar.room_number, ponsel: true, pendek: true }] : []),
        ...(tampilTeman ? [{ label: tH.roommate(teman.length), nilai: teman.map((orang) => orang.name).join(", "), ponsel: false }] : []),
      ];
      // Tiket kereta: satu baris (perjalanan berikutnya) menuju halaman Perjalanan.
      const tiketBeranda = (() => {
        const tiket = logistik?.trains ?? [];
        return tiket.find((leg) => leg.depart_date && leg.depart_date >= kini.tanggal) ?? tiket.at(-1) ?? null;
      })();
      // Label hari agenda berikutnya: hari ini, besok, atau "Hari pertama".
      const hariSelanjutnya = selanjutnya ? agenda.findIndex((bagian) => bagian.items.some((butir) => butir.id === selanjutnya.item.id)) : -1;
      const labelHari = !selanjutnya
        ? null
        : selanjutnya.hari === null
          ? tH.today
          : selanjutnya.hari === t.tomorrow
            ? tH.tomorrow
            : hariSelanjutnya >= 0
              ? tH.dayOrdinal(hariSelanjutnya + 1)
              : selanjutnya.hari;
      const tampilBerikut = diBeranda("next") && selanjutnya;
      const bantuan = telepon ? { href: `tel:${telepon.replace(/[^\d+]/g, "")}`, label: tH.help } : null;
      // Pengumuman mengikuti urutan Participant home terhadap Next up (kolom
      // kanan di layar lebar) dan terhadap Bus and room (ponsel: di atas atau
      // di bawah kartu perjalanan). Urutan bawaan menaruhnya paling atas.
      const tampilPengumuman = diBeranda("announcements") && pengumuman.items.length > 0;
      const posisi = (id: string) => beranda.order.indexOf(id);
      const pengumumanDulu = posisi("announcements") < posisi("next");
      // Panduan checkpoint: kartu aksi di atas selama ada langkah tersisa, lalu turun ke bawah tiket kereta.
      const tampilCheckpoint = diBeranda("checkpoints") && checkpoint !== null;
      const checkpointAktif = tampilCheckpoint && checkpoint.done < checkpoint.steps.length;
      const checkpointSelesai = tampilCheckpoint && !checkpointAktif;
      const kartuCheckpointHorizon = checkpoint ? <KartuCheckpointHorizon data={checkpoint} lang={lang} zona={zona} qrHref={tampilKode ? keTab("qr") : null} /> : null;
      const urutanPengumuman = posisi("announcements") < posisi("logistics") ? "order-[10]" : pengumumanDulu ? "order-[45]" : "order-[55]";
      const blokPengumuman = tampilPengumuman ? (
        <BagianBeranda id="announcements" pratinjau={pratinjau}>
          <div className={`${urutanPengumuman} lg:order-none`}>{kartuPengumuman}</div>
        </BagianBeranda>
      ) : null;
      const lainnya = beranda.order.filter((id) => diBeranda(id) && kartuBlok.has(id));
      // Outfit hari ini (pola "Tonight's Attire" Royal Caribbean): satu baris
      // sesudah tiket kereta, menuju hari itu di halaman Outfit.
      const outfitBeranda = adaOutfit ? hariOutfitBeranda(hariOutfit, kini.tanggal, sekarangDi(zona, new Date(sekarang.getTime() + 864e5)).tanggal) : null;
      const barisOutfit = (() => {
        if (!outfitBeranda) return null;
        const bagian = hariOutfit[outfitBeranda.indeks];
        const [pertama, kedua] = bagian.outfit;
        const baris = tH.outfit.row;
        const alisOutfit =
          outfitBeranda.jenis === "nanti"
            ? baris.nanti(labelMenuOutfit, bagian.hari ?? bagian.sectionTitle?.trim() ?? t.day(outfitBeranda.indeks + 1))
            : baris[outfitBeranda.jenis](labelMenuOutfit);
        return (
          <div className="order-[32] lg:order-none">
            <BarisTautanHorizon
              href={keTab("outfit", { hari: String(outfitBeranda.indeks + 1) })}
              Ikon={CoatHanger}
              alis={alisOutfit}
              judul={pertama.what}
              // Isian kedua (mis. gala dinner) di bawahnya; tanpa itu, waktu isian pertama.
              catatan={(kedua ? [kedua.when, kedua.what].filter(Boolean).join(" • ") : pertama.when) || null}
            />
          </div>
        );
      })();
      badan = (
        <>
          <SapaanHorizon alis={tH.welcome} judul={tH.heading(namaDepan)} judulPonsel={tH.headingMobile(namaDepan)} catatan={tH.subtitle(jumlahHariAgenda(agenda))} />
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 pb-10 pt-6 md:px-16 md:pt-3">
            {pitaEmail || lengkapi.length > 0 ? (
              <div className="flex flex-col gap-4">
                {pitaEmail}
                <KartuLengkapi lang={lang} href={`${halamanAcara}/lengkapi`} fields={lengkapi} gaya="gathering" />
              </div>
            ) : null}
            {/* Layar lebar: kolom kiri kartu perjalanan, tiket kereta (dan checkpoint yang
                sudah selesai); kolom kanan panduan checkpoint, pengumuman, Next up. Ponsel: semua kartu satu
                tumpukan, diurutkan dengan order. */}
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,790px)_minmax(320px,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-6">
              <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
                <BagianBeranda id="logistics" pratinjau={pratinjau}>
                  <div className="order-[20] lg:order-none lg:col-start-1 lg:row-start-1">
                    <PassHorizon
                      kv={latarKv?.src ?? null}
                      label={LANDING_UI[lang].horizon.pass}
                      tanggalPendek={formatEventDateRingkas(event, lang)}
                      tanggalPanjang={formatEventDateRingkas(event, lang, false)}
                      dari={config.pass_from?.trim() || null}
                      ke={config.pass_to?.trim() || venue || nama}
                      fakta={fakta}
                      qr={
                        tampilKode && peserta
                          ? { href: keTab("qr"), label: t.qrTitle, perbesar: tH.enlargeQr, kode: <QrMini code={peserta.qr_code} alt="" /> }
                          : null
                      }
                    />
                  </div>
                  {tampilLogistik && tiketBeranda ? (
                    <div className="order-[30] lg:order-none lg:col-start-1">
                      <BarisTautanHorizon
                        href={keTab("perjalanan")}
                        Ikon={Train}
                        alis={[tH.travel.trainRow, tanggalLeg(tiketBeranda.depart_date, lang)].filter(Boolean).join(" • ")}
                        judul={ruteLeg(tiketBeranda) ?? tiketBeranda.train_name}
                        catatan={[jamLeg(tiketBeranda, lang), tH.travel.seatLine(tiketBeranda.carriage, tiketBeranda.seat)].filter(Boolean).join(" • ") || null}
                      />
                    </div>
                  ) : null}
                </BagianBeranda>
                {barisOutfit}
                {checkpointSelesai ? (
                  <BagianBeranda id="checkpoints" pratinjau={pratinjau}>
                    <div className="order-[40] lg:order-none">{kartuCheckpointHorizon}</div>
                  </BagianBeranda>
                ) : null}
              </div>
              <div className="contents min-w-0 lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-6">
                {checkpointAktif ? (
                  <BagianBeranda id="checkpoints" pratinjau={pratinjau}>
                    <div className="order-[15] lg:order-none">{kartuCheckpointHorizon}</div>
                  </BagianBeranda>
                ) : null}
                {pengumumanDulu ? blokPengumuman : null}
                <BagianBeranda id="next" pratinjau={pratinjau}>
                  {/* Tanpa agenda berikutnya hanya tautan bantuan (layar lebar) yang tersisa:
                      ponsel tidak mendapat bungkus kosong yang menambah jarak. */}
                  <div className={tampilBerikut || statusPendaftaran ? "order-[50] lg:order-none" : "order-[50] hidden md:block lg:order-none"}>
                    <SelanjutnyaHorizon
                      alis={labelHari ? `${tH.nextUp} • ${labelHari}` : tH.nextUp}
                      alisPonsel={tH.nextUpMobile}
                      judul={tampilBerikut ? selanjutnya.item.title : null}
                      baris={tampilBerikut ? [`${selanjutnya.item.time} ${singkatanZona}`, selanjutnya.hitung].filter(Boolean).join(" • ") : null}
                      catatan={tampilBerikut ? teksPolos(selanjutnya.item.subtitle) || null : null}
                      qr={null}
                      bantuan={bantuan}
                      sisipan={statusPendaftaran}
                    />
                  </div>
                </BagianBeranda>
                {pengumumanDulu ? null : blokPengumuman}
              </div>
            </div>
            {tampilTeman ? (
              <BagianBeranda id="roommates" pratinjau={pratinjau}>
                <TemanSekamarHorizon
                  judul={tH.roommateTitle(teman.length)}
                  orang={teman.map((orang) => ({ nama: orang.name, detail: [kamar ? tH.roomNo(kamar.room_number) : null, orang.company].filter(Boolean).join(" • ") || null }))}
                />
              </BagianBeranda>
            ) : null}
            {bantuan ? <BantuanPonselHorizon href={bantuan.href} label={bantuan.label} /> : null}
            {lainnya.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {lainnya.map((id) => (
                  <BagianBeranda key={id} id={id} pratinjau={pratinjau}>
                    {kartuBlok.get(id)}
                  </BagianBeranda>
                ))}
              </div>
            ) : null}
          </div>
        </>
      );
    } else {
      badan = (
        <>
          {judulHorizon ? (
            <SapaanHorizon
              alis={judulHorizon.alis}
              judul={judulHorizon.judul}
              judulPonsel={judulHorizon.judulPonsel ?? judulHorizon.judul}
              catatan={judulHorizon.catatan}
              catatanPonsel
              kembali={tabAktif === "perjalanan" || tabAktif === "outfit" ? { href: keTab("profil"), label: tH.travel.backToMenu } : null}
            />
          ) : (
            <PitaKepalaHorizon>{kepala}</PitaKepalaHorizon>
          )}
          <div className={`relative mx-auto w-full max-w-[1440px] px-6 md:px-16 ${judulHorizon ? "pt-6 md:pt-3" : "-mt-3 md:-mt-6"}`}>{isi}</div>
        </>
      );
    }
    return (
      <main className={`min-h-dvh ${tampilKode && peserta ? "pb-[calc(124px+env(safe-area-inset-bottom))]" : "pb-[calc(100px+env(safe-area-inset-bottom))]"} text-[#101E38] md:pb-16`} style={gaya}>
        <FokusPemicuQr />
        <KepalaHorizon
          logo={logo ?? config.hero_logo_url ?? null}
          nama={nama}
          homeHref={halamanAcara}
          tabs={tabsHorizon}
          aktif={tabAktif}
          inisial={inisial}
          profilLabel={tH.profileAria}
          infoBaru={infoBaru}
          tabsAria={t.tabsAria}
        />
        {badan}
        <NavBawahHorizon tabs={tabsBawahHorizon} aktif={tabAktif === "perjalanan" || tabAktif === "outfit" ? "profil" : tabAktif} tabsAria={t.tabsAria} infoBaru={infoBaru} qr={
            tampilKode && peserta
              ? {
                  href: tabAktif === "beranda" ? keTab("qr") : keTab("qr", { dari: tabAktif, ...((tabAktif === "jadwal" || tabAktif === "outfit") && hari ? { hari: String(hari) } : {}) }),
                  label: tH.showQr,
                  labelPendek: "QR",
                }
              : null
          }
        />
      </main>
    );
  }

  return (
    <main className="min-h-dvh pb-[calc(88px+env(safe-area-inset-bottom))] text-[#1A2333] lg:pb-16" style={gaya}>
      <FokusPemicuQr />
      {/* ---- Bilah atas: sama dengan halaman acara ------------------------- */}
      {/* `data-halaman-publik` memberi jarak huruf halaman acara pada bilah saja;
          `contents` agar bilah tetap lengket terhadap <main>. Tidak dipasang di
          <main> karena bilah memakai `main[data-halaman-publik] section[id]`
          untuk penanda bagian aktif halaman acara. */}
      <div data-halaman-publik className="contents">
      <LandingNavModern
        eventName={nama}
        daftarUrl={`${halamanAcara}/daftar`}
        registrationOpen={false}
        sections={menuAtas}
        sectionBase={halamanAcara}
        homeHref={halamanAcara}
        width={config.nav?.width ?? "full"}
        logoUrl={logo}
        logoOnDark={logoNavPutih(config.nav, Boolean(config.banner_url))}
        lang={lang}
        langSwitch={landingEnAvailable(config) ? { href: `${landingPath(event.slug, lainnya, utama)}/peserta${tabAktif === "beranda" ? "" : `?tab=${tabAktif}`}`, lang: lainnya } : null}
        peserta={navPeserta}
        dashboardAktif
        gathering={{ tanda: inisialAcara(nama), sub: subNama }}
      />
      </div>

      {/* ---- Kepala: gradasi dan KV yang sama dengan hero halaman acara ------
          Ditarik ke bawah bilah (margin negatif setinggi `--nav-h`) seperti
          hero halaman acara, supaya bilah bening berdiri di atas hero, bukan
          di atas latar abu-abu muda halaman. */}
      <div data-landing-hero className="relative isolate -mt-[var(--nav-h)] overflow-hidden text-white" style={{ ...latarKv?.warnaHero, ...latarKv?.warnaPortal, background: latarKv?.latar ?? LATAR_HERO }}>
        {latarKv ? <LatarKv src={latarKv.src} kuat={latarKv.kuat} bayang={Math.max(latarKv.bayang.hero, latarKv.bayang.portal)} utuhDiPonsel /> : null}
        <div className={`${SHELL} pb-12 pt-[calc(var(--nav-h)+24px)] lg:pb-[72px] lg:pt-[calc(var(--nav-h)+40px)]`}>
          {/* Tab portal layar lebar; ponsel memakai bilah tab bawah. */}
          <nav aria-label={t.tabsAria} className="mb-8 hidden lg:mb-12 lg:block">
            <ul className="flex flex-wrap gap-2">
              {menuTab.map(({ id, label }) => (
                <li key={id}>
                  <Link
                    href={keTab(id)}
                    aria-current={id === tabAktif ? "page" : undefined}
                    className={`m3-state inline-flex min-h-12 items-center rounded-full px-5 text-[14px] font-bold ${
                      id === tabAktif ? "bg-white text-[#1A2333]" : "bg-white/10 text-white"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {kepala}
        </div>
      </div>

      {/* Kepala ber-KV menjadi lapisan tersendiri (relative): isi yang menumpang
          di tepi bawahnya harus ikut berlapis supaya tetap di atasnya. */}
      <div className={`relative ${SHELL} -mt-3 lg:-mt-6`}>{isi}</div>

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

/** "Kam, 5 Nov" (id) atau "Thu, 5 Nov" (en), dalam zona acara. */
function hariHorizon(iso: string, zona: EventTimeZone, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)).replace(/\.(?=\s|$)/g, "");
}

/** "14.00" (id) atau "14:00" (en), dalam zona acara. */
function jamHorizon(iso: string, zona: EventTimeZone, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** "Kam, 5 Nov • 14.00" (id) atau "Thu, 5 Nov • 14:00" (en). */
function hariJamHorizon(iso: string, zona: EventTimeZone, lang: LandingLang): string {
  return `${hariHorizon(iso, zona, lang)} • ${jamHorizon(iso, zona, lang)}`;
}

/** "6 November" untuk label bab Horizon. */
function tanggalBab(tanggal: string, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${tanggal}T00:00:00Z`));
}

/** "Jumat, 6 November 2026" untuk judul hari di halaman Jadwal Horizon. */
function tanggalPanjangBab(tanggal: string, lang: LandingLang): string {
  return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function JudulKepala({ judul, catatan }: { judul: string; catatan: string | null }) {
  return (
    <div>
      <h1 className={`${HEAD} text-[28px] font-extrabold leading-tight tracking-[-0.02em] lg:text-[40px]`}>{judul}</h1>
      {catatan ? <p className="mt-1 text-body-medium opacity-85">{catatan}</p> : null}
    </div>
  );
}

function Chip({ nada, children }: { nada: "aksi" | "brand" | "aksen"; children: ReactNode }) {
  // Teks chip dihitung terhadap latar chip itu sendiri (gatheringColors).
  const warna =
    nada === "aksi"
      ? "bg-[var(--chip-aksi)] text-[var(--on-chip-aksi)]"
      : nada === "aksen"
        ? "bg-[var(--chip-aksen)] text-[var(--on-chip-aksen)]"
        : "bg-[var(--chip-merek)] text-[var(--on-chip-merek)]";
  return <span className={`inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-bold ${warna}`}>{children}</span>;
}

function KartuAngka({
  id,
  Ikon,
  ikonWarna,
  label,
  angka,
  catatan,
  children,
}: {
  id: string;
  Ikon: typeof House;
  ikonWarna: "brand" | "aksen";
  label: string;
  angka: string;
  catatan: string | null;
  children?: ReactNode;
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
      {children}
    </section>
  );
}

function TautanPortal({ href, luar, className, children, pemicuQr }: { href: string; luar: boolean; className: string; children: ReactNode; pemicuQr?: string }) {
  if (pemicuQr) {
    return (
      <PemicuQr id={pemicuQr} href={href} className={className}>
        {children}
      </PemicuQr>
    );
  }
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

