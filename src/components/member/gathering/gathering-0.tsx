import { PORTAL_UI } from "@/lib/member/portal-i18n";
import { PESERTA_UI } from "@/lib/member/peserta-i18n";
import { landingDefaultLang, landingPath, resolveLanding, withQuery, type LandingLang } from "@/lib/landing-i18n";
import { normalizeTimeZone, timeZoneAbbr } from "@/lib/timezone";
import { KartuPanitia, type GayaKartuPanitia } from "@/components/member/kartu-panitia";
import { panitiaDiPortal } from "@/lib/member/panitia";
import { publicEventName } from "@/lib/domain";
import { type DataLapisanQr } from "@/components/member/lapisan-qr";
import { gabungMeta } from "@/lib/typography";
import { formatEventDateRingkas, formatEventSchedule } from "@/lib/event-datetime";
import { DashboardGatheringProps, PortalTab, gayaPortal, labelBus, sekarangDi } from "./gathering-bantu";

/** Bagian 1 dari 4 badan DashboardGathering, dipindah apa adanya (audit platform, Fase 3). */
export async function siapkanDashboardGathering0(props: DashboardGatheringProps) {
  const {
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
  } = props;
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
  // Kehadiran untuk panitia (lib/member/akses-panitia.ts): kartu paling atas Beranda.
  const pantauPanitia = (gayaKartu: GayaKartuPanitia) =>
    panitiaDiPortal(asli, member, sesi, pratinjau) ? <KartuPanitia gaya={gayaKartu} slug={event.slug} lang={lang} href={withQuery(dasar, { tab: "panitia" })} /> : null;
  const tampilKode = Boolean(peserta) && member.show_code !== false;
  const nama = publicEventName(event);
  const tH = t.horizon;

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
  return { asli, lang, member, sesi, pengumuman, konfirmasi, tabDiminta, hari, dari, lihat, pratinjau, waktuPratinjau, t, p, event, config, utama, halamanAcara, dasar, keTab, lainnya, horizon, trip, zona, singkatanZona, sekarang, kini, gaya, peserta, pantauPanitia, tampilKode, nama, tH, dataLapisanQr };
}
