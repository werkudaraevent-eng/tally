import { Fragment, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  Bed,
  Bell,
  Bus,
  CalendarBlank,
  CalendarCheck,
  CaretRight,
  CheckCircle,
  CoatHanger,
  EnvelopeSimple,
  Flag,
  Globe,
  House,
  Hourglass,
  Lifebuoy,
  MapPin,
  Megaphone,
  Headset,
  Phone,
  PushPin,
  SignOut,
  Suitcase,
  Train,
  Ticket,
  User,
  Users,
  X,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { EventLandingConfig, EventRow, LandingMemberConfig } from "@/lib/domain";
import { daftarKontakPanitia, kontakPanitia, telHref } from "@/lib/kontak-panitia";
import { saringBlokPeserta } from "@/lib/sasaran-blok-server";
import { bacaTautanAgenda } from "@/lib/sasaran-blok";
import { logoNavPutih, isPortalEntry, landingBlockMemberOnly, landingMemberBlocks, memberHomeOrder, normalizeLandingSections, publicEventName, susunanDenganPortal } from "@/lib/domain";
import { urutanHorizon } from "@/lib/member/susunan-horizon";
import { DaftarRuteRingkas, KartuRute } from "@/components/landing/modern/blok-rute";
import { BukaRuteDariHash } from "@/components/member/buka-rute-dari-hash";
import { KartuHitungMundur } from "@/components/landing/modern/landing-blocks";
import { BagianBeranda } from "@/components/member/bagian-beranda";
import { KartuBlok } from "@/components/member/kartu-blok";
import { formatEventDate, formatEventDateRingkas, formatEventSchedule } from "@/lib/event-datetime";
import { loadAgendaPreview, type AgendaItem, type AgendaPreview } from "@/lib/landing-agenda";
import { LANDING_LANG_LABELS, LANDING_UI, labelTautanPeta, landingDefaultLang, landingEnAvailable, landingPath, resolveLanding, withQuery, type LandingLang } from "@/lib/landing-i18n";
import { PESERTA_UI } from "@/lib/member/peserta-i18n";
import { PORTAL_UI } from "@/lib/member/portal-i18n";
import type { MemberSession } from "@/lib/member/account";
import { inisialNama, muatNavPeserta, namaSapaan, waktuPengumuman } from "@/lib/member/nav";
import { isUnread, type MemberAnnouncements } from "@/lib/member/pengumuman";
import { bantuanBahasa, barisKontakDarurat } from "@/lib/member/kontak-darurat";
import { nomorKru } from "@/lib/logistik/kontak-kru";
import { jenisKamar } from "@/lib/logistik/nama-kamar";
import { agendaBerikutnya, loadMemberLogistics, urutWaktuBerangkat, type LogistikKamar, type LogistikPeserta } from "@/lib/logistik/peserta";
import { bagasiPeserta } from "@/lib/bagasi/server";
import { FotoBagasi } from "@/components/member/foto-bagasi";
import { KartuKereta, KontakKru } from "@/components/member/kartu-logistik";
import { KartuCheckpoint } from "@/components/member/kartu-checkpoint";
import { KartuCheckpointHorizon } from "@/components/member/kartu-checkpoint-horizon";
import { loadCheckpointPeserta, loadCheckpointQr } from "@/lib/checkpoint/server";
import { gatheringColors, kvGathering, latarGathering } from "@/lib/registration-theme-css";
import { loadLandingLodging } from "@/lib/landing-hotel";
import { oldSlugsFor } from "@/lib/slug-lama-peta";
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
import { HORIZON_GOLD_DEFAULT, sorotHorizon } from "@/lib/landing-tokens";
import { gayaHorizon } from "@/components/landing/modern/horizon";
import {
  ChipTanggalHorizon,
  GARIS_KARTU,
  HariJadwalHorizon,
  KartuBantuanBeranda,
  ikonJenisDarurat,
  KartuBantuanHorizon,
  KartuDaruratHorizon,
  KartuInfoHorizon,
  LATAR_STRIP,
  KartuOutfitHorizon,
  KartuPengumumanHorizon,
  KepalaHorizon,
  KontakKruHorizon,
  LATAR_PORTAL_HORIZON,
  LipatanHorizon,
  NavBawahHorizon,
  PassHorizon,
  ProfilHorizon,
  IdentitasProfilHorizon,
  DataDiriHorizon,
  type UbinProfil,
  PerjalananBusHorizon,
  PitaKepalaHorizon,
  SapaanHorizon,
  SegmenBagianHorizon,
  KartuRingkasOutfit,
  TiketKeretaHorizon,
  TombolKontakHorizon,
  type FaktaPass,
  type KontakPanitiaHorizon,
  type LegKereta,
  type TabHorizon,
} from "@/components/member/portal-horizon";
import { LompatPerjalanan } from "@/components/member/lompat-perjalanan";
import { GulirKeHash } from "@/components/member/gulir-ke-hash";
import { jamLeg, jamTiket, legSelesai, ruteLeg, tanggalLeg } from "@/lib/logistik/kereta-tampil";
import { kelompokkanHari, menitDari, ringkasanBeranda, statusHari, tanpaLabelBagian, type StatusButir } from "@/lib/member/hari-agenda";
import { legBerikutnya, pencocokBarisTrip, tripUntukBaris } from "@/lib/member/trip-jadwal";
import { rentangPerjalanan } from "@/lib/member/rentang-perjalanan";
import { faseBeranda } from "@/lib/member/fase-beranda";
import { KartuOutfitBerandaHorizon, KartuPerjalananmuHorizon, KartuQrSampingHorizon, KartuSekarangHorizon } from "@/components/member/beranda-horizon";
import { jenisBlokDarurat } from "@/lib/member/blok-darurat";
import { HtmlLang } from "@/components/html-lang";
import { AgendaHariTrip, BagianTrip, BerikutnyaTrip, HariTrip, PengumumanTrip, KartuHotelTrip, KartuPesertaTrip, PerjalananmuTrip, RencanaTrip, TiketKeretaTrip, type BarisBerikutTrip } from "@/components/member/portal-trip";
import { rencanaTrip } from "@/lib/member/rencana-trip";
import { gabungMeta } from "@/lib/typography";
import { QrHorizon } from "@/components/member/qr-horizon";
import { PenyediaQr, PesanLuringQr, StatusQrHalaman, TombolPindaiQr, type DataLapisanQr } from "@/components/member/lapisan-qr";
import { HapusSalinanQr } from "@/components/member/form-keluar";
import { SimpanQrGaleri } from "@/components/member/simpan-qr-galeri";
import { KerangkaPortal, PenandaTab, type KepalaTab } from "@/components/member/muat-portal";
import { TandaiPengumumanDibaca } from "@/components/member/tandai-pengumuman";
import { bagianOutfitTanggal, labelOutfit, type OutfitEntry } from "@/lib/outfit";
import { loadOutfitBagian } from "@/lib/outfit-server";
import { apaRingkas, fotoRingkas, kapanOutfit, outfitTerlihat } from "@/lib/outfit";
import { bacaOutfitSetiapHari, denganSetiapHari, hariOutfitBerandaSetiapHari, hariTanpaAgenda } from "@/lib/outfit-setiap-hari";
import { bagianPertama, pilihanPeserta } from "@/lib/sasaran-bagian";
import { loadSasaranPeserta } from "@/lib/sasaran-bagian-server";

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
  lihat = null,
  pratinjau = false,
  waktuPratinjau = null,
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
  /** Halaman di dalam Profil Horizon (`?lihat=`): "data" = Data diri. */
  lihat?: "data" | null;
  /** Pratinjau di Participant area: tiap isi Beranda diberi penanda untuk digulir ke sana. */
  pratinjau?: boolean;
  /** Pratinjau saja: saat yang dipilih di "Preview on" (ms epoch); tanpa itu, saat ini. */
  waktuPratinjau?: number | null;
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
  // Tema Gathering Trip (keputusan Mas 28 Okt 2026): Horizon dengan halaman bergaya aplikasi perjalanan.
  const trip = horizon && config.horizon_style === "trip";

  const zona = normalizeTimeZone(event.time_zone);
  const singkatanZona = timeZoneAbbr(zona);
  const sekarang = pratinjau && waktuPratinjau ? new Date(waktuPratinjau) : new Date();
  const kini = sekarangDi(zona, sekarang);
  const gaya = gayaPortal(config, horizon);
  const peserta = sesi.participant;
  const tampilKode = Boolean(peserta) && member.show_code !== false;
  const nama = publicEventName(event);
  const tH = t.horizon;

  // QR Horizon dari muat ulang atau tautan langsung: hanya kode, nama, dan bus
  // (U-02, U-10). Agenda, penginapan, dan nav tidak ditunggu, karena QR
  // dibutuhkan di gerbang, saat itu juga. Dari dalam portal, QR dibuka lapisan
  // QR klien tanpa ke server sama sekali.
  if (tabDiminta === "qr" && horizon && tampilKode && peserta) {
    const [logistikQr, { setelan: setelanCheckpoint, pindai }, sasaranQr] = await Promise.all([
      loadMemberLogistics(event.id, peserta.id, member.show_logistics === true, undefined, true),
      loadCheckpointQr(event.id),
      // Sama dengan lapisan QR di dalam portal: kelompok hanya bila Jadwal ditampilkan.
      member.show_schedule !== false ? loadSasaranPeserta(event.id, peserta.id) : null,
    ]);
    const tutupQr = dari ? keTab(dari, (dari === "jadwal" || dari === "outfit") && hari ? { hari: String(hari) } : {}) : keTab("beranda");
    const busQr = logistikQr ? namaBusPeserta(logistikQr, sekarang) : null;
    // "Batch 2 · Bus 3" di bawah nama (E-10): kelompok dari kolom yang dipakai Agenda > Who it's for.
    const pilQr = labelPil((sasaranQr ? pilihanPeserta([...sasaranQr.sasaran.values()], sasaranQr.jawaban).kelompok : null), busQr, tH.bus);
    const dataQr = dataLapisanQr(busQr, pilQr);
    return (
      <main lang={LANDING_LANG_LABELS[lang].htmlLang} className="min-h-dvh" style={{ ...gaya, "--cincin-fokus": "var(--hz-cincin-navy)", backgroundColor: "var(--hz-navy)", color: "#ffffff" } as CSSProperties}>
        <HtmlLang lang={LANDING_LANG_LABELS[lang].htmlLang} />
        <TutupQrEscape href={tutupQr} />
        <QrHorizon
          judul={t.qrTitle}
          baris={dataQr.baris}
          tutup={
            <Link href={tutupQr} aria-label={t.qrClose} className="m3-state flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10">
              <X size={18} weight="bold" aria-hidden />
            </Link>
          }
          luring={<PesanLuringQr teks={dataQr.teks} />}
          nama={peserta.name}
          sub={dataQr.sub}
          pil={pilQr}
          kartuKode={<RegistrationCodeCard code={peserta.qr_code} eventName={nama} personName={peserta.name} schedule={formatEventSchedule(event, lang)} lang={lang} horizon teksHorizon={{ kode: tH.qr.codeLabel, simpan: tH.qr.save }} />}
          petunjuk={t.qrShow}
          petunjukCatatan={setelanCheckpoint?.enabled ? tH.qr.showNoteCheckpoint : tH.qr.showNote}
          status={<StatusQrHalaman data={dataQr} />}
          kecerahan={t.qrBrightness}
          aksi={pindai ? <TombolPindaiQr slug={event.slug} lang={lang} kePortal={tutupQr} /> : null}
        />
      </main>
    );
  }

  /** Data lapisan QR (dan halaman QR luring): dari kode yang sudah ada di halaman. */
  function dataLapisanQr(bus: string | null = null, pil: string | null = bus ? labelBus(bus, tH.bus) : null): DataLapisanQr {
    const q = tH.qr;
    return {
      lang,
      kode: peserta?.qr_code ?? "",
      nama: peserta?.name ?? sesi.name,
      sub: peserta ? gabungMeta([peserta.title, peserta.company]) || null : null,
      pil,
      acara: nama,
      jadwal: formatEventSchedule(event, lang),
      baris: gabungMeta([nama, formatEventDateRingkas(event, lang)]) || null,
      zona,
      teks: {
        judul: t.qrTitle,
        tutup: t.qrClose,
        petunjuk: t.qrShow,
        petunjukCatatan: q.showNote,
        kecerahan: t.qrBrightness,
        kode: q.codeLabel,
        simpan: q.save,
        tersimpan: q.saved,
        tersimpanPada: q.savedAt("{waktu}"),
        layarMenyala: q.awake,
        luring: q.offline,
        luringCatatan: q.offlineNote,
        tampilkanQr: q.showQr,
        cobaLagi: q.retry,
      },
      luring: { sw: `${landingPath(event.slug, utama, utama)}/peserta-sw.js`, lingkup: dasar },
      pindai: null,
    };
  }

  const tampilSusunan = member.show_schedule !== false;
  // Who sees it per baris Agenda: baris bersyarat hanya untuk peserta yang cocok.
  const penonton = { acara: event, participantId: peserta?.id ?? null, tampilKamar: member.show_logistics === true };
  // Outfit per bagian Agenda (kolom rundown_sections.outfit): hanya Horizon,
  // kueri sendiri yang kembali kosong sebelum migrasinya dijalankan.
  const [agenda, petaOutfit, sasaranPeserta, slugLama] = await Promise.all([
    tampilSusunan ? loadAgendaPreview(event.id, lang, penonton) : [],
    horizon ? loadOutfitBagian(event.id) : null,
    // Untuk siapa tiap bagian (Agenda > Who it's for): Horizon, peserta yang sudah
    // disetujui. Juga saat Jadwal disembunyikan: Outfit tetap ikut batch peserta.
    horizon && peserta ? loadSasaranPeserta(event.id, peserta.id) : null,
    pratinjau ? [] : oldSlugsFor(event.id),
  ]);
  // Lingkup salinan QR luring kedua bahasa portal, juga di bawah slug lama
  // acara ini (src/lib/slug-lama.ts): dihapus saat Keluar atau tanpa QR.
  const lingkupQr = [event.slug, ...slugLama].flatMap((slug) => [`${landingPath(slug, "id", utama)}/peserta`, `${landingPath(slug, "en", utama)}/peserta`]);
  // Bagian milik peserta dan yang bukan (U-01 langkah 2). Tanpa sasaran atau
  // tanpa jawaban: kosong, jadi Beranda dan Jadwal sama seperti sebelumnya.
  const pilihanKu = pilihanPeserta(
    agenda.map((bagian) => (bagian.id !== undefined ? (sasaranPeserta?.sasaran.get(bagian.id) ?? null) : null)),
    sasaranPeserta?.jawaban ?? {},
  );
  const agendaNav = tampilSusunan ? agenda : await loadAgendaPreview(event.id, lang, penonton);
  // Hari Outfit = hari tab Jadwal (bagian yang diterbitkan dan berisi), juga bila Jadwal disembunyikan.
  // Dress code yang ditautkan ke baris hanya tampil bila baris itu tampil untuk
  // peserta ini: baris yang disembunyikan (Published mati, atau Who
  // sees it tidak cocok) tidak boleh bocor lewat teks waktunya. `item_id` tidak
  // ikut ke halaman.
  const hariOutfit = petaOutfit
    ? agendaNav.map((bagian) => ({ ...bagian, outfit: outfitTerlihat((bagian.id !== undefined ? petaOutfit.get(bagian.id) : undefined) ?? [], bagian.items) }))
    : [];
  // Dresscode Setiap hari dari Participant area (keputusan Mas 21 Okt): ada di
  // setiap hari, juga di acara tanpa tab Agenda. Hanya Horizon, seperti Outfit.
  const setiapHari = horizon ? bacaOutfitSetiapHari(member.outfit_every_day) : null;
  const adaOutfit = hariOutfit.some((bagian) => bagian.outfit.length > 0) || setiapHari !== null;
  // Baris satu bagian seperti yang dilihat peserta, Setiap hari di depan. Bagian
  // tiap tanggal tetap dipilih dari barisnya sendiri (bagianOutfitTanggal).
  const outfitTampil = (indeks: number) => denganSetiapHari(hariOutfit[indeks]?.outfit ?? [], setiapHari, tH.outfit.everyDay);
  // Bagian milik peserta untuk Outfit (keputusan Mas 20 Okt: ikut batch), dari
  // hari Outfit, bukan dari agenda Jadwal yang kosong bila Jadwal disembunyikan.
  const pilihanOutfit = pilihanPeserta(
    hariOutfit.map((bagian) => (bagian.id !== undefined ? (sasaranPeserta?.sasaran.get(bagian.id) ?? null) : null)),
    sasaranPeserta?.jawaban ?? {},
  );
  // Outfit bagian dari Susunan acara (strip per hari, tab Acara menyala). Bila
  // panitia menyembunyikan Jadwal, Acara kosong: Outfit tetap di Menu dan bilah
  // atas seperti sebelumnya, supaya halamannya tetap terjangkau. Begitu pula
  // acara tanpa tab Agenda yang hanya punya Setiap hari: tidak ada hari untuk stripnya.
  const outfitDiAcara = tampilSusunan && !(setiapHari && hariOutfit.length === 0);
  const labelOutfitHalaman = labelOutfit(member.outfit_label);
  const tab: PortalTab =
    (!horizon && tabDiminta === "perjalanan") || (tabDiminta === "outfit" && !adaOutfit) ? "beranda" : tabDiminta;
  // Kartu Lengkapi data hanya di Beranda. Pratinjau admin: semua pertanyaannya.
  const lengkapi = tab !== "beranda" && tab !== "qr" ? [] : pratinjau ? updatableFields(asli) : await kartuLengkapi(asli, peserta?.id);
  // Checkpoint (Check-in > Checkpoints): hanya Beranda, hanya bila dinyalakan
  // dan tidak disembunyikan di Participant home.
  const [logistik, checkpoint, checkpointQr, bagasi] = peserta
    ? await Promise.all([
        loadMemberLogistics(event.id, peserta.id, member.show_logistics === true, { plate: member.show_bus_plate === true, crew: member.show_bus_crew === true }),
        (tab === "beranda" || (horizon && tab === "profil")) && !(member.home?.hidden ?? []).includes("checkpoints") ? loadCheckpointPeserta(event.id, peserta.id, lang, penonton) : null,
        // Petunjuk layar QR menyebut checkpoint hanya bila fiturnya menyala.
        horizon && tampilKode ? loadCheckpointQr(event.id) : null,
        // Bagasi yang dicatat di meja bagasi (Check-in > Sessions > Record
        // luggage), di Perjalanan. Tautan fotonya hanya dibuat di tab itu.
        horizon ? bagasiPeserta(event.id, peserta.id, tab === "perjalanan").catch(() => []) : [],
      ])
    : [null, null, null, []];
  const setelanCheckpoint = checkpointQr?.setelan ?? null;

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
  // Who sees it (src/lib/sasaran-blok.ts): blok bersasaran hanya untuk peserta yang cocok.
  const blokPeserta = await saringBlokPeserta(landingMemberBlocks(config.sections, config.blocks, hotelIds), event, peserta?.id ?? null, member.show_logistics === true);
  // Kartu darurat dan bantuan (E-03): blok Columns khusus peserta pilihan
  // panitia, di Menu tepat di bawah Perjalanan dan ditaut dari kartu bantuan
  // Perjalanan, jadi tidak ikut di Beranda. Jenis lain tidak punya baris yang
  // bisa dibaca kartunya (lib/member/blok-darurat.ts), jadi tetap di Beranda.
  const blokDarurat = horizon && member.help_block
    ? (blokPeserta.find((block) => block.id === member.help_block && landingBlockMemberOnly(block) && jenisBlokDarurat(block.type)) ?? null)
    : null;
  // Kontak yang diisi langsung di Participant area > Emergency and help
  // menggantikan blok lama; blok tetap dipakai selama kontaknya kosong.
  const bantuan = bantuanBahasa(member.help, lang);
  const kontakDarurat = horizon ? barisKontakDarurat(bantuan?.contacts) : [];
  const pakaiKontak = kontakDarurat.length > 0;
  const adaDarurat = pakaiKontak || Boolean(blokDarurat);
  const judulDarurat = (pakaiKontak ? bantuan?.title?.trim() : blokDarurat?.heading?.trim()) || tH.emergency;
  const tokensTema = landingTokens(config, "modern");
  const warnaTema = { brand: tokensTema.brand, accent: tokensTema.accent ?? null };
  const kartuBlok = new Map(
    blokPeserta.filter((block) => block.id !== blokDarurat?.id).map((block) => [
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
  // Mata Participant home dibaca dari simpanan apa adanya: Horizon punya isi yang
  // tidak dikenal Gathering klasik (Today's outfit, Help card).
  const tersembunyiBeranda = new Set(member.home?.hidden ?? []);
  const diBeranda = (id: string) => !tersembunyiBeranda.has(id);
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

  // Horizon: Berlangsung dan Berikutnya dari semua bagian hari itu (U-01, U-05, E-06).
  const besokTanggal = sekarangDi(zona, new Date(sekarang.getTime() + 864e5)).tanggal;
  const ringkasan = ringkasanBeranda(agenda, kini.tanggal, besokTanggal, kini.menit, pilihanKu.bukanMilik);
  // Hubungi panitia (U-07): Telepon dan WhatsApp dari Kontak panitia; email bila tanpa nomor.
  const kontakAcara = kontakPanitia(config);
  const nomorPanitia = kontakAcara?.telepon ? nomorKru(kontakAcara.telepon) : null;
  const kontakHorizon: KontakPanitiaHorizon | null =
    kontakAcara && (kontakAcara.telepon || kontakAcara.email)
      ? { tel: kontakAcara.telepon ? (nomorPanitia?.tel ?? kontakAcara.telepon.replace(/[^\d+]/g, "")) : null, wa: nomorPanitia?.wa ?? null, email: kontakAcara.email }
      : null;
  const labelKontak = { call: tH.travel.call, whatsapp: tH.travel.whatsapp, email: tH.helpCard.email };
  // Kepala Jadwal Horizon: satu bentuk tanggal dan satu catatan zona waktu (U-24).
  // Rancangan 20 Okt: rentang tanggal dan tempat di alis, zona waktu di catatan.
  const alisJadwal = gabungMeta([formatEventDateRingkas(event, lang, false) ?? tanggal, venue]);
  const catatanJadwal = tH.home.timeNote(singkatanZona);

  const tautanCepat = [
    ...(tampilKode ? [{ href: keTab("qr"), label: t.quick.tiket, Ikon: Ticket, warna: "text-[var(--alis)]", luar: false, pemicuQr: "pemicu-qr-cepat" }] : []),
    ...(petaUrl ? [{ href: petaUrl, label: t.quick.peta, Ikon: MapPin, warna: "text-[var(--reg-brand)]", luar: true }] : []),
    ...(telepon ? [{ href: `tel:${telepon.replace(/[^\d+]/g, "")}`, label: t.quick.panitia, Ikon: Phone, warna: "text-[var(--aksen-teks)]", luar: true }] : []),
  ];

  // `pendek`: label bilah bawah ponsel, satu baris di 360 px (sama dengan Horizon).
  const menuTab: { id: Exclude<PortalTab, "qr">; label: string; pendek?: string; Ikon: typeof House }[] = [
    { id: "beranda", label: t.tabs.beranda, Ikon: House },
    { id: "jadwal", label: t.tabs.jadwal, pendek: t.horizon.tabsShort.jadwal, Ikon: CalendarBlank },
    { id: "info", label: t.tabs.info, Ikon: Bell },
    { id: "profil", label: t.tabs.profil, Ikon: User },
  ];

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
  // Peserta melihat perjalanannya urut waktu, apa pun urutan Trips di Logistics.
  const perjalananBusHorizon = urutWaktuBerangkat((logistik?.transport?.trips ?? []).filter((trip) => trip.bus));
  // Lebih dari satu kendaraan di perjalanan peserta: tiap perjalanan menyebut kendaraannya sendiri.
  const banyakKendaraan = new Set(perjalananBusHorizon.map((trip) => trip.bus)).size > 1;
  const adaPerjalanan = horizon && Boolean(kamar || namaBus || perjalananBusHorizon.length > 0 || (logistik?.trains.length ?? 0) > 0 || bagasi.length > 0);
  // Semua rute tinggal di Perjalanan sebagai baris ringkas di bawah kartu
  // hotel, bus, dan kereta, seperti "Getting there" di halaman reservasi.
  // Tanpa tab Perjalanan (peserta tanpa kamar, bus, atau kereta) tetap di
  // Beranda. Mata di Participant home tetap menyembunyikannya.
  const rutePerjalanan = adaPerjalanan
    ? blokPeserta.filter((block) => block.type === "route" && kartuBlok.has(block.id) && diBeranda(block.id))
    : [];
  const idRutePerjalanan = new Set<string>(rutePerjalanan.map((block) => block.id));
  // Baris Agenda > rute pertama yang menautkannya ("Cara ke sana").
  const ruteBaris = new Map<number, string>();
  for (const block of rutePerjalanan) for (const id of bacaTautanAgenda(block.agenda_item_ids)) if (!ruteBaris.has(id)) ruteBaris.set(id, block.id);

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
      // Hotel saja: nama hotel jadi isi utama kartu, nomor kamar menyusul.
      angka={kamar.room_number ?? kamar.hotel.name}
      catatan={kamar.room_number === null ? t.roomPending
        : teman && teman.length > 0 ? t.withRoommate(teman.map((orang) => orang.name).join(", ")) : [kamar.floor ? t.floor(kamar.floor) : null, jenisKamar(kamar)].filter(Boolean).join(" · ") || kamar.hotel.name}
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
                <p className={`text-body-medium ${MUTED}`}>{[orang.company, kamar?.room_number ? t.room(kamar.room_number) : null].filter(Boolean).join(" · ")}</p>
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
      arah: gabungMeta([tiket.direction === "outbound" ? tH.train.outbound : tH.train.return, tanggalLeg(tiket.depart_date, lang)]),
      judul: rute ?? tiket.train_name,
      baris: gabungMeta([rute ? tiket.train_name : null, tiket.travel_class]) || null,
      jam: jamLeg(tiket, lang),
      dari: tiket.origin?.trim() || null,
      ke: tiket.destination?.trim() || null,
      berangkat: jamTiket(tiket.depart_time, lang),
      tiba: jamTiket(tiket.arrive_time, lang),
      gerbong: tiket.carriage,
      kursi: tiket.seat,
      kode: tiket.booking_code,
    };
  });

  const kartuCheckpoint = () => (checkpoint ? <KartuCheckpoint data={checkpoint} lang={lang} zona={zona} gaya="gathering" qrHref={tampilKode ? keTab("qr") : null} slug={event.slug} /> : null);

  const bagianBeranda = agenda[indeksBeranda];
  const kartuRundown = bagianBeranda ? (
    <section aria-labelledby="rundown-judul" className={KARTU}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="rundown-judul" className="text-title-large font-bold">
          {indeksHariIni >= 0 ? t.todayRundown : bagianBeranda.sectionTitle?.trim() || t.dayRundown(indeksBeranda + 1)}
        </h2>
        {agenda.length > 1 ? (
          <Link href={keTab("jadwal", { hari: String(indeksBeranda + 1) })} className="inline-flex min-h-12 shrink-0 items-center text-title-small font-bold text-[var(--alis)]">
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
  let judulHorizon: { alis: string; judul: string; judulPonsel?: string; catatan: string; kembali?: { href: string; label: string; semua?: boolean; tab?: string } } | null = null;
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
  } else if (tabAktif === "jadwal" && horizon) {
    // Horizon: hari dibentuk dari TANGGAL (U-06); bagian di hari yang sama
    // (Batch 1 dan 2) dipilih dengan kontrol segmen (U-01). `?hari=` tetap
    // urutan bagian, jadi tautan lama tetap membuka bagian yang sama.
    const hariJadwal = kelompokkanHari(agenda);
    // Tiap hari dibuka di bagian milik peserta (Agenda > Who it's for), lalu yang untuk semua.
    const bukaHari = (item: (typeof hariJadwal)[number]) => bagianPertama(item.bagian.map((isi) => isi.indeks), pilihanKu) ?? item.bagian[0].indeks;
    const hariIniJadwal = hariJadwal.find((item) => item.tanggal === kini.tanggal);
    // Tanpa ?hari: hari ini bila hari acara, selain itu hari pertama; keduanya di bagian milik peserta.
    const hariAwal = hariIniJadwal ?? hariJadwal[0];
    const pilihan = Math.min(Math.max((hari ?? (hariAwal ? bukaHari(hariAwal) + 1 : 1)) - 1, 0), Math.max(agenda.length - 1, 0));
    const bagian: AgendaPreview | undefined = agenda[pilihan];
    const outfitHari = outfitTampil(pilihan);
    const hariTerpilih = hariJadwal.find((item) => item.bagian.some((isi) => isi.indeks === pilihan));
    const labelTerpilih = hariTerpilih?.bagian.find((isi) => isi.indeks === pilihan)?.label ?? null;
    const statusBagian = bagian && bagian.tanggal === kini.tanggal ? statusHari(bagian.items, kini.menit) : new Map<number, StatusButir>();
    const hrefBagian = (indeks: number) => keTab("jadwal", { hari: String(indeks + 1) });
    // Satu bentuk tanggal dan satu catatan zona waktu untuk seluruh halaman (U-24).
    judulHorizon = { alis: alisJadwal || nama, judul: t.schedule, catatan: catatanJadwal };
    // Perjalanan bus peserta di butir ini: tautan ke Perjalanan (U-08). Trip yang
    // ditautkan ke baris Agenda menunjuk barisnya lewat id; trip tanpa tautan
    // tetap lewat tanggal dan jam yang sama.
    const barisTrip = pencocokBarisTrip(logistik?.transport?.trips ?? [], (iso) => sekarangDi(zona, new Date(iso)));
    const adaTrip = (tanggalBagian: string | null, item: AgendaItem) => adaPerjalanan && barisTrip(tanggalBagian, item);
    isi =
      agenda.length === 0 ? (
        <p className={`${KARTU} text-body-large ${MUTED}`}>{t.noSchedule}</p>
      ) : (
        <div className={hariJadwal.length > 1 ? (trip ? "w-full lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-8" : "w-full lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14") : "w-full"}>
          {hariJadwal.length > 1 && trip ? (
            <HariTrip
              aria={t.daysAria}
              hari={hariJadwal.map((item, urutan) => {
                const indeks = bukaHari(item);
                // Judul bagian yang hanya mengulang tanggal ("Kamis, 05 November 2026") tidak ditulis lagi.
                const judulMentah = tanpaLabelBagian(agenda[item.bagian[0].indeks].sectionTitle?.trim() || "", item.bagian[0].label) || null;
                const namaHari = item.tanggal ? tanggalKartuHari(item.tanggal, lang).split(",")[0].toLowerCase() : null;
                const judulBagian = judulMentah && namaHari && judulMentah.toLowerCase().includes(namaHari) ? null : judulMentah;
                const jumlah = agenda[indeks].items.filter((butir) => !butir.jeda).length;
                return {
                  href: hrefBagian(indeks),
                  atas: item.tanggal ? chipTanggal(item.tanggal, lang).atas : "",
                  angka: item.tanggal ? String(Number(item.tanggal.slice(8, 10))) : String(urutan + 1),
                  judul: item.tanggal ? tanggalKartuHari(item.tanggal, lang) : judulBagian || t.day(urutan + 1),
                  catatan: gabungMeta([item.tanggal ? judulBagian : null, jumlah > 0 ? tH.trip.activities(jumlah) : null]) || null,
                  aktif: item === hariTerpilih,
                };
              })}
            />
          ) : hariJadwal.length > 1 ? (
            <HariJadwalHorizon
              aria={t.daysAria}
              hari={hariJadwal.map((item, urutan) => ({
                label: [String(urutan + 1).padStart(2, "0"), item.tanggal ? tanggalBab(item.tanggal, lang) : null].filter(Boolean).join(" / "),
                judul: tanpaLabelBagian(agenda[item.bagian[0].indeks].sectionTitle?.trim() || t.day(urutan + 1), item.bagian[0].label),
                href: hrefBagian(bukaHari(item)),
                aktif: item === hariTerpilih,
              }))}
            />
          ) : null}
          <div className={`min-w-0 lg:col-start-2 ${trip ? "" : "lg:max-w-[880px]"}`}>
            {hariJadwal.length > 1 ? (
              <ChipTanggalHorizon
                aria={t.daysAria}
                hari={hariJadwal.map((item, urutan) => ({
                  ...(item.tanggal ? chipTanggal(item.tanggal, lang) : { atas: agenda[item.bagian[0].indeks].sectionTitle?.trim() || t.day(urutan + 1), bawah: null }),
                  href: hrefBagian(bukaHari(item)),
                  aktif: item === hariTerpilih,
                }))}
              />
            ) : null}
            {bagian ? (
              <>
                {/* Judul hari dari tanggal bagian; label CMS yang sama tidak diulang (U-24). Tema Trip: judulnya di kartu linimasa. */}
                {trip ? null : <h2 className={`text-[22px] font-semibold leading-7 [overflow-wrap:anywhere] lg:mt-0 lg:text-[24px] lg:leading-8 ${hariJadwal.length > 1 ? "mt-5" : ""}`}>
                  {bagian.tanggal ? tanggalPanjangBab(bagian.tanggal, lang) : bagian.sectionTitle?.trim() || t.day(pilihan + 1)}
                </h2>}
                {hariTerpilih && hariTerpilih.bagian.length > 1 ? (
                  <div className={trip ? (hariJadwal.length > 1 ? "mt-4 lg:mt-0" : "") : "mt-3"}>
                    <SegmenBagianHorizon
                      aria={tH.schedule.partsAria}
                      bagian={hariTerpilih.bagian.map((isiBagian, urutan) => ({ label: isiBagian.label ?? tH.schedule.part(urutan + 1), href: hrefBagian(isiBagian.indeks), aktif: isiBagian.indeks === pilihan }))}
                    />
                    {/* Bagian milik peserta (U-01 langkah 2): satu kalimat, bukan tanda di segmen. */}
                    {(() => {
                      const milik = hariTerpilih.bagian.find((isiBagian) => pilihanKu.milik.has(isiBagian.indeks));
                      if (!milik || !pilihanKu.kelompok) return null;
                      const labelMilik = milik.label ?? tH.schedule.part(hariTerpilih.bagian.indexOf(milik) + 1);
                      if (milik.indeks === pilihan) return <p className="mt-3 text-[14px] leading-5 text-[#4A5568]">{tH.schedule.yours(pilihanKu.kelompok)}</p>;
                      // "Bukan jadwalmu" hanya untuk bagian kelompok lain, bukan bagian untuk semua di tanggal yang sama.
                      if (!pilihanKu.bukanMilik.has(pilihan)) return null;
                      return (
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] leading-5 text-[#4A5568]">
                          <span>{tH.schedule.notYours(pilihanKu.kelompok)}</span>
                          <Link href={hrefBagian(milik.indeks)} className="inline-flex min-h-12 items-center font-semibold text-[#274FC0] underline underline-offset-4">
                            {tH.schedule.seeYours(labelMilik)}
                          </Link>
                        </p>
                      );
                    })()}
                  </div>
                ) : null}
                {/* Outfit bagian ini (keputusan Mas 20 Okt, pilihan A): satu strip di
                    atas susunan hari itu, menuju hari yang sama di halaman Outfit. */}
                {outfitHari.length > 0 ? (
                  <KartuRingkasOutfit
                    Ikon={CoatHanger}
                    judul={labelOutfitHalaman}
                    aksi={tH.outfit.see}
                    isian={outfitHari.map((isian) => ({ kapan: kapanOutfit(isian, tH.outfit.allDay), apa: apaRingkas(isian, tH.outfit.optionsShort) }))}
                    href={keTab("outfit", { hari: String(pilihan + 1) })}
                    tab="outfit"
                    lampu="jadwal"
                  />
                ) : null}
                {trip ? (
                  <div className={(hariTerpilih && hariTerpilih.bagian.length > 1) || outfitHari.length > 0 ? "mt-4" : hariJadwal.length > 1 ? "mt-4 lg:mt-0" : ""}>
                    <AgendaHariTrip
                      judul={bagian.tanggal ? tanggalSapaan(bagian.tanggal, lang) : bagian.sectionTitle?.trim() || t.day(pilihan + 1)}
                      meta={tH.trip.activities(bagian.items.filter((butir) => !butir.jeda).length)}
                      butir={bagian.items.map((item) => {
                        const status = statusBagian.get(item.id) ?? null;
                        const tripBaris = adaPerjalanan ? tripUntukBaris(logistik?.transport?.trips ?? [], (iso) => sekarangDi(zona, new Date(iso)), bagian.tanggal ?? null, item) : null;
                        return {
                          kunci: String(item.id),
                          jam: item.time,
                          sampai: item.end,
                          judul: tanpaLabelBagian(item.title, labelTerpilih),
                          catatan: teksPolos(item.subtitle) || null,
                          jeda: item.jeda,
                          status: status ? (status === "berlangsung" ? t.now : t.next) : null,
                          pesanan: tripBaris?.bus
                            ? {
                                href: `${keTab("perjalanan")}#kendaraan`,
                                Ikon: Bus,
                                nada: "bus" as const,
                                teks: gabungMeta([
                                  labelBus(tripBaris.bus, tH.bus),
                                  tripBaris.depart_at ? jamDariMenit(sekarangDi(zona, new Date(tripBaris.depart_at)).menit, lang) : null,
                                  tripBaris.meeting_point ? t.meetAt(tripBaris.meeting_point) : null,
                                ]),
                              }
                            : null,
                          tautan: ruteBaris.has(item.id) ? { href: `${keTab("perjalanan")}#${ruteBaris.get(item.id)}`, label: tH.agenda.routeLink, tab: "perjalanan" } : null,
                        };
                      })}
                    />
                  </div>
                ) : <ol className="mt-4 flex flex-col gap-2">
                  {bagian.items.map((item, _i, semua) => {
                    // Kolom jam dilebarkan hanya bila hari ini punya jam selesai, supaya semua baris sejajar.
                    const adaJamSelesai = semua.some((butir) => butir.end);
                    const status = statusBagian.get(item.id) ?? null;
                    return (
                      <li key={item.id} className={`grid gap-3 ${adaJamSelesai ? "grid-cols-[92px_minmax(0,1fr)] md:grid-cols-[104px_minmax(0,1fr)]" : "grid-cols-[52px_minmax(0,1fr)]"}`}>
                        {/* M3 label-large 14/20; jam mulai dan selesai satu baris, "07.00–08.00". */}
                        <span className={`pt-[18px] text-[14px] font-medium leading-5 tabular-nums ${status === "berlangsung" ? "text-[var(--alis)]" : MUTED}`}>
                          {item.end ? `${item.time}–${item.end}` : item.time}
                        </span>
                        <div
                          className={`flex min-h-14 flex-col justify-center rounded-[16px] bg-white px-4 py-4 ${
                            status === "berlangsung" ? "shadow-[inset_0_0_0_2px_var(--aksi)]" : "shadow-[0_1px_2px_rgb(16_24_40/0.06)]"
                          }`}
                        >
                          {/* M3 title-medium 16/24 tebal 500; jeda memakai warna redup, bukan opacity. */}
                          <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px] font-medium leading-6 ${item.jeda ? MUTED : ""}`}>
                            {tanpaLabelBagian(item.title, labelTerpilih)}
                            {status ? <Chip nada="aksi">{status === "berlangsung" ? t.now : t.next}</Chip> : null}
                          </p>
                          {item.subtitle ? <p className={`mt-1 text-[14px] leading-5 ${MUTED}`}>{teksPolos(item.subtitle)}</p> : null}
                          {/* Tautan 4 px di bawah judul tanpa margin negatif (tetap benar bila teksnya dua baris);
                              lapisan ::before memberi area ketuk 48 px tanpa menggeser apa pun. */}
                          {ruteBaris.has(item.id) ? (
                            <Link href={`${keTab("perjalanan")}#${ruteBaris.get(item.id)}`} className="relative mt-1 inline-flex items-start gap-1 self-start text-[14px] font-semibold leading-5 text-[#274FC0] before:absolute before:inset-x-0 before:-inset-y-3.5 before:content-['']">
                              {tH.agenda.routeLink}
                              <CaretRight size={16} aria-hidden className="mt-0.5 shrink-0" />
                              <PenandaTab tab="perjalanan" />
                            </Link>
                          ) : null}
                          {adaTrip(bagian.tanggal, item) ? (
                            <Link href={keTab("perjalanan")} className="relative mt-1 inline-flex items-start gap-1 self-start text-[14px] font-semibold leading-5 text-[#274FC0] before:absolute before:inset-x-0 before:-inset-y-3.5 before:content-['']">
                              {tH.agenda.tripLink}
                              <CaretRight size={16} aria-hidden className="mt-0.5 shrink-0" />
                              <PenandaTab tab="perjalanan" />
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>}
              </>
            ) : null}
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
    judulHorizon = { alis: nama, judul: tH.tabs.perjalanan, catatan: tv.note(singkatanZona) };
    const hotel = kamar?.hotel ?? null;
    const peta = hotel
      ? hotel.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([hotel.name, hotel.address].filter(Boolean).join(", "))}`
      : null;
    // Satu kartu per stay, berurutan tanggal. Peserta yang pindah hotel
    // (GRAMM lalu RAY) melihat kartu kedua berjudul "Pindah hotel · Jum, 6 Nov",
    // seperti itinerary Booking.com; peserta satu hotel tetap satu kartu.
    const daftarStay = (logistik?.stays.length ?? 0) > 1 ? logistik?.stays ?? [] : kamar ? [kamar] : [];
    // Hotel berbeda: pindah kamar di hotel yang sama tidak dihitung "2 hotel".
    const banyakHotel = new Set(daftarStay.map((x) => x.hotel?.name?.trim())).size;
    const kartuHotel = daftarStay.length > 0 ? (
      <>
        {daftarStay.map((stay, urut) => {
          const h = stay.hotel;
          const petaStay = h.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([h.name, h.address].filter(Boolean).join(", "))}`;
          const temanStay = stay.roommates;
          // Stay yang sudah check-out dilipat jadi satu baris (pola penerbangan
          // selesai di aplikasi maskapai); ketuk untuk membuka kartunya lagi.
          const selesai = Boolean(stay.check_out_at && new Date(stay.check_out_at).getTime() <= sekarang.getTime());
          const kartu = (
            <KartuInfoHorizon
              key={urut}
              id={urut === 0 && !selesai ? "hotel" : undefined}
              judul={urut > 0 ? (daftarStay[urut - 1]?.hotel?.name?.trim() === h?.name?.trim() ? tv.roomChangeTitle : tv.moveTitle) : tv.hotelCard}
              // Tanggal dan jamnya sudah di baris check-in; kepala cukup jumlah malam (pola Booking.com).
              meta={stay.check_in_at && stay.check_out_at ? { teks: tv.nights(Math.max(1, Math.round((new Date(stay.check_out_at).getTime() - new Date(stay.check_in_at).getTime()) / 86_400_000))) } : null}
              Ikon={Bed}
              nama={h?.name?.trim() || null}
              alamat={h?.address?.trim() || null}
              tautan={{ href: petaStay, label: labelTautanPeta(petaStay, lang) }}
              baris={[
                stay.check_in_at ? `${tv.checkIn} ${hariHorizon(stay.check_in_at, zona, lang)} · ${jamHorizon(stay.check_in_at, zona, lang)}` : "",
                stay.check_out_at ? `${tv.checkOut} ${hariHorizon(stay.check_out_at, zona, lang)} · ${jamHorizon(stay.check_out_at, zona, lang)}` : "",
                temanStay && temanStay.length > 0 ? `${tH.roommate(temanStay.length)}: ${temanStay.map((orang) => orang.name).join(", ")}` : "",
              ].filter(Boolean)}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[12px] px-3 py-2" style={{ background: LATAR_STRIP }}>
                <p className="text-[16px] font-semibold leading-6">{gabungMeta([stay.room_number ? `${tH.room} ${stay.room_number}` : tH.roomPending, stay.floor ? `${tv.floor} ${stay.floor}` : null])}</p>
                {jenisKamar(stay) ? <p className="text-[14px] leading-5" style={{ color: "#526078" }}>{jenisKamar(stay)}</p> : null}
              </div>
            </KartuInfoHorizon>
          );
          return selesai && stay.check_out_at ? (
            <LipatanHorizon
              key={urut}
              id={urut === 0 ? "hotel" : undefined}
              label={stay.check_in_at ? tv.stayDone(hariHorizon(stay.check_in_at, zona, lang), hariHorizon(stay.check_out_at, zona, lang)) : tv.done}
              judul={h?.name?.trim() || tv.hotelTitle}
              catatan={stay.room_number ? `${tH.room} ${stay.room_number}` : null}
            >
              {kartu}
            </LipatanHorizon>
          ) : (
            kartu
          );
        })}
      </>
    ) : null;
    // Nama kartu = kendaraan yang benar-benar dinaiki di semua perjalanannya.
    // Kendaraan bawaan yang ditimpa per perjalanan tidak pernah jadi nama kartu;
    // bila perjalanannya memakai kendaraan berbeda, kartu tanpa nama kendaraan
    // dan tiap baris menyebut kendaraannya (pola itinerary multi-leg maskapai).
    const busUtama = perjalananBusHorizon.length > 0 ? (banyakKendaraan ? null : perjalananBusHorizon[0]?.bus ?? null) : logistik?.transport?.default_bus ?? namaBus;
    // Plat dan kru hanya ada bila panitia menyalakannya di Logistics > Buses.
    const detailBus = new Map((logistik?.buses ?? []).map((bus) => [bus.code, bus]));
    const detailUtama = busUtama ? detailBus.get(busUtama) : undefined;
    const kontakKru = (bus: string, teks: string, label: string | null) => (
      <KontakKruHorizon
        label={label}
        teks={teks}
        nomor={nomorKru(teks)}
        aksi={{ call: tv.call, whatsapp: tv.whatsapp, callAria: tv.contactLabel(tv.call, bus), whatsappAria: tv.contactLabel(tv.whatsapp, bus) }}
      />
    );
    // Peta titik kumpul (E-12): titik kumpul di hotel peserta memakai peta hotelnya;
    // yang lain dicari di Google Maps bersama asal perjalanannya.
    const petaTrip = (trip: (typeof perjalananBusHorizon)[number]) => {
      const titik = trip.meeting_point?.trim();
      if (!titik) return null;
      const asal = trip.origin?.trim() || null;
      const namaHotel = hotel?.name?.trim().toLocaleLowerCase("id") || null;
      const diHotel = (teks: string | null) => Boolean(teks && (teks.toLocaleLowerCase("id") === "hotel" || (namaHotel && teks.toLocaleLowerCase("id").includes(namaHotel))));
      if (peta && diHotel(asal)) return peta;
      const kueri = asal && !titik.toLocaleLowerCase("id").includes(asal.toLocaleLowerCase("id")) ? `${titik}, ${asal}` : titik;
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(kueri)}`;
    };
    const barisBus = perjalananBusHorizon.map((trip, index) => {
      // Kendaraan berbeda per perjalanan: label kendaraan dan platnya di baris
      // itu, kru di bawahnya. Satu kendaraan sudah jadi nama kartu, tidak diulang.
      const lain = trip.bus && trip.bus !== busUtama ? trip.bus : null;
      const detail = lain ? detailBus.get(lain) : undefined;
      const petaHref = petaTrip(trip);
      return {
        kunci: `${index}-${trip.name}`,
        tanggal: trip.depart_at ? hariHorizon(trip.depart_at, zona, lang) : null,
        jam: trip.depart_at ? jamHorizon(trip.depart_at, zona, lang) : null,
        judul: trip.name,
        kendaraan: lain ? [lain, detail?.plate].filter(Boolean).join(" · ") : null,
        detail: [[trip.origin?.trim(), trip.destination?.trim()].filter(Boolean).join(" → ")].filter(Boolean),
        titikKumpul: trip.meeting_point?.trim() ? `${tv.meetingPoint}: ${trip.meeting_point.trim()}` : null,
        peta: petaHref ? { href: petaHref, label: tv.openMeetingMap } : null,
        kru: lain && detail?.crew ? kontakKru(lain, detail.crew, null) : undefined,
      };
    });
    // Perjalanan yang sudah berangkat dilipat jadi satu baris di atas daftar.
    const lewatBus = perjalananBusHorizon.map((trip) => Boolean(trip.depart_at && new Date(trip.depart_at).getTime() <= sekarang.getTime()));
    const busBerikut = lewatBus.filter((lewat) => !lewat).length;
    const kartuBusHorizon =
      busUtama || perjalananBusHorizon.length > 0 ? (
        <KartuInfoHorizon
          id="bus"
          judul={tv.busTitle}
          // Sama dengan kartu kereta: hanya yang belum lewat dihitung, "Selesai" bila semuanya sudah.
          meta={!trip && perjalananBusHorizon.length ? (busBerikut > 0 ? { teks: tv.tripCount(busBerikut) } : { teks: tH.train.done, nada: "hijau" }) : null}
          Ikon={Bus}
          // Nama bus jadi kepala isi kartu, tanpa label "Bus" kedua di bawah kepala "Bus".
          nama={busUtama || null}
          alamat={detailUtama?.plate ? `${tv.plate} ${detailUtama.plate}` : null}
          tanpaKepala={trip}
        >
          <PerjalananBusHorizon
            judul={tv.trips}
            labelLewat={tv.tripsDone}
            lewat={barisBus.filter((_, index) => lewatBus[index])}
            baris={barisBus.filter((_, index) => !lewatBus[index])}
          />
          {busUtama && detailUtama?.crew ? kontakKru(busUtama, detailUtama.crew, tv.crew) : null}
        </KartuInfoHorizon>
      ) : null;
    // Simpan ke kalender per leg kereta (E-07): berkasnya dari server, pengingatnya berbunyi tanpa sinyal.
    const legDenganKalender = legKereta.map((leg) => {
      const tiket = logistik?.trains.find((item) => item.direction === leg.kunci);
      const denganKalender = tiket?.depart_date && tiket.depart_time
        ? { ...leg, kalender: { href: `/e/${encodeURIComponent(event.slug)}/api/peserta/kalender-kereta?arah=${leg.kunci}${lang === utama ? "" : `&bahasa=${lang}`}`, label: tv.addToCalendar } }
        : leg;
      // Leg yang sudah tiba dilipat jadi satu baris: "Berangkat · Kam, 5 Nov · selesai".
      return tiket && legSelesai(tiket, zona, sekarang)
        ? { ...denganKalender, lipat: { label: gabungMeta([leg.arah, tv.done]), catatan: gabungMeta([tiket.train_name, tH.travel.seatLine(tiket.carriage, tiket.seat)]) || null } }
        : denganKalender;
    });
    const kartuKeretaHorizon =
      legKereta.length > 0 ? <TiketKeretaHorizon judul={tH.train.title} label={{ gerbong: tH.train.carriage, kursi: tH.train.seat, kode: tH.train.booking, jumlah: tH.train.count, selesai: tH.train.done, ke: tH.train.to }} leg={legDenganKalender} /> : null;
    // Bagasi (Record luggage): satu kartu per meja bagasi tempat peserta dipindai.
    // Pola kartu klaim titip koper hotel dan "bags checked" di aplikasi maskapai:
    // jumlah besar, kapan dan di mana, foto, lalu ajakan memeriksa sebelum pergi.
    const tl = tv.luggage;
    const kartuBagasi = bagasi.length > 0 ? (
      <>
        {bagasi.map((item) => (
          <KartuInfoHorizon
            key={item.session_id}
            id={item === bagasi[0] ? "bagasi" : undefined}
            judul={tl.title}
            Ikon={Suitcase}
            meta={{ teks: item.handed_over_at ? tl.received : tl.stored, nada: item.handed_over_at ? "hijau" : "redup" }}
            tanpaKepala={trip}
            nama={item.bag_count === 0 ? tl.none : tl.count(item.bag_count)}
            baris={[
              // Sebelum diambil kepala kartu sudah berbunyi "Dititipkan": barisnya cukup kapan dan di mana.
              gabungMeta([`${item.handed_over_at ? `${tl.droppedAt} ` : ""}${hariHorizon(item.recorded_at, zona, lang)} ${jamHorizon(item.recorded_at, zona, lang)}`, item.session_name || null]),
              item.handed_over_at ? `${tl.pickedUpAt} ${hariHorizon(item.handed_over_at, zona, lang)} ${jamHorizon(item.handed_over_at, zona, lang)}` : "",
            ].filter(Boolean)}
          >
            {item.photo_url ? (
              <FotoBagasi
                src={item.photo_url}
                keterangan={tl.count(item.bag_count)}
                teks={{ buka: tl.openPhoto, perbesar: tl.enlarge, tutup: tl.close, judul: tl.title }}
              />
            ) : null}
            {item.bag_count > 0 ? <p className="text-[14px] leading-5" style={{ color: "#526078" }}>{item.handed_over_at ? tl.checkAfter : tl.check}</p> : null}
          </KartuInfoHorizon>
        ))}
      </>
    ) : null;
    // Bantuan di tempat yang sama di setiap halaman perjalanan (U-07), dengan tautan ke kartu darurat di Menu (E-03).
    const kartuBantuanPerjalanan = kontakHorizon ? (
      <KartuBantuanHorizon
        alis={tH.helpCard.eyebrow}
        judul={tH.helpCard.title}
        catatan={tH.helpCard.noteTravel}
        kontak={kontakHorizon}
        label={labelKontak}
        tautan={adaDarurat ? { href: `${keTab("profil")}#darurat`, label: judulDarurat, tab: "profil" } : null}
      />
    ) : null;
    // Chip lompat hanya bila halamannya punya tiga bagian atau lebih; peserta
    // dengan hotel dan bus saja melihat halaman yang sama persis seperti dulu.
    const bagianLompat = [
      kartuHotel ? { id: "hotel", label: tv.jump.hotel } : null,
      kartuBusHorizon ? { id: "bus", label: tv.jump.bus } : null,
      kartuKeretaHorizon ? { id: "kereta", label: tv.jump.train } : null,
      kartuBagasi ? { id: "bagasi", label: tv.jump.luggage } : null,
      rutePerjalanan.length ? { id: "rute", label: tv.jump.routes } : null,
    ].filter((item): item is { id: string; label: string } => item !== null);
    // Tema Gathering Trip: tiap jenis pesanan bagian sendiri (Kereta, Hotel,
    // Kendaraan, Bagasi), e-tiket kereta, hotel seperti reservasi, dan di
    // desktop rencana perjalanan urut waktu di kolom kiri.
    const isiTrip = trip && adaPerjalanan ? (() => {
      const tt = tH.trip;
      const malam = (stay: LogistikKamar) =>
        stay.check_in_at && stay.check_out_at ? Math.max(1, Math.round((new Date(stay.check_out_at).getTime() - new Date(stay.check_in_at).getTime()) / 86_400_000)) : null;
      const totalMalam = daftarStay.reduce((jumlah, stay) => jumlah + (malam(stay) ?? 0), 0);
      const hotelTrip = daftarStay.map((stay, urut) => {
        const h = stay.hotel;
        const petaStay = h.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([h.name, h.address].filter(Boolean).join(", "))}`;
        const jumlahMalam = malam(stay);
        const selesai = Boolean(stay.check_out_at && new Date(stay.check_out_at).getTime() <= sekarang.getTime());
        const kartu = (
          <KartuHotelTrip
            key={urut}
            id={urut === 0 && !selesai ? "hotel-1" : undefined}
            stay={{
              pil: gabungMeta([urut > 0 && daftarStay[urut - 1]?.hotel?.name?.trim() === daftarStay[urut]?.hotel?.name?.trim() ? tv.roomChangeTitle : banyakHotel > 1 ? tt.hotelN(urut + 1) : tv.hotelCard, jumlahMalam ? tv.nights(jumlahMalam) : null]),
              nama: h?.name?.trim() || null,
              alamat: h?.address?.trim() || null,
              peta: { href: petaStay, label: labelTautanPeta(petaStay, lang) },
              masuk: stay.check_in_at ? { label: tv.checkIn, hari: hariHorizon(stay.check_in_at, zona, lang), jam: jamHorizon(stay.check_in_at, zona, lang) } : null,
              keluar: stay.check_out_at ? { label: tv.checkOut, hari: hariHorizon(stay.check_out_at, zona, lang), jam: jamHorizon(stay.check_out_at, zona, lang) } : null,
              kamar: gabungMeta([stay.room_number ? `${tH.room} ${stay.room_number}` : tH.roomPending, stay.floor ? `${tv.floor} ${stay.floor}` : null]),
              tipe: jenisKamar(stay),
              teman: stay.roommates && stay.roommates.length > 0 ? { label: tH.roommate(stay.roommates.length), nama: stay.roommates.map((orang) => orang.name) } : null,
            }}
          />
        );
        return selesai && stay.check_out_at ? (
          <LipatanHorizon
            key={urut}
            label={stay.check_in_at ? tv.stayDone(hariHorizon(stay.check_in_at, zona, lang), hariHorizon(stay.check_out_at, zona, lang)) : tv.done}
            judul={h?.name?.trim() || tv.hotelTitle}
            catatan={stay.room_number ? `${tH.room} ${stay.room_number}` : null}
          >
            {kartu}
          </LipatanHorizon>
        ) : (
          kartu
        );
      });
      const legAktif = legDenganKalender.filter((leg) => !leg.lipat).length;
      const labelKereta = { gerbong: tH.train.carriage, kursi: tH.train.seat, kode: tH.train.booking, ke: tH.train.to, salin: tt.copy, tersalin: tt.copied, lama: tt.duration };
      const rencana = rencanaTrip(daftarStay, logistik?.trains ?? [], zona, tt).map((langkah) => ({
        kunci: langkah.kunci,
        waktu: gabungMeta([tanggalLeg(langkah.tanggal, lang), jamTiket(langkah.jam, lang)]),
        teks: langkah.teks,
        lewat: langkah.kunci < `${kini.tanggal} ${String(Math.floor(kini.menit / 60)).padStart(2, "0")}:${String(kini.menit % 60).padStart(2, "0")}`,
      }));
      const bagianTrip = [
        legKereta.length > 0 ? { id: "kereta", label: tv.jump.train } : null,
        daftarStay.length > 0 ? { id: "hotel", label: tv.jump.hotel } : null,
        kartuBusHorizon ? { id: "kendaraan", label: tv.jump.bus } : null,
        kartuBagasi ? { id: "koper", label: tv.jump.luggage } : null,
        rutePerjalanan.length ? { id: "rute", label: tv.jump.routes } : null,
      ].filter((item): item is { id: string; label: string } => item !== null);
      return (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-start lg:gap-8">
          {rencana.length > 0 || kartuBantuanPerjalanan ? (
            <aside className="hidden lg:sticky lg:top-[126px] lg:flex lg:flex-col lg:gap-4 lg:[@media(max-height:939px)]:static">
              <RencanaTrip judul={tt.plan} langkah={rencana} />
              {kartuBantuanPerjalanan}
            </aside>
          ) : null}
          <div className={`flex min-w-0 flex-col gap-6 [&_section]:scroll-mt-32 ${rencana.length > 0 || kartuBantuanPerjalanan ? "" : "lg:col-span-2"}`}>
            {bagianTrip.length >= 3 ? (
              // Langsung di kolom ini, bukan dibungkus div: pembungkus setinggi bilah membuatnya tidak bisa menempel.
              <LompatPerjalanan aria={tv.jump.aria} bagian={bagianTrip} latar={LATAR_PORTAL_HORIZON} className="lg:hidden" />
            ) : null}
            {legKereta.length > 0 ? (
              <BagianTrip id="kereta" Ikon={Train} nada="kereta" judul={tH.train.title} meta={legAktif > 0 ? tH.train.count(legAktif) : tH.train.done} duaKolom>
                {legDenganKalender.map((leg, urut) => (
                  <TiketKeretaTrip key={leg.kunci} leg={leg} label={labelKereta} pertama={urut === legDenganKalender.findIndex((item) => !item.lipat)} />
                ))}
              </BagianTrip>
            ) : null}
            {daftarStay.length > 0 ? (
              <BagianTrip id="hotel" Ikon={Bed} nada="hotel" judul={tv.hotelCard} meta={gabungMeta([banyakHotel > 1 ? tt.hotels(banyakHotel) : null, totalMalam ? tv.nights(totalMalam) : null]) || null} duaKolom={daftarStay.length > 1}>
                {hotelTrip}
              </BagianTrip>
            ) : null}
            {kartuBusHorizon ? (
              <BagianTrip id="kendaraan" Ikon={Bus} nada="bus" judul={tv.busTitle} meta={perjalananBusHorizon.length ? (busBerikut > 0 ? tv.tripCount(busBerikut) : tH.train.done) : null}>
                {kartuBusHorizon}
              </BagianTrip>
            ) : null}
            {kartuBagasi ? (
              <BagianTrip id="koper" Ikon={Suitcase} nada="bagasi" judul={tl.title}>
                {kartuBagasi}
              </BagianTrip>
            ) : null}
            {rutePerjalanan.length ? (
              <div id="rute">
                <DaftarRuteRingkas blocks={rutePerjalanan} hotels={inap.hotels} lang={lang} />
                <BukaRuteDariHash />
              </div>
            ) : null}
            {kartuBantuanPerjalanan ? <div className="lg:hidden">{kartuBantuanPerjalanan}</div> : null}
          </div>
        </div>
      );
    })() : null;
    isi = !adaPerjalanan ? (
      <p className={`${KARTU} max-w-[720px] text-body-large ${MUTED}`}>{tv.empty}</p>
    ) : isiTrip ? (
      isiTrip
    ) : (
      // Dengan chip, kepala tiap bagian berhenti di bawah bilah atas + baris chip
      // (64 + 56 px), juga saat dibuka lewat #hotel dan sejenisnya.
      <div className={`flex flex-col gap-4 md:gap-6 ${bagianLompat.length >= 3 ? "[&_#bagasi]:scroll-mt-32 [&_#bus]:scroll-mt-32 [&_#hotel]:scroll-mt-32 [&_#kereta]:scroll-mt-32 [&_#rute]:scroll-mt-32" : ""}`}>
        {bagianLompat.length >= 3 ? <LompatPerjalanan aria={tv.jump.aria} bagian={bagianLompat} latar={LATAR_PORTAL_HORIZON} /> : null}
        {kartuHotel && kartuBusHorizon ? (
          <div className="flex flex-col gap-4 md:gap-6 xl:grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
            {/* Semua stay satu kolom (yang terlipat di atas), bus di kolom kanan. */}
            <div className="flex flex-col gap-4 md:gap-6">{kartuHotel}</div>
            {kartuBusHorizon}
          </div>
        ) : (
          (kartuHotel ?? kartuBusHorizon)
        )}
        {kartuKeretaHorizon}
        {kartuBagasi}
        {rutePerjalanan.length ? (
          <div id="rute">
            <DaftarRuteRingkas blocks={rutePerjalanan} hotels={inap.hotels} lang={lang} />
            <BukaRuteDariHash />
          </div>
        ) : null}
        {kartuBantuanPerjalanan}
      </div>
    );
  } else if (tabAktif === "outfit") {
    // Hanya Horizon dengan outfit (selain itu sudah dialihkan ke Beranda di atas).
    // Bagian dari Susunan acara (keputusan Mas 20 Okt, pilihan A): kembali ke
    // Susunan acara, dan hari dibentuk dari TANGGAL seperti tab Jadwal (pilihan
    // hari yang sama di ponsel dan desktop). Tiap tanggal dibuka di bagian milik
    // peserta (Agenda > Who it's for); `?hari=` tetap urutan bagian.
    const to = tH.outfit;
    const hariO = kelompokkanHari(hariOutfit);
    // Tanggal yang semua bagiannya untuk kelompok lain tetap bisa dibuka (`buka`), seperti tab Jadwal.
    const bukaHariO = (item: (typeof hariO)[number]) => {
      const indeks = item.tanggal ? bagianOutfitTanggal(hariOutfit, item.tanggal, pilihanOutfit, true) : -1;
      return indeks >= 0 ? indeks : (bagianPertama(item.bagian.map((isi) => isi.indeks), pilihanOutfit) ?? item.bagian[0].indeks);
    };
    const hariAwalO = hariO.find((item) => item.tanggal === kini.tanggal) ?? hariO[0];
    const pilihan = Math.min(Math.max((hari ?? (hariAwalO ? bukaHariO(hariAwalO) + 1 : 1)) - 1, 0), Math.max(hariOutfit.length - 1, 0));
    const bagian = hariOutfit[pilihan];
    // Kartu bagian terpilih, Setiap hari di depan; tanpa tab Agenda hanya kartu Setiap hari,
    // langsung di bawah judul halaman (tanpa judul tanggal), jadi judulnya h2.
    const kartuHari = outfitTampil(pilihan).map((isian, index) => (
      <KartuOutfitHorizon
        key={index}
        kapan={kapanOutfit(isian, to.allDay)}
        apa={isian.what}
        catatan={isian.note ?? null}
        foto={isian.photo_url ?? null}
        pilihan={isian.options}
        tingkat={bagian ? 3 : 2}
        judulFoto={labelOutfitHalaman}
        teksFoto={{ buka: to.openPhoto(isian.what), lihat: to.viewPhoto, perbesar: to.enlarge, tutup: to.closePhoto }}
        teksPilihan={{ pilih: to.options(isian.options?.length ?? 0), buka: to.openPhoto, tutup: to.closePhoto, sebelumnya: to.prevPhoto, berikutnya: to.nextPhoto }}
      />
    ));
    const hariTerpilih = hariO.find((item) => item.bagian.some((isi) => isi.indeks === pilihan));
    const hrefO = (indeks: number) => keTab("outfit", { hari: String(indeks + 1) });
    // Hari sesudahnya yang pertama punya outfit untuk peserta ini (bukan untuk
    // kelompok lain; dengan Setiap hari, tanggal berikutnya): satu baris di bawah kartu.
    const urutanTerpilih = hariTerpilih ? hariO.indexOf(hariTerpilih) : -1;
    const berikutO = (urutanTerpilih >= 0 ? hariO.slice(urutanTerpilih + 1) : [])
      .map((item) => ({ item, indeks: item.tanggal ? bagianOutfitTanggal(hariOutfit, item.tanggal, pilihanOutfit) : -1 }))
      .find(({ indeks }) => indeks >= 0 && outfitTampil(indeks).length > 0);
    judulHorizon = {
      alis: nama,
      judul: labelOutfitHalaman,
      catatan: to.note,
      // Bagian dari Susunan acara; Jadwal disembunyikan atau tanpa tab Agenda: halaman Menu seperti dulu.
      kembali: outfitDiAcara
        ? { href: keTab("jadwal", { hari: String(pilihan + 1) }), label: t.schedule, semua: true, tab: "jadwal" }
        : { href: keTab("profil"), label: tH.travel.backToMenu, tab: "profil" },
    };
    isi = (
      <div className={hariO.length > 1 ? "w-full lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14" : "w-full"}>
        {hariO.length > 1 ? (
          <HariJadwalHorizon
            aria={t.daysAria}
            hari={hariO.map((item, urutan) => ({
              label: [String(urutan + 1).padStart(2, "0"), item.tanggal ? tanggalBab(item.tanggal, lang) : null].filter(Boolean).join(" / "),
              judul: tanpaLabelBagian(hariOutfit[item.bagian[0].indeks].sectionTitle?.trim() || t.day(urutan + 1), item.bagian[0].label),
              href: hrefO(bukaHariO(item)),
              aktif: item === hariTerpilih,
            }))}
          />
        ) : null}
        <div className="min-w-0 lg:col-start-2 lg:max-w-[880px]">
          {hariO.length > 1 ? (
            <ChipTanggalHorizon
              aria={t.daysAria}
              hari={hariO.map((item, urutan) => ({
                ...(item.tanggal ? chipTanggal(item.tanggal, lang) : { atas: hariOutfit[item.bagian[0].indeks].sectionTitle?.trim() || t.day(urutan + 1), bawah: null }),
                href: hrefO(bukaHariO(item)),
                aktif: item === hariTerpilih,
              }))}
            />
          ) : null}
          {bagian ? (
            <>
              {/* Tanggal ditulis sekali (dulu tanggal lalu label bagian yang sama). */}
              <div className={`flex flex-wrap items-center gap-x-2 gap-y-2 lg:gap-x-3 ${hariO.length > 1 ? "mt-5 lg:mt-0" : ""}`}>
                <h2 className="text-[22px] font-semibold leading-7 [overflow-wrap:anywhere] lg:text-[24px] lg:leading-8">
                  {bagian.tanggal ? tanggalPanjangBab(bagian.tanggal, lang) : bagian.sectionTitle?.trim() || t.day(pilihan + 1)}
                </h2>
                {bagian.tanggal === kini.tanggal ? (
                  <Chip nada="aksi">
                    {/* Ponsel: tanpa ikon, supaya chip muat di baris tanggal. */}
                    <CalendarCheck size={14} weight="bold" aria-hidden className="hidden lg:block" />
                    {to.today}
                  </Chip>
                ) : null}
              </div>
              {hariTerpilih && hariTerpilih.bagian.length > 1 ? (
                <div className="mt-3">
                  <SegmenBagianHorizon
                    aria={tH.schedule.partsAria}
                    bagian={hariTerpilih.bagian.map((isiBagian, urutan) => ({ label: isiBagian.label ?? tH.schedule.part(urutan + 1), href: hrefO(isiBagian.indeks), aktif: isiBagian.indeks === pilihan }))}
                  />
                  {/* Bagian milik peserta, seperti tab Jadwal: satu kalimat, dan tautan ke
                      bagiannya bila yang terbuka untuk kelompok lain. Kelompok hanya
                      disebut bila Jadwal ditampilkan (sama dengan layar QR). */}
                  {(() => {
                    const milik = hariTerpilih.bagian.find((isiBagian) => pilihanOutfit.milik.has(isiBagian.indeks));
                    if (!outfitDiAcara || !milik || !pilihanOutfit.kelompok) return null;
                    if (milik.indeks === pilihan) return <p className="mt-3 text-[14px] leading-5 text-[#4A5568]">{to.yours(pilihanOutfit.kelompok)}</p>;
                    if (!pilihanOutfit.bukanMilik.has(pilihan)) return null;
                    const labelIni = hariTerpilih.bagian.find((isiBagian) => isiBagian.indeks === pilihan)?.label ?? tH.schedule.part(hariTerpilih.bagian.findIndex((isiBagian) => isiBagian.indeks === pilihan) + 1);
                    const labelMilik = milik.label ?? tH.schedule.part(hariTerpilih.bagian.indexOf(milik) + 1);
                    return (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] leading-5 text-[#4A5568]">
                        <span>{to.notYours(labelIni, pilihanOutfit.kelompok)}</span>
                        <Link href={hrefO(milik.indeks)} className="inline-flex min-h-12 items-center font-semibold text-[#274FC0] underline underline-offset-4">
                          {to.seeYours(labelOutfitHalaman, labelMilik)}
                        </Link>
                      </p>
                    );
                  })()}
                </div>
              ) : null}
              {kartuHari.length === 0 ? (
                <p className={`mt-4 text-[16px] leading-6 ${MUTED}`}>{to.dayEmpty}</p>
              ) : (
                // Satu kartu per baris di semua lebar: foto outfit isi utamanya, jadi di layar
                // lebar kartunya selebar kolom (sejajar baris Berikutnya), bukan separuh.
                <div className="mt-4 grid gap-4 lg:gap-6">{kartuHari}</div>
              )}
              {berikutO && berikutO.item.tanggal ? (
                // Hari berikutnya: pola kartu yang sama dengan strip Susunan acara, versi redup.
                <KartuRingkasOutfit
                  Ikon={CalendarBlank}
                  judul={gabungMeta([to.next, (({ atas, bawah }) => `${atas}, ${bawah}`)(chipTanggal(berikutO.item.tanggal, lang))])}
                  isian={outfitTampil(berikutO.indeks).map((isian) => ({ kapan: kapanOutfit(isian, to.allDay), apa: apaRingkas(isian, to.optionsShort) }))}
                  href={hrefO(berikutO.indeks)}
                  redup
                />
              ) : null}
            </>
          ) : setiapHari ? (
            // Acara tanpa tab Agenda: hanya kartu Setiap hari, tanpa chip hari dan Berikutnya.
            <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">{kartuHari}</div>
          ) : null}
        </div>
      </div>
    );
  } else if (tabAktif === "info") {
    kepala = <JudulKepala judul={t.info} catatan={t.infoNote} />;
    // Horizon: judul halaman sama dengan nama menunya ("Pengumuman").
    judulHorizon = { alis: nama, judul: horizon ? tH.tabs.info : t.info, catatan: t.infoNote };
    // Horizon: yang belum dibaca di atas (U-03), lalu yang disematkan dan sisanya seperti biasa.
    const daftarInfo = horizon ? [...pengumuman.items].sort((a, b) => Number(isUnread(b, pengumuman.seenAt)) - Number(isUnread(a, pengumuman.seenAt))) : pengumuman.items;
    isi = (
      // Horizon: satu kolom rata kiri selebar kolom utama Beranda (790), terbaru di atas.
      // Pengumuman itu prosa: dua kolom meninggalkan separuh baris kosong saat jumlahnya ganjil.
      <div className={horizon ? "flex w-full max-w-[790px] flex-col gap-4" : "mx-auto flex w-full max-w-[720px] flex-col gap-3"}>
        {/* Tab ini yang menandai pengumuman terbaca, bukan setiap render portal (U-03). */}
        {!pratinjau && pengumuman.unread > 0 ? <TandaiPengumumanDibaca slug={event.slug} /> : null}
        {trip ? (
          <PengumumanTrip
            teks={{ baru: t.isNew, disematkan: tH.trip.pinned, kosongJudul: tH.trip.noNewsTitle, kosongIsi: tH.trip.noNewsBody }}
            item={daftarInfo.map((item) => ({
              id: String(item.id),
              judul: item.title,
              isi: item.body?.trim() || null,
              waktu: waktuPengumuman(item.published_at, zona, lang),
              baru: isUnread(item, pengumuman.seenAt),
              disematkan: Boolean(item.pinned),
              tautan: item.link_url ? { href: item.link_url, label: item.link_label?.trim() || item.link_url } : null,
            }))}
          />
        ) : pengumuman.items.length === 0 ? (
          <p className={`${KARTU} ${horizon ? GARIS_KARTU : ""} text-body-large ${MUTED}`}>{t.noAnnouncements}</p>
        ) : (
          daftarInfo.map((item) => {
            const baru = isUnread(item, pengumuman.seenAt);
            return (
              <article key={item.id} className={`${KARTU} ${horizon ? GARIS_KARTU : ""} ${item.pinned ? "shadow-[inset_0_0_0_2px_var(--aksen)]!" : ""}`}>
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
                {/* Horizon: Title Medium 600 + Body Medium, sama dengan kartu Pengumuman di Beranda; 22 px tebal terlalu berat untuk daftar. */}
                <h2 className={`max-w-[70ch] [overflow-wrap:anywhere] ${horizon ? "text-title-medium font-semibold" : "text-title-large font-bold"}`}>{item.title}</h2>
                {item.body ? <p className={`max-w-[70ch] whitespace-pre-line [overflow-wrap:anywhere] ${horizon ? "mt-1 text-body-medium" : "mt-1.5 text-body-large"} ${MUTED}`}>{item.body}</p> : null}
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
    // Profil Horizon (versi C, keputusan Mas 25 Okt): identitas di pita navy
    // tanpa judul halaman, lalu kartu QR, daftar akun, dan Bantuan. Data diri
    // punya halaman sendiri (`?lihat=data`), seperti "Manage my account" di Trip.com.
    const tp = tH.profile;
    const tautanTelepon = telepon ? telHref(telepon) : null;
    const fakta = [
      { label: tp.name, nilai: sesi.name },
      ...((peserta?.email?.trim() || sesi.email) ? [{ label: tp.email, nilai: peserta?.email?.trim() || sesi.email }] : []),
      ...(peserta?.company ? [{ label: tp.company, nilai: peserta.company }] : []),
      ...(peserta?.title ? [{ label: tp.jobTitle, nilai: peserta.title }] : []),
    ];
    if (lihat === "data") {
      judulHorizon = { alis: nama, judul: tp.details, catatan: "", kembali: { href: keTab("profil"), label: tp.back, semua: true, tab: "profil" } };
      isi = (
        <DataDiriHorizon
          fakta={fakta}
          bantuan={
            kontakHorizon
              ? { teks: tH.helpCard.noteProfile, kontak: <TombolKontakHorizon kontak={kontakHorizon} label={labelKontak} />, tautan: null }
              : tautanTelepon
                ? { teks: tp.wrong, kontak: null, tautan: { href: tautanTelepon, label: tp.contact } }
                : null
          }
        />
      );
    } else {
      // Ubin hanya bila datanya ada: checkpoint (bila tampil di Beranda), kamar, bus.
      const ubin: UbinProfil[] = [
        ...(checkpoint && checkpoint.steps.length > 0 && diBeranda("checkpoints")
          ? [{ href: `${keTab("beranda")}#checkpoint`, Ikon: Flag, judul: `${checkpoint.done}/${checkpoint.steps.length}`, isi: tp.checkpoints, tab: "beranda" }]
          : []),
        ...(kamar
          ? [{
              href: `${keTab("perjalanan")}#hotel`,
              Ikon: Bed,
              judul: kamar.room_number ? tp.room(kamar.room_number) : kamar.hotel?.name?.trim() || tH.travel.hotelCard,
              isi: kamar.room_number ? kamar.hotel?.name?.trim() || tH.travel.hotelCard : tH.roomPending,
              tab: "perjalanan",
            }]
          : []),
        ...(namaBus
          ? [{
              href: `${keTab("perjalanan")}#bus`,
              Ikon: Bus,
              judul: namaBus,
              isi: perjalananBus?.depart_at ? `${hariHorizon(perjalananBus.depart_at, zona, lang)} · ${jamHorizon(perjalananBus.depart_at, zona, lang)}` : tH.travel.busTitle,
              tab: "perjalanan",
            }]
          : []),
      ];
      kepala = <IdentitasProfilHorizon inisial={inisial} nama={sesi.name} data={{ href: keTab("profil", { lihat: "data" }), label: tp.seeDetails }} ubin={ubin} trip={trip} />;
      // Kartu darurat (E-03): kontak dari Participant area dengan tombol Telepon,
      // WhatsApp (ponsel), dan Peta. Cadangannya blok lama: tiap butir menjadi baris
      // yang bisa diketuk lewat tautannya atau nomor ponsel di teksnya (pola kontak kru bus).
      const barisDarurat = (item: (typeof kontakDarurat)[number]) => ({ judul: item.judul, isi: item.isi, href: null, luar: false, kontak: { nomor: item.nomor, tel: item.tel, wa: item.wa, peta: item.peta } });
      const kartuDarurat = pakaiKontak ? (
        <KartuDaruratHorizon
          judul={judulDarurat}
          isi={bantuan?.note?.trim() || null}
          label={{ call: tH.travel.call, whatsapp: tH.travel.whatsapp, map: tH.emergencyMap }}
          baris={kontakDarurat.map(barisDarurat)}
          // Ada jenis: kelompok per jenis dengan subjudul, urutan tetap; tanpa jenis masuk Lainnya.
          kelompok={
            kontakDarurat.some((item) => item.jenis)
              ? (["hospital", "ambulance", "police", "fire", "hotel", "other"] as const)
                  .map((jenis) => ({
                    judul: tH.emergencyKinds[jenis],
                    Ikon: ikonJenisDarurat(jenis),
                    baris: kontakDarurat.filter((item) => (item.jenis ?? "other") === jenis).map(barisDarurat),
                  }))
                  .filter((grup) => grup.baris.length > 0)
              : null
          }
        />
      ) : blokDarurat ? (
        <KartuDaruratHorizon
          judul={judulDarurat}
          isi={blokDarurat.body?.trim() || null}
          baris={(blokDarurat.items ?? [])
            .filter((item) => item.title?.trim() || item.body?.trim())
            .map((item) => {
              const judulButir = item.title?.trim() || item.body?.trim() || "";
              const tautan = item.href?.trim() && /^https?:\/\//i.test(item.href.trim()) ? item.href.trim() : null;
              const nomor = tautan ? null : nomorKru([item.title, item.body].filter(Boolean).join(" "));
              return { judul: judulButir, isi: item.title?.trim() ? item.body?.trim() || null : null, href: tautan ?? (nomor ? `tel:${nomor.tel}` : null), luar: Boolean(tautan) };
            })}
        />
      ) : null;
      const panitia = daftarKontakPanitia(config);
      const kartuPanitia = panitia.length > 0 ? (
        <KartuDaruratHorizon
          id="panitia"
          Ikon={Headset}
          warna={null}
          judul={tp.organisersTitle}
          isi={null}
          label={{ call: tH.travel.call, whatsapp: tH.travel.whatsapp, map: tH.emergencyMap }}
          baris={panitia.map((item) => {
            const judul = item.nama || tp.organisersTitle;
            // Tanpa nomor: baris email biasa; dengan nomor: tombol Telepon dan WhatsApp.
            return item.tel
              ? { judul, isi: item.peran, href: null, luar: false, kontak: { nomor: item.nomor, tel: item.tel, wa: item.wa, peta: null } }
              : { judul, isi: [item.peran, item.email].filter(Boolean).join("\n") || null, href: item.email ? `mailto:${item.email}` : null, luar: true };
          })}
        />
      ) : null;
      isi = (
        <ProfilHorizon
          sisipan={pitaEmail || statusPendaftaran ? <div className="flex flex-col gap-4">{pitaEmail}{statusPendaftaran}</div> : null}
          // Satu nama untuk QR di seluruh portal: "QR kehadiran" (U-20).
          qr={tampilKode && peserta ? { href: keTab("qr", { dari: "profil" }), label: t.qrTitle, kode: peserta.qr_code, tampilkan: tp.show, gambar: <QrMini code={peserta.qr_code} alt="" /> } : null}
          akun={[
            { href: keTab("profil", { lihat: "data" }), judul: tp.details, isi: tp.detailsRow(Boolean(peserta?.company)), Ikon: User },
            // Perjalanan punya tab sendiri di bilah bawah, jadi tidak diulang di sini.
            // Outfit di bawah Susunan acara (keputusan Mas 20 Okt); di sini hanya
            // bila Jadwal disembunyikan.
            ...(adaOutfit && !outfitDiAcara ? [{ href: keTab("outfit"), judul: labelOutfitHalaman, isi: tH.outfit.menuRow, Ikon: CoatHanger, tab: "outfit" }] : []),
            ...(landingEnAvailable(config) ? [{ href: `${landingPath(event.slug, lainnya, utama)}/peserta?tab=profil`, judul: tp.language, isi: t.languageRow, Ikon: Globe }] : []),
            { href: halamanAcara, judul: t.eventPageRow, isi: nama, Ikon: CalendarBlank },
          ]}
          // Dua sumber, dua arti: Kontak panitia dari Event settings, kartu darurat
          // (rumah sakit, polisi, hotel) dari Participant area. Keputusan Mas 28 Okt.
          bantuan={{ judul: tp.helpTitle, baris: [] }}
          darurat={
            kartuPanitia || kartuDarurat ? (
              <div className="flex flex-col gap-4">
                <GulirKeHash ids={["panitia", "darurat"]} />
                {kartuPanitia}
                {kartuDarurat ? <BagianBeranda id="darurat" pratinjau={pratinjau}>{kartuDarurat}</BagianBeranda> : null}
              </div>
            ) : null
          }
          trip={trip ? { catatanQr: tH.trip.qrNote } : false}
          keluar={{
            action: `/e/${encodeURIComponent(event.slug)}/api/peserta/keluar`,
            label: t.signOut,
            // Salinan QR luring kedua bahasa portal dihapus sebelum keluar.
            lingkup: lingkupQr,
          }}
        />
      );
    }
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
      ...(kamar ? [{ href: `${keTab("beranda")}#kamar`, judul: t.roomRow, isi: (kamar.room_number === null ? [kamar.hotel.name, t.roomPending] : [kamar.room_number, teman?.map((o) => o.name).join(", ")]).filter(Boolean).join(" · "), Ikon: Bed }] : []),
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
      id === "outfit" ? { id, label: labelOutfitHalaman, labelPendek: labelOutfitHalaman, href: keTab(id) } : { id, label: tH.tabs[id], labelPendek: tH.tabsShort[id], href: keTab(id) };
    // Desktop: semua halaman di bilah atas (Profil lewat inisial). Ponsel: lima
    // tujuan (Beranda, Jadwal, QR, Perjalanan, Pengumuman); Menu lewat inisial di
    // bilah atas. Tanpa info perjalanan, tab Menu kembali. Outfit bukan tab: ia
    // bagian dari Susunan acara (keputusan Mas 20 Okt), jadi tab Jadwal menyala;
    // hanya bila Jadwal disembunyikan Outfit tetap tab desktop dan baris Menu.
    const tabsHorizon = (
      ["beranda", "jadwal", ...(adaPerjalanan ? (["perjalanan"] as const) : []), ...(adaOutfit && !outfitDiAcara ? (["outfit"] as const) : []), "info", "profil"] as const
    ).map(tabHorizon);
    const tabsBawahHorizon = (adaPerjalanan ? (["beranda", "jadwal", "perjalanan", "info"] as const) : (["beranda", "jadwal", "info", "profil"] as const)).map(tabHorizon);
    // Tab yang menyala (bukan selalu halaman ini): Outfit menyalakan Acara.
    const tabMenyala: Exclude<PortalTab, "qr"> = tabAktif === "outfit" && outfitDiAcara ? "jadwal" : tabAktif;
    // Tab yang disorot bilah bawah: Outfit di Menu dan Perjalanan yang tidak di bilah termasuk Menu.
    const aktifBawah = tabsBawahHorizon.some((tab) => tab.id === tabMenyala) ? tabMenyala : "profil";
    let badan: ReactNode;
    if (tabAktif === "beranda") {
      const namaLengkap = namaSapaan(sesi.name);
      const tampilLogistik = diBeranda("logistics");
      const tampilTeman = diBeranda("roommates") && teman && teman.length > 0;

      // Fase Beranda (keputusan Mas 20 Okt, E-15): dari tanggal dan jam acara.
      // Tanpa tanggal acara: tanpa fase, kartu perjalanan penuh seperti sebelumnya.
      const fase = faseBeranda(
        { event_date: event.event_date ?? null, end_date: event.end_date ?? null, start_time: event.start_time ?? null, end_time: event.end_time ?? null, time_zone: zona },
        sekarang.getTime(),
        kini.tanggal,
      );
      const sebelum = fase === null || fase.fase === "sebelum";
      const dinding = (iso: string) => sekarangDi(zona, new Date(iso));
      // "Berangkat" hanya pada tanggal peserta memang berangkat: kereta berangkatnya,
      // atau perjalanan bus pertamanya. Selain itu dihitung dari mulainya acara.
      const tanggalBerangkat =
        (logistik?.trains ?? []).find((leg) => leg.direction === "outbound")?.depart_date ??
        ((logistik?.transport?.trips ?? []).flatMap((trip) => (trip.bus && trip.depart_at ? [dinding(trip.depart_at).tanggal] : [])).sort()[0] ?? null);
      const teksFase = !fase
        ? null
        : fase.fase === "saat"
          ? fase.lama > 1
            ? tH.home.dayOf(fase.hariKe, fase.lama)
            : null
          : fase.fase === "sesudah"
            ? tH.home.ended
            : tanggalBerangkat === kini.tanggal
              ? tH.home.today(true)
              : tanggalBerangkat === besokTanggal
                ? tH.home.tomorrow(true)
                : fase.sisaHari === 0
                  ? tH.home.today(false)
                  : fase.sisaHari === 1
                    ? tH.home.tomorrow(false)
                    : tH.home.inDays(fase.sisaHari);

      // Sekarang dan berikutnya (E-06, U-05). Bus pagi itu dari perjalanan yang tertaut ke barisnya.
      const tampilBerikut = diBeranda("next") && tampilSusunan;
      const sedang = tampilBerikut ? ringkasan.berlangsung : [];
      const berikut = tampilBerikut ? ringkasan.berikutnya : null;
      const tripPeserta = logistik?.transport?.trips ?? [];
      const hariBerikut = !berikut ? null : berikut.kapan === "hari-ini" ? (sedang.length > 0 ? tH.agenda.next : tH.today) : berikut.kapan === "besok" ? tH.tomorrow : tanggalLeg(berikut.tanggal, lang);
      const butirBerikut = (berikut?.butir ?? []).map((butir) => {
        const trip = adaPerjalanan && tampilLogistik ? tripUntukBaris(tripPeserta, dinding, agenda[butir.indeks].tanggal ?? null, butir.item) : null;
        return {
          kunci: `${butir.indeks}-${butir.item.id}`,
          label: butir.label,
          judul: tanpaLabelBagian(butir.item.title, butir.label),
          catatan: teksPolos(butir.item.subtitle) || null,
          // Jam mulai dan selesai satu baris, "08.30–12.00"; zona waktunya di catatan judul halaman.
          alis: gabungMeta([hariBerikut, butir.item.end ? `${butir.item.time}–${butir.item.end}` : butir.item.time]),
          hitung: butir.menitLagi !== null ? tH.agenda.inTime(butir.menitLagi) : null,
          bus: trip?.bus
            ? { judul: gabungMeta([labelBus(trip.bus, tH.bus), trip.depart_at ? jamDariMenit(dinding(trip.depart_at).menit, lang) : null]), catatan: trip.meeting_point ? t.meetAt(trip.meeting_point) : null }
            : null,
        };
      });
      // Tanpa yang berlangsung dan dengan satu butir berikutnya: butir sesudahnya sebagai
      // satu baris ringkas (v5T1l). Dicari dari daftar lengkap, karena butir berikutnya bisa jeda.
      const sesudahnya = (() => {
        if (sedang.length > 0 || !berikut || berikut.butir.length !== 1) return null;
        const { indeks, item, label } = berikut.butir[0];
        const semua = agenda[indeks].items;
        const lanjut = semua.slice(semua.indexOf(item) + 1).find((butir) => !butir.jeda && menitDari(butir.time) !== null);
        return lanjut ? { judul: tanpaLabelBagian(lanjut.title, label), jam: lanjut.time } : null;
      })();
      const indeksSusunan = berikut?.butir[0]?.indeks ?? sedang[0]?.indeks ?? null;
      // Tema Trip: Berikutnya sebagai linimasa tiga butir (yang berlangsung, lalu yang
      // berikutnya, lalu butir sesudahnya di hari yang sama).
      const barisBerikutTrip: BarisBerikutTrip[] = trip
        ? (() => {
            const baris: BarisBerikutTrip[] = [
              ...sedang.map((butir) => ({
                kunci: `${butir.indeks}-${butir.item.id}`,
                jam: butir.item.time,
                sampai: butir.item.end,
                judul: tanpaLabelBagian(butir.item.title, butir.label),
                catatan: gabungMeta([butir.label, teksPolos(butir.item.subtitle) || null]) || null,
                lencana: tH.agenda.now,
                aktif: true,
              })),
              ...(berikut?.butir ?? []).map((butir, urut) => ({
                kunci: `${butir.indeks}-${butir.item.id}`,
                jam: butir.item.time,
                sampai: butir.item.end,
                judul: tanpaLabelBagian(butir.item.title, butir.label),
                catatan: gabungMeta([butir.label, teksPolos(butir.item.subtitle) || null, butirBerikut[urut]?.bus?.judul ?? null]) || null,
                lencana: butir.menitLagi !== null ? tH.agenda.inTime(butir.menitLagi) : null,
                aktif: false,
              })),
            ];
            const akhir = berikut?.butir.at(-1) ?? null;
            if (akhir && berikut?.butir.length === 1) {
              const semua = agenda[akhir.indeks].items;
              for (const lanjut of semua.slice(semua.indexOf(akhir.item) + 1)) {
                if (baris.length >= 3) break;
                if (lanjut.jeda || menitDari(lanjut.time) === null) continue;
                baris.push({ kunci: `${akhir.indeks}-${lanjut.id}`, jam: lanjut.time, sampai: lanjut.end, judul: tanpaLabelBagian(lanjut.title, akhir.label), catatan: teksPolos(lanjut.subtitle) || null, lencana: null, aktif: false });
              }
            }
            return baris.slice(0, Math.max(3, sedang.length + 1));
          })()
        : [];
      const kartuSekarang = trip ? (
        barisBerikutTrip.length > 0 ? (
          <BerikutnyaTrip
            judul={tH.trip.next}
            meta={!berikut || berikut.kapan === "hari-ini" ? tH.today : hariBerikut}
            baris={barisBerikutTrip}
            tautan={
              indeksSusunan !== null
                ? {
                    href: keTab("jadwal", { hari: String(indeksSusunan + 1) }),
                    label: !berikut || berikut.kapan === "hari-ini" ? tH.home.scheduleToday : tH.home.scheduleDay(tanggalLeg(berikut.tanggal, lang) ?? hariPendekTanggal(berikut.tanggal, lang)),
                    tab: "jadwal",
                  }
                : null
            }
          />
        ) : null
      ) : sedang.length > 0 || butirBerikut.length > 0 ? (
          <KartuSekarangHorizon
            berlangsung={
              sedang.length > 0
                ? {
                    status: tH.agenda.now,
                    butir: sedang.map((butir) => ({
                      kunci: `${butir.indeks}-${butir.item.id}`,
                      label: butir.label,
                      judul: tanpaLabelBagian(butir.item.title, butir.label),
                      catatan: teksPolos(butir.item.subtitle) || null,
                      sampai: butir.sampai ? tH.agenda.until(butir.sampai) : null,
                    })),
                  }
                : null
            }
            berikutnya={butirBerikut}
            sesudahnya={sesudahnya}
            tautan={
              indeksSusunan !== null
                ? {
                    href: keTab("jadwal", { hari: String(indeksSusunan + 1) }),
                    label: !berikut || berikut.kapan === "hari-ini" ? tH.home.scheduleToday : tH.home.scheduleDay(tanggalLeg(berikut.tanggal, lang) ?? hariPendekTanggal(berikut.tanggal, lang)),
                    tab: "jadwal",
                  }
                : null
            }
          />
        ) : null;

      // Pengumuman (U-03): yang belum dibaca dulu; yang disematkan tampil bila tidak ada kabar baru.
      const tampilPengumuman = diBeranda("announcements") && pengumuman.ready && pengumuman.items.length > 0;
      const belumDibaca = pengumuman.items.filter((item) => isUnread(item, pengumuman.seenAt)).sort((a, b) => b.published_at.localeCompare(a.published_at));
      const itemBeranda = belumDibaca[0] ?? pengumuman.items[0] ?? null;
      const disematkanLain = pengumuman.items.filter((item) => item.pinned && item.id !== itemBeranda?.id).length;
      const kartuPengumumanHorizon = tampilPengumuman ? (
        <KartuPengumumanHorizon
          judul={t.announcementsTitle}
          label={tH.home.announcement}
          baru={belumDibaca.length > 0 ? t.isNew : null}
          item={itemBeranda ? { judul: itemBeranda.title, isi: itemBeranda.body?.trim() || null, waktu: waktuPengumuman(itemBeranda.published_at, zona, lang) } : null}
          tautan={{ href: keTab("info"), label: belumDibaca.length > 0 && disematkanLain > 0 ? tH.pinnedMore(disematkanLain) : tH.home.allAnnouncements }}
          kosong={t.noAnnouncements}
        />
      ) : null;

      // Dresscode hari ini (saat acara) atau tanggal berikutnya (sebelum acara), ikut batch peserta.
      // Sesudah acara tidak lagi berguna, jadi tidak tampil. Acara tanpa tab Agenda
      // (hanya Setiap hari): hari-harinya dari tanggal acara.
      const hariBeranda: { tanggal: string | null; sectionTitle: string | null; outfit: OutfitEntry[] }[] =
        hariOutfit.length > 0 ? hariOutfit : hariTanpaAgenda(event.event_date, event.end_date, kini.tanggal).map((tanggal) => ({ tanggal, sectionTitle: null, outfit: [] }));
      const outfitBeranda =
        adaOutfit && diBeranda("outfit") && fase?.fase !== "sesudah" ? hariOutfitBerandaSetiapHari(hariBeranda, kini.tanggal, besokTanggal, pilihanOutfit, setiapHari) : null;
      const kartuOutfit = (() => {
        if (!outfitBeranda) return null;
        const bagian = hariBeranda[outfitBeranda.indeks];
        const baris = tH.outfit.row;
        const judul =
          outfitBeranda.jenis === "nanti"
            ? baris.nanti(labelOutfitHalaman, (bagian.tanggal ? tanggalLeg(bagian.tanggal, lang) : null) ?? bagian.sectionTitle?.trim() ?? t.day(outfitBeranda.indeks + 1))
            : baris[outfitBeranda.jenis](labelOutfitHalaman);
        // Tanggalnya (bukan hari ini) dan batch peserta bila tanggal itu punya beberapa bagian.
        const hariItu = kelompokkanHari(hariBeranda).find((item) => item.bagian.some((isi) => isi.indeks === outfitBeranda.indeks));
        const kelompok = hariItu && hariItu.bagian.length > 1 && pilihanOutfit.milik.has(outfitBeranda.indeks) ? pilihanOutfit.kelompok : null;
        return (
          <KartuOutfitBerandaHorizon
            judul={judul}
            meta={
              // "nanti" sudah menulis tanggalnya di judul ("Dresscode · Jum, 6 Nov").
              outfitBeranda.jenis === "hariIni" || outfitBeranda.jenis === "nanti"
                ? kelompok
                  ? tH.home.forGroup(kelompok)
                  : null
                : gabungMeta([bagian.tanggal ? tanggalSapaan(bagian.tanggal, lang) : null, kelompok]) || null
            }
            isian={denganSetiapHari(bagian.outfit, setiapHari, tH.outfit.everyDay).map((isian, index) => ({ kunci: String(index), kapan: isian.when?.trim() || null, apa: apaRingkas(isian, tH.outfit.optionsShort), catatan: isian.note?.trim() || null, foto: fotoRingkas(isian) }))}
            tautan={{ href: keTab("outfit", hariOutfit.length > 0 ? { hari: String(outfitBeranda.indeks + 1) } : {}), label: tH.home.seeAll, tab: "outfit", lampu: outfitDiAcara ? "jadwal" : undefined }}
          />
        );
      })();

      // Checkpoint: kartu putih ringkas di tempatnya, juga sesudah semua selesai.
      const tampilCheckpoint = diBeranda("checkpoints") && checkpoint !== null;
      const kartuCheckpointHorizon = tampilCheckpoint ? (
        <KartuCheckpointHorizon data={checkpoint} lang={lang} zona={zona} qrHref={tampilKode ? keTab("qr") : null} slug={event.slug} berakhir={fase?.fase === "sesudah"} trip={trip} />
      ) : null;

      // Bus and room: sebelum berangkat kartu perjalanan penuh (dengan kereta berikutnya di
      // faktanya); selama acara ringkasan Perjalananmu; sesudahnya hanya kereta yang belum berangkat.
      const legBeranda = tampilLogistik ? legBerikutnya(logistik?.trains ?? [], kini) : null;
      // Kartu perjalanan (sebelum acara): tiket berangkat, juga sesudah keretanya jalan menjelang
      // acara; tiket pulang hanya bila tidak ada tiket berangkat, dan diberi label "Pulang".
      const legPass = tampilLogistik ? ((logistik?.trains ?? []).find((leg) => leg.direction === "outbound") ?? legBeranda) : null;
      const faktaKereta: FaktaPass[] = legPass
        ? [
            ...(legPass.depart_date || legPass.depart_time
              ? [
                  {
                    label: legPass.direction === "return" ? tH.train.return : tH.home.departs,
                    nilai: [legPass.depart_date ? chipTanggal(legPass.depart_date, lang).atas : null, jamTampil(legPass.depart_time, lang)].filter(Boolean).join(", "),
                    ponsel: true,
                    pendek: true,
                  },
                ]
              : []),
            ...(legPass.carriage ? [{ label: tH.train.carriage, nilai: legPass.carriage, ponsel: true, pendek: true }] : []),
            ...(legPass.seat ? [{ label: tH.train.seat, nilai: legPass.seat, ponsel: true, pendek: true }] : []),
          ]
        : [];
      // Peserta yang pindah hotel (GRAMM 5-6 lalu RAY 6-8): semua hotelnya di kartu,
      // masing-masing dengan tanggal dan kamarnya, seperti itinerary multi-stay
      // Booking.com. Kamar dan teman sekamar ada di baris tiap hotel dan di Perjalanan.
      const stayPass = tampilLogistik && logistik && logistik.stays.length > 1 ? logistik.stays : null;
      const tanggalStay = (stay: LogistikKamar) =>
        stay.check_in_at && stay.check_out_at
          ? formatEventDateRingkas({ event_date: dinding(stay.check_in_at).tanggal, end_date: dinding(stay.check_out_at).tanggal, start_time: null, end_time: null, time_zone: zona }, lang, true, false)
          : null;
      const faktaHotel = (ponsel: boolean): FaktaPass[] =>
        stayPass
          ? [
              {
                label: tH.hotel,
                // Pindah kamar di hotel yang sama: nama hotelnya sekali saja.
                nilai: [...new Set(stayPass.map((stay) => stay.hotel?.name?.trim() || tH.hotel))].join(", "),
                ponsel,
                lebar: true,
                daftar: stayPass.map((stay) => ({
                  judul: stay.hotel?.name?.trim() || tH.hotel,
                  catatan: gabungMeta([tanggalStay(stay), stay.room_number ? tH.roomNo(stay.room_number) : t.roomPending]) || null,
                })),
              },
            ]
          : kamar?.hotel?.name?.trim()
            ? [{ label: tH.hotel, nilai: kamar.hotel.name.trim(), ponsel, lebar: true }]
            : [];
      const fakta: FaktaPass[] =
        faktaKereta.length > 0
          ? [
              ...faktaKereta,
              ...faktaHotel(false),
              ...(namaBus ? [{ label: tH.bus, nilai: namaBus, ponsel: false, pendek: true }] : []),
            ]
          : [
              { label: tH.participant, nilai: sesi.name, ponsel: false },
              ...(tampilLogistik ? faktaHotel(true) : []),
              ...(tampilLogistik && namaBus ? [{ label: tH.bus, nilai: namaBus, ponsel: true, pendek: true }] : []),
              ...(tampilLogistik && kamar && !stayPass ? [{ label: tH.room, nilai: kamar.room_number ?? tH.roomPending, ponsel: true, pendek: true }] : []),
              ...(tampilTeman && !stayPass ? [{ label: tH.roommate(teman.length), nilai: teman.map((orang) => orang.name).join(", "), ponsel: false }] : []),
            ];
      // Tanggal kartu = perjalanan peserta sendiri: tanggal acara dilebarkan oleh
      // stay, tiket kereta, dan perjalanan bus yang dinaikinya. Bila berbeda,
      // tanggal acara ikut ditulis kecil ("5–8 Nov 2026 · Acara 6–8 Nov").
      const rentang = rentangPerjalanan(
        { mulai: event.event_date ?? null, selesai: event.end_date ?? null },
        tampilLogistik && logistik
          ? [
              ...logistik.stays.flatMap((stay) => [stay.check_in_at, stay.check_out_at]),
              ...(kamar ? [kamar.check_in_at, kamar.check_out_at] : []),
              ...(logistik.transport?.trips ?? []).flatMap((trip) => (trip.bus ? [trip.depart_at] : [])),
            ]
              .flatMap((iso) => (iso ? [dinding(iso).tanggal] : []))
              .concat(logistik.trains.flatMap((leg) => (leg.depart_date ? [leg.depart_date] : [])))
          : [],
      );
      const jadwalPass = rentang?.berbeda ? { event_date: rentang.mulai, end_date: rentang.selesai, start_time: null, end_time: null, time_zone: zona } : event;
      const catatanAcara = rentang?.berbeda ? tH.home.eventDates(formatEventDateRingkas(event, lang, true, false) ?? "") : null;
      const kartuPass = sebelum ? (
        <PassHorizon
          kv={latarKv?.src ?? null}
          label={gabungMeta([LANDING_UI[lang].horizon.pass, pilihanKu.kelompok])}
          tanggalPendek={gabungMeta([formatEventDateRingkas(jadwalPass, lang), catatanAcara]) || null}
          tanggalPanjang={gabungMeta([formatEventDateRingkas(jadwalPass, lang, false), catatanAcara]) || null}
          dari={config.pass_from?.trim() || null}
          ke={config.pass_to?.trim() || venue || nama}
          fakta={fakta}
          qr={tampilKode && peserta ? { href: keTab("qr"), label: t.qrTitle, perbesar: tH.enlargeQr, kode: <QrMini code={peserta.qr_code} alt="" /> } : null}
          detail={adaPerjalanan && tampilLogistik ? { href: keTab("perjalanan"), label: tH.home.travelLink } : null}
        />
      ) : null;
      const barisPerjalanan =
        !sebelum && tampilLogistik
          ? [
              ...(fase?.fase === "saat" && kamar
                ? [
                    {
                      kunci: "hotel",
                      label: tH.hotel,
                      judul: kamar.hotel?.name?.trim() || (kamar.room_number ? tH.roomNo(kamar.room_number) : t.roomPending),
                      catatan: gabungMeta([
                        kamar.hotel?.name?.trim() ? (kamar.room_number ? tH.roomNo(kamar.room_number) : t.roomPending) : null,
                        tampilTeman ? tH.home.roommates(teman.map((orang) => orang.name).join(", "), teman.length) : null,
                      ]) || null,
                    },
                  ]
                : []),
              ...(legBeranda
                ? [
                    {
                      kunci: "kereta",
                      label: tH.home.trainNext(legBeranda.direction === "return"),
                      judul: gabungMeta([tanggalLeg(legBeranda.depart_date, lang), jamTampil(legBeranda.depart_time, lang)]) || ruteLeg(legBeranda) || legBeranda.train_name,
                      catatan: tH.travel.seatLine(legBeranda.carriage, legBeranda.seat),
                    },
                  ]
                : []),
              ...(fase?.fase === "saat" && !kamar && !legBeranda && namaBus
                ? [{ kunci: "bus", label: tH.bus, judul: labelBus(namaBus, tH.bus), catatan: perjalananBus?.meeting_point ? t.meetAt(perjalananBus.meeting_point) : null }]
                : []),
            ]
          : [];
      const kartuPerjalananmu =
        barisPerjalanan.length > 0 ? (
          <KartuPerjalananmuHorizon judul={tH.home.travelTitle} tautan={adaPerjalanan ? { href: keTab("perjalanan"), label: tH.home.travelLink, tab: "perjalanan" } : null} baris={barisPerjalanan} />
        ) : null;
      // Tema Trip: Perjalananmu berisi semua pesanan peserta (kereta pergi, hotel,
      // kendaraan, kereta pulang), tiap baris menuju bagiannya di Perjalanan.
      const staysTrip = (logistik?.stays.length ?? 0) > 1 ? (logistik?.stays ?? []) : kamar ? [kamar] : [];
      const barisKeretaTrip = (arah: "outbound" | "return") =>
        (logistik?.trains ?? [])
          .filter((leg) => leg.direction === arah)
          .map((leg, urut) => ({
            kunci: `kereta-${arah}-${urut}`,
            href: `${keTab("perjalanan")}#kereta`,
            Ikon: Train,
            nada: "kereta" as const,
            judul: ruteLeg(leg) || leg.train_name || tH.train.title,
            catatan: gabungMeta([gabungMeta([tanggalLeg(leg.depart_date, lang), jamTampil(leg.depart_time, lang)]) || null, tH.travel.seatLine(leg.carriage, leg.seat)]) || null,
          }));
      const barisPerjalananTrip =
        trip && adaPerjalanan && tampilLogistik
          ? [
              ...barisKeretaTrip("outbound"),
              ...staysTrip.map((stay, urut) => ({
                kunci: `hotel-${urut}`,
                href: `${keTab("perjalanan")}#hotel`,
                Ikon: Bed,
                nada: "hotel" as const,
                judul: stay.hotel?.name?.trim() || tH.hotel,
                catatan: gabungMeta([tanggalStay(stay), stay.room_number ? tH.roomNo(stay.room_number) : t.roomPending]) || null,
              })),
              ...(namaBus
                ? [
                    {
                      kunci: "bus",
                      href: `${keTab("perjalanan")}#kendaraan`,
                      Ikon: Bus,
                      nada: "bus" as const,
                      judul: labelBus(namaBus, tH.bus),
                      catatan:
                        gabungMeta([
                          // "ZENIX A · 2 perjalanan" terbaca dua-duanya naik ZENIX A; bila kendaraannya
                          // berbeda, baris ini cukup kendaraan dan jam perjalanan berikutnya.
                          perjalananBusHorizon.length > 0 && !banyakKendaraan ? tH.travel.tripCount(perjalananBusHorizon.length) : null,
                          perjalananBus?.depart_at ? gabungMeta([tanggalLeg(dinding(perjalananBus.depart_at).tanggal, lang), jamDariMenit(dinding(perjalananBus.depart_at).menit, lang)]) : null,
                        ]) || null,
                    },
                  ]
                : []),
              ...barisKeretaTrip("return"),
            ]
          : [];
      const kartuPerjalananTrip =
        barisPerjalananTrip.length > 0 ? (
          <PerjalananmuTrip judul={tH.home.travelTitle} tautan={{ href: keTab("perjalanan"), label: tH.trip.seeAll }} baris={barisPerjalananTrip} />
        ) : null;
      // Simpan QR ke galeri (U-02): ponsel, dari tiga hari sebelum acara sampai acara mulai.
      const tampilSimpanQr = Boolean(tampilKode && peserta && event.event_date && fase?.fase === "sebelum" && kini.tanggal >= geserTanggal(event.event_date, -3));
      const kartuSimpanQr =
        tampilSimpanQr && peserta ? (
          <div className="lg:hidden">
            <SimpanQrGaleri kode={peserta.qr_code} acara={nama} nama={peserta.name} jadwal={formatEventSchedule(event, lang)} lang={lang} teks={tH.saveQrRow} />
          </div>
        ) : null;
      const kartuLogistik =
        kartuPass || kartuPerjalananmu || kartuPerjalananTrip || kartuSimpanQr ? (
          <div className="flex flex-col gap-6">
            {trip && kartuPerjalananTrip ? kartuPerjalananTrip : (kartuPass ?? kartuPerjalananmu)}
            {kartuSimpanQr}
          </div>
        ) : null;

      // QR kehadiran di kolom samping desktop (tanpa bilah bawah), kecuali bila kartu perjalanan sudah membawa sobekan QR.
      // Tema Trip: kartu peserta dengan sobekan QR, paling atas di ponsel (order 0) dan
      // menempel di kolom samping desktop. Menggantikan sobekan QR kartu perjalanan.
      const kartuQrSamping = trip ? (
        tampilKode && peserta ? (
          <div className="order-[0] lg:order-none">
            <KartuPesertaTrip
              alis={gabungMeta([tH.trip.pass, pilihanKu.kelompok])}
              nama={sesi.name}
              catatan={gabungMeta([formatEventDateRingkas(event, lang), venue]) || null}
              qr={{ href: keTab("qr"), judul: t.qrTitle, kode: peserta.qr_code, tombol: tH.trip.show, gambar: <QrMini code={peserta.qr_code} alt="" /> }}
            />
          </div>
        ) : null
      ) : tampilKode && peserta && !kartuPass ? (
          <KartuQrSampingHorizon href={keTab("qr")} judul={t.qrTitle} tombol={tH.qr.showQr} kode={<QrMini code={peserta.qr_code} alt="" />} />
        ) : null;
      // Bantuan di Beranda: dua baris ke Profil, hanya bila daftarnya terisi.
      const panitiaBeranda = daftarKontakPanitia(config);
      const barisBantuan = [
        ...(panitiaBeranda.length > 0
          ? [{ href: `${keTab("profil")}#panitia`, judul: tH.profile.organisersTitle, isi: panitiaBeranda.map((item) => item.nama).filter(Boolean).join(", ") || null, Ikon: Headset, tab: "profil" }]
          : []),
        ...(adaDarurat ? [{ href: `${keTab("profil")}#darurat`, judul: judulDarurat, isi: tH.helpCard.emergencyRow, Ikon: Lifebuoy, tab: "profil", nada: "merah" as const }] : []),
      ];
      const kartuBantuan = barisBantuan.length > 0 && diBeranda("help") ? <KartuBantuanBeranda judul={tH.helpCard.eyebrow} baris={barisBantuan} /> : null;

      // Urutan ponsel dari Participant home (lib/member/susunan-horizon.ts, keputusan
      // Mas 20 Okt): Next up paling atas (hanya Announcements boleh di atasnya), Help
      // card paling bawah, sisanya diatur panitia; simpanan lama hanya menyimpan tempat
      // Announcements. Teman sekamar ada di kartu perjalanan, jadi tanpa kartu sendiri.
      // Desktop: kolom utama dan kolom samping (pengumuman, dresscode, QR).
      const urutan = urutanHorizon(member.home, [...kartuBlok.keys()]).filter(
        (id) => id !== "roommates" && id !== "help" && (!kartuBlok.has(id) || (diBeranda(id) && !idRutePerjalanan.has(id))),
      );
      const isiKartu = (id: string): ReactNode =>
        id === "announcements"
          ? kartuPengumumanHorizon
          : id === "next"
            ? kartuSekarang
            : id === "outfit"
              ? kartuOutfit
              : id === "checkpoints"
                ? kartuCheckpointHorizon
                : id === "logistics"
                  ? kartuLogistik
                  : (kartuBlok.get(id) ?? null);
      const SAMPING = new Set(["announcements", "outfit"]);
      const temanDiKartu = Boolean(tampilTeman && fase?.fase === "saat" && kamar);
      // Di bawah lg kartu diurutkan dengan `order` lewat pembungkus `contents`;
      // reading-flow membuat urutan baca dan Tab mengikuti urutan tampil (U-19).
      const susun = (id: string) => {
        const isi = isiKartu(id);
        if (!isi) return null;
        const kartu = (
          <BagianBeranda key={id} id={id} pratinjau={pratinjau}>
            <div className="order-[var(--urut)] lg:order-none" style={{ "--urut": urutan.indexOf(id) + 1 } as CSSProperties}>
              {isi}
            </div>
          </BagianBeranda>
        );
        // Teman sekamar kini satu baris di kartu Perjalananmu selama acara, jadi baris
        // Roommates di Participant home menyorot kartu itu bila barisnya ada.
        return id === "logistics" && temanDiKartu ? (
          <BagianBeranda key={id} id="roommates" pratinjau={pratinjau}>
            {kartu}
          </BagianBeranda>
        ) : (
          kartu
        );
      };
      const kartuSamping = ["announcements", "outfit"].map(susun).filter(Boolean);
      badan = (
        <>
          <SapaanHorizon
            alisDiCatatan
            sapaan
            alis={gabungMeta([tanggalSapaan(kini.tanggal, lang), teksFase])}
            judul={tH.home.heading(namaLengkap)}
            judulPonsel={tH.home.heading(namaLengkap)}
            catatan={tH.home.timeNote(singkatanZona)}
            catatanPonsel
          />
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 pb-10 pt-6 md:px-16 md:pt-3">
            {pitaEmail || lengkapi.length > 0 ? (
              <div className="flex flex-col gap-4">
                {pitaEmail}
                <KartuLengkapi lang={lang} href={`${halamanAcara}/lengkapi`} fields={lengkapi} gaya="gathering" />
              </div>
            ) : null}
            <div className="flex flex-col gap-6 max-lg:[reading-flow:flex-visual] lg:grid lg:grid-cols-[minmax(0,790px)_minmax(320px,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-6">
              <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
                {statusPendaftaran ? <div className="order-[0] lg:order-none">{statusPendaftaran}</div> : null}
                {urutan.filter((id) => !SAMPING.has(id)).map(susun)}
                {/* Bantuan selalu paling bawah: di ponsel dan di akhir kolom utama desktop. */}
                {kartuBantuan ? (
                  <BagianBeranda id="help" pratinjau={pratinjau}>
                    <div className="order-[999] lg:order-none">{kartuBantuan}</div>
                  </BagianBeranda>
                ) : null}
              </div>
              {/* Kolom samping, urutannya tetap (pengumuman, dresscode, QR); tempat
                  Announcements yang disimpan hanya berlaku di ponsel. Menempel saat digulir,
                  seperti kotak pemesanan di listing Airbnb, hanya di layar setinggi 940 px
                  atau lebih, supaya tombol QR di bawahnya tidak terpotong. Jarak atas =
                  bilah atas 102 px ditambah 24. */}
              {kartuSamping.length > 0 || kartuQrSamping ? (
                <div className="contents min-w-0 lg:sticky lg:top-[126px] lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-6 lg:[@media(max-height:939px)]:static">
                  {kartuSamping}
                  {kartuQrSamping}
                </div>
              ) : null}
            </div>
          </div>
        </>
      );
    } else {
      badan = (
        <>
          {judulHorizon ? (
            <SapaanHorizon
              alisDiCatatan={tabAktif === "jadwal"}
              alis={judulHorizon.alis}
              judul={judulHorizon.judul}
              judulPonsel={judulHorizon.judulPonsel ?? judulHorizon.judul}
              catatan={judulHorizon.catatan}
              catatanPonsel
              kembali={judulHorizon.kembali ?? (tabAktif === "perjalanan" && !adaPerjalanan ? { href: keTab("profil"), label: tH.travel.backToMenu } : null)}
            />
          ) : (
            <PitaKepalaHorizon>{kepala}</PitaKepalaHorizon>
          )}
          <div className={`relative mx-auto w-full max-w-[1440px] px-6 md:px-16 ${judulHorizon ? "pt-6 md:pt-3" : "-mt-3 md:-mt-6"}`}>{isi}</div>
        </>
      );
    }
    // Lencana Pengumuman (U-03): jumlah yang belum dibaca; tidak di tab Pengumuman sendiri.
    const infoBelum = tabAktif === "info" ? 0 : pengumuman.unread;
    // Judul tab tujuan untuk kerangka saat pindah tab (U-10).
    const namaLengkapSesi = namaSapaan(sesi.name);
    const kepalaTab: Record<string, KepalaTab> = {
      beranda: { alis: tanggalSapaan(kini.tanggal, lang), judul: tH.home.heading(namaLengkapSesi), judulPonsel: tH.home.heading(namaLengkapSesi), catatan: tH.home.timeNote(singkatanZona), jenis: "kartu", sapaan: true },
      jadwal: { alis: alisJadwal || nama, judul: t.schedule, judulPonsel: t.schedule, catatan: catatanJadwal, jenis: "jadwal" },
      perjalanan: { alis: nama, judul: tH.tabs.perjalanan, judulPonsel: tH.tabs.perjalanan, catatan: tH.travel.note(singkatanZona), jenis: "kartu" },
      outfit: { alis: outfitDiAcara ? t.schedule : nama, judul: labelOutfitHalaman, judulPonsel: labelOutfitHalaman, catatan: tH.outfit.note, jenis: outfitDiAcara ? "jadwal" : "kartu" },
      info: { alis: nama, judul: tH.tabs.info, judulPonsel: tH.tabs.info, catatan: t.infoNote, jenis: "kartu" },
      profil: { alis: nama, judul: tH.tabs.profil, judulPonsel: tH.tabs.profil, catatan: tH.profile.note, jenis: "kartu" },
    };
    // Lapisan QR (U-02): bukan di pratinjau admin, supaya peramban panitia tidak
    // menyimpan QR peserta atau memasang service worker portal.
    const dataQr = tampilKode && peserta && !pratinjau ? dataLapisanQr(namaBus, labelPil(pilihanKu.kelompok, namaBus, tH.bus)) : null;
    if (dataQr && setelanCheckpoint?.enabled) dataQr.teks.petunjukCatatan = tH.qr.showNoteCheckpoint;
    if (dataQr && checkpointQr?.pindai) dataQr.pindai = event.slug;
    const isiPortal = (
      <>
        <FokusPemicuQr />
        <KepalaHorizon
          logo={logo ?? config.hero_logo_url ?? null}
          nama={nama}
          homeHref={halamanAcara}
          tabs={tabsHorizon}
          aktif={tabMenyala}
          halaman={tabAktif}
          inisial={inisial}
          profilLabel={tH.profileAriaWith(inisial)}
          infoBelum={infoBelum}
          infoBelumLabel={tH.unread(infoBelum)}
          tabsAria={t.tabsAria}
        />
        {/* Bilah atas dan bawah di luar <main> (U-13): landmark utama hanya isi tab. */}
        <main>{badan}</main>
        <NavBawahHorizon tabs={tabsBawahHorizon} aktif={aktifBawah} halaman={tabAktif} tabsAria={t.tabsAria} infoBelum={infoBelum} infoBelumLabel={tH.unread(infoBelum)} qr={
            tampilKode && peserta
              ? {
                  href: tabAktif === "beranda" ? keTab("qr") : keTab("qr", { dari: tabAktif, ...((tabAktif === "jadwal" || tabAktif === "outfit") && hari ? { hari: String(hari) } : {}) }),
                  label: tH.showQr,
                  labelPendek: "QR",
                }
              : null
          }
        />
        {!pratinjau ? <KerangkaPortal kepala={kepalaTab} garisLabel={tH.loading} /> : null}
      </>
    );
    return (
      // Bilah bawah dipakai sampai 1024 px (U-18), jadi ruang bawahnya juga.
      <div lang={LANDING_LANG_LABELS[lang].htmlLang} className={`min-h-dvh ${tampilKode && peserta ? "pb-[calc(124px+env(safe-area-inset-bottom))]" : "pb-[calc(100px+env(safe-area-inset-bottom))]"} text-[#101E38] lg:pb-16`} style={gaya}>
        <HtmlLang lang={LANDING_LANG_LABELS[lang].htmlLang} />
        {dataQr ? <PenyediaQr data={dataQr}>{isiPortal}</PenyediaQr> : isiPortal}
        {!dataQr && !pratinjau ? <HapusSalinanQr lingkup={lingkupQr} /> : null}
      </div>
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
          {menuTab.map(({ id, label, pendek, Ikon }) => (
            <li key={id}>
              <Link
                href={keTab(id)}
                aria-current={id === tabAktif ? "page" : undefined}
                className={`m3-state flex min-h-16 flex-col items-center justify-center gap-1 text-label-large font-bold ${id === tabAktif ? "text-[var(--alis)]" : MUTED}`}
              >
                <Ikon size={24} weight={id === tabAktif ? "fill" : "regular"} aria-hidden />
                {pendek ?? label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}

/** Warna dan huruf portal dari Tema acara; Horizon: navy dan emas, latar krem. */
function gayaPortal(config: EventLandingConfig, horizon: boolean): CSSProperties {
  const tokensTema = landingTokens(config, "modern");
  const latarHalaman = latarGathering(tokensTema.brand);
  const warna = gatheringColors(tokensTema.accent ?? undefined, tokensTema.brand, false, config.button_color);
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
    const emas = [config.button_color, tokensTema.accent].find((nilai) => /^#[0-9a-f]{6}$/i.test(nilai ?? "")) ?? HORIZON_GOLD_DEFAULT;
    // Teks emas di atas navy (label dan sorot kartu checkpoint) memakai sorot yang
    // diukur kontrasnya, sama dengan halaman acara; emas yang sudah terbaca tidak berubah.
    Object.assign(gaya, gayaHorizon(tokensTema.brand, emas, kontras(emas, "#101E38") >= 4.5 ? "#101E38" : "#ffffff", sorotHorizon(emas, tokensTema.accent, tokensTema.brand)), { backgroundColor: LATAR_PORTAL_HORIZON, "--kartu-garis": "1px", "--kartu-sudut": "16px", "--kartu-pad": "16px", "--kartu-pad-lebar": "24px" });
  }
  return gaya;
}

/** "Jum 6 Nov" (id) atau "Fri 6 Nov" (en) dari tanggal "YYYY-MM-DD". */
function hariPendekTanggal(tanggal: string, lang: LandingLang): string {
  const bagian = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(new Date(`${tanggal}T00:00:00Z`));
  const ambil = (jenis: string) => bagian.find((item) => item.type === jenis)?.value.replace(/\.$/, "") ?? "";
  return `${ambil("weekday")} ${ambil("day")} ${ambil("month")}`;
}

/** Tanggal "YYYY-MM-DD" digeser sejumlah hari. */
function geserTanggal(tanggal: string, hari: number): string {
  const waktu = new Date(`${tanggal}T00:00:00Z`);
  waktu.setUTCDate(waktu.getUTCDate() + hari);
  return waktu.toISOString().slice(0, 10);
}

/** Bus peserta: bus perjalanan berikutnya, atau bus bawaannya. */
function namaBusPeserta(logistik: LogistikPeserta, sekarang: Date): string | null {
  return agendaBerikutnya(logistik, sekarang)?.bus ?? logistik.transport?.default_bus ?? null;
}

/** Pil di bawah nama di layar QR: "Batch 2 · Bus 3", salah satunya, atau null. */
function labelPil(kelompok: string | null, bus: string | null, kata: string): string | null {
  return [kelompok, bus ? labelBus(bus, kata) : null].filter(Boolean).join(" · ") || null;
}

/** "Bus 3" apa adanya; kode yang hanya angka ("3") diberi kata "Bus" di depannya (E-10). */
function labelBus(kode: string, kata: string): string {
  return /^\d+$/.test(kode.trim()) ? `${kata} ${kode.trim()}` : kode;
}

/** "Kam, 5 Nov" (id) atau "Thu, 5 Nov" (en), dalam zona acara. */
function hariHorizon(iso: string, zona: EventTimeZone, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)).replace(/\.(?=\s|$)/g, "");
}

/** "14.00" (id) atau "14:00" (en), dalam zona acara. */
function jamHorizon(iso: string, zona: EventTimeZone, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}


/** "6 November" untuk label bab Horizon. */
function tanggalBab(tanggal: string, lang: LandingLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${tanggal}T00:00:00Z`));
}

/** Chip hari dua baris di Jadwal Horizon: "Jum" / "6 Nov" (U-06). */
function chipTanggal(tanggal: string, lang: LandingLang): { atas: string; bawah: string } {
  const bagian = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(new Date(`${tanggal}T00:00:00Z`));
  const ambil = (jenis: string) => bagian.find((item) => item.type === jenis)?.value.replace(/\.$/, "") ?? "";
  return { atas: ambil("weekday"), bawah: `${ambil("day")} ${ambil("month")}` };
}

/** "Sabtu, 7 November" di atas judul Beranda Horizon dan di kartu dresscode (tanpa tahun). */
function tanggalSapaan(tanggal: string, lang: LandingLang): string {
  return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Jam "8:20", "08:20" atau "08.20:00" menjadi "08.20" (Indonesia, seperti jam susunan acara) atau "08:20" (English), tanpa detik. */
function jamTampil(jam: string | null | undefined, lang: LandingLang): string | null {
  const cocok = jam?.match(/^(\d{1,2})[.:](\d{2})/);
  return cocok ? `${cocok[1].padStart(2, "0")}${lang === "en" ? ":" : "."}${cocok[2]}` : null;
}

/** Menit sejak tengah malam (jam dinding zona acara) menjadi "08.15". */
function jamDariMenit(menit: number, lang: LandingLang): string {
  return `${String(Math.floor(menit / 60)).padStart(2, "0")}${lang === "en" ? ":" : "."}${String(menit % 60).padStart(2, "0")}`;
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

/** "Kamis, 5 Nov" di kartu hari Susunan acara tema Trip. */
function tanggalKartuHari(tanggal: string, lang: LandingLang): string {
  return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}
