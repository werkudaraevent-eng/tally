import { loadMemberLogistics, type LogistikKamar } from "@/lib/logistik/peserta";
import { bagianTersembunyi } from "@/lib/logistik/bagian-tampil";
import { loadCheckpointQr } from "@/lib/checkpoint/server";
import { loadSasaranPeserta } from "@/lib/sasaran-bagian-server";
import { pilihanPeserta } from "@/lib/sasaran-bagian";
import { LANDING_LANG_LABELS, LANDING_UI, landingEnAvailable, landingPath } from "@/lib/landing-i18n";
import { type CSSProperties, type ReactNode } from "react";
import { HtmlLang } from "@/components/html-lang";
import { FokusPemicuQr, TutupQrEscape } from "@/components/member/qr-fokus";
import { QrHorizon } from "@/components/member/qr-horizon";
import Link from "next/link";
import { Bed, Bus, Lifebuoy, Headset, X } from "@phosphor-icons/react/dist/ssr";
import { PenyediaQr, PesanLuringQr, StatusQrHalaman, TombolPindaiQr } from "@/components/member/lapisan-qr";
import { RegistrationCodeCard } from "@/components/registration-code-card";
import { formatEventDateRingkas, formatEventSchedule } from "@/lib/event-datetime";
import { HEAD, SHELL } from "@/components/landing/modern/styles";
import { KartuBantuanBeranda, KartuPengumumanHorizon, KepalaHorizon, NavBawahHorizon, PassHorizon, PitaKepalaHorizon, SapaanHorizon, type FaktaPass, type TabHorizon } from "@/components/member/portal-horizon";
import { namaSapaan, waktuPengumuman } from "@/lib/member/nav";
import { faseBeranda } from "@/lib/member/fase-beranda";
import { ruteLeg, tanggalLeg } from "@/lib/logistik/kereta-tampil";
import { legBerikutnya, tripUntukBaris } from "@/lib/member/trip-jadwal";
import { kelompokkanHari, menitDari, tanpaLabelBagian } from "@/lib/member/hari-agenda";
import { teksPolos } from "@/lib/landing-teks-kaya";
import { gabungMeta } from "@/lib/typography";
import { BerikutnyaTrip, KartuPesertaTrip, PerjalananmuTrip, type BarisBerikutTrip } from "@/components/member/portal-trip";
import { KartuOutfitBerandaHorizon, KartuPerjalananmuHorizon, KartuQrSampingHorizon, KartuSekarangHorizon } from "@/components/member/beranda-horizon";
import { isUnread } from "@/lib/member/pengumuman";
import { type OutfitEntry } from "@/lib/outfit";
import { denganSetiapHari, hariOutfitBerandaSetiapHari, hariTanpaAgenda } from "@/lib/outfit-setiap-hari";
import { apaRingkas, fotoRingkas } from "@/lib/outfit";
import { KartuCheckpointHorizon } from "@/components/member/kartu-checkpoint-horizon";
import { rentangPerjalanan } from "@/lib/member/rentang-perjalanan";
import { QrMini } from "@/components/member/qr-mini";
import { ikonModa } from "@/components/member/ikon-moda";
import { SimpanQrGaleri } from "@/components/member/simpan-qr-galeri";
import { daftarKontakPanitia } from "@/lib/kontak-panitia";
import { urutanHorizon } from "@/lib/member/susunan-horizon";
import { BagianBeranda } from "@/components/member/bagian-beranda";
import { KartuKilas } from "@/components/member/kartu-kilas";
import { KartuLengkapi } from "@/components/member/kartu-lengkapi";
import { KerangkaPortal, type KepalaTab } from "@/components/member/muat-portal";
import { modaTiket } from "@/lib/logistik/moda";
import { PopupPengumuman } from "@/components/member/popup-pengumuman";
import { AjakanNotifikasi } from "@/components/member/ajakan-notifikasi";
import { HapusSalinanQr } from "@/components/member/form-keluar";
import { LandingNavModern } from "@/components/landing/modern/landing-nav-modern";
import { logoNavPutih } from "@/lib/domain";
import { LatarKv, inisialNama as inisialAcara } from "@/components/landing/modern/gathering-app";
import { LATAR_HERO, MUTED, type DashboardGatheringProps, type PortalTab, chipTanggal, geserTanggal, hariPendekTanggal, jamDariMenit, jamTampil, labelBus, labelPil, namaBusPeserta, sekarangDi, tanggalSapaan } from "./gathering/gathering-bantu";
import { siapkanDashboardGathering0 } from "./gathering/gathering-0";
import { siapkanDashboardGathering1 } from "./gathering/gathering-1";
import { siapkanDashboardGathering2 } from "./gathering/gathering-2";
import { siapkanDashboardGathering3 } from "./gathering/gathering-3";
export { gayaPortal, type DashboardGatheringProps, type PortalTab } from "./gathering/gathering-bantu";


export async function DashboardGathering(props: DashboardGatheringProps) {
  const h0 = await siapkanDashboardGathering0(props);
  const { tabDiminta, horizon, tampilKode, peserta, event, member, dari, keTab, hari, sekarang, tH, dataLapisanQr, lang, gaya, t, nama } = h0;
  // QR Horizon dari muat ulang atau tautan langsung: hanya kode, nama, dan bus
  // (U-02, U-10). Agenda, penginapan, dan nav tidak ditunggu, karena QR
  // dibutuhkan di gerbang, saat itu juga. Dari dalam portal, QR dibuka lapisan
  // QR klien tanpa ke server sama sekali.
  if (tabDiminta === "qr" && horizon && tampilKode && peserta) {
    const [logistikQr, { setelan: setelanCheckpoint, pindai }, sasaranQr] = await Promise.all([
      loadMemberLogistics(event.id, peserta.id, member.show_logistics === true, undefined, true, bagianTersembunyi(member)),
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
  const h1 = await siapkanDashboardGathering1({ ...h0 });
  const { tab } = h1;
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
              <p className={`mt-1 text-center text-body-medium ${MUTED}`}>{[peserta.title, peserta.company].filter(Boolean).join(", ")}</p>
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
  const h2 = await siapkanDashboardGathering2({ ...h1, ...h0 });
  const h3 = await siapkanDashboardGathering3({ ...h2, ...h1, ...h0 });
  const { sesi, zona, kini, trip, pengumuman, config, pratinjau, pantauPanitia, singkatanZona, halamanAcara } = h0;
  const { labelOutfitHalaman, adaOutfit, outfitDiAcara, diBeranda, logistik, besokTanggal, tampilSusunan, ringkasan, agenda, hariOutfit, pilihanOutfit, setiapHari, checkpoint, latarKv, pilihanKu, venue, adaDarurat, judulDarurat, kartuBlok, kartuHadiah, lengkapi, kilas, kartuDokumentasi, alisJadwal, catatanJadwal, setelanCheckpoint, checkpointQr, logo, inisial, navPeserta, lingkupQr } = h1;
  const { adaPerjalanan, tabAktif, teman, kamar, namaBus, perjalananBus, judulKereta, perjalananBusHorizon, banyakKendaraan, idRutePerjalanan, pitaEmail, statusPendaftaran, tiketSemua } = h2;
  const { judulHorizon, kepala, isi } = h3;
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
                      label: tH.home.trainNext(legBeranda.direction === "return", legBeranda.mode),
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
            Ikon: ikonModa(leg.mode),
            nada: "kereta" as const,
            judul: ruteLeg(leg) || leg.train_name || judulKereta,
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
              alis={pilihanKu.kelompok || null}
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
      const hadiahBawah = kartuHadiah(trip ? "trip" : "horizon", "bawah", urutan.includes("next"));
      const isiKartu = (id: string): ReactNode =>
        id === "announcements"
          ? kartuPengumumanHorizon
          : id === "next"
            ? (hadiahBawah ? (
                <div className="flex flex-col gap-6">
                  {kartuSekarang}
                  {hadiahBawah}
                </div>
              ) : kartuSekarang)
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
      const kartuPantau = pantauPanitia(trip ? "trip" : "horizon");
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
            {pitaEmail || lengkapi.length > 0 || kilas ? (
              <div className="flex flex-col gap-4">
                {pitaEmail}
                <KartuKilas lang={lang} href={kilas} />
                <KartuLengkapi lang={lang} href={`${halamanAcara}/lengkapi`} fields={lengkapi} gaya="gathering" />
              </div>
            ) : null}
            <div className="flex flex-col gap-6 max-lg:[reading-flow:flex-visual] lg:grid lg:grid-cols-[minmax(0,790px)_minmax(320px,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-6">
              <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
                {statusPendaftaran ? <div className="order-[0] lg:order-none">{statusPendaftaran}</div> : null}
                {kartuPantau ? <div className="order-[0] lg:order-none">{kartuPantau}</div> : null}
                {kartuHadiah(trip ? "trip" : "horizon", "atas", urutan.includes("next"))}
                {kartuDokumentasi(trip ? "trip" : "horizon")}
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
      perjalanan: { alis: nama, judul: tH.tabs.perjalanan, judulPonsel: tH.tabs.perjalanan, catatan: tH.travel.note(singkatanZona, bagianTersembunyi(member).size > 0, modaTiket(tiketSemua)), jenis: "kartu" },
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
        {/* Bilah atas Horizon bukan LandingNavModern, jadi pop-up dipasang di sini. */}
        {!pratinjau && navPeserta.lonceng?.popup.length ? <PopupPengumuman items={navPeserta.lonceng.popup} lang={lang} /> : null}
        {!pratinjau && navPeserta.notifikasi ? <AjakanNotifikasi data={navPeserta.notifikasi} lang={lang} /> : null}
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
  const { lainnya, utama } = h0;
  const { menuAtas, subNama, menuTab } = h1;
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
