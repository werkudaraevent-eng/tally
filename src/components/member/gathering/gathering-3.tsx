import { Fragment, type ReactNode } from "react";
import { HEAD } from "@/components/landing/modern/styles";
import { KartuLengkapi } from "@/components/member/kartu-lengkapi";
import { KartuKilas } from "@/components/member/kartu-kilas";
import { BagianBeranda } from "@/components/member/bagian-beranda";
import { kelompokkanHari, statusHari, tanpaLabelBagian, type StatusButir } from "@/lib/member/hari-agenda";
import { bagianPertama } from "@/lib/sasaran-bagian";
import { type AgendaItem, type AgendaPreview } from "@/lib/landing-agenda";
import { pencocokBarisTrip, tripUntukBaris } from "@/lib/member/trip-jadwal";
import { AgendaHariTrip, BagianTrip, HariTrip, PengumumanTrip, KartuHotelTrip, RencanaTrip, TiketKeretaTrip } from "@/components/member/portal-trip";
import { gabungMeta } from "@/lib/typography";
import { ChipTanggalHorizon, GARIS_KARTU, HariJadwalHorizon, ikonJenisDarurat, KartuBantuanHorizon, KartuDaruratHorizon, KartuInfoHorizon, LATAR_STRIP, KartuOutfitHorizon, KontakKruHorizon, LATAR_PORTAL_HORIZON, LipatanHorizon, ProfilHorizon, IdentitasProfilHorizon, DataDiriHorizon, type UbinProfil, PerjalananBusHorizon, SegmenBagianHorizon, KartuRingkasOutfit, TiketKeretaHorizon, TombolKontakHorizon } from "@/components/member/portal-horizon";
import Link from "next/link";
import { ArrowSquareOut, Bed, Bus, CalendarBlank, CalendarCheck, CaretRight, CoatHanger, Flag, Globe, House, Images, Headset, Phone, PushPin, SignOut, Suitcase, Ticket, User } from "@phosphor-icons/react/dist/ssr";
import { apaRingkas, kapanOutfit } from "@/lib/outfit";
import { TeksKaya } from "@/components/landing/teks-kaya";
import { PenandaTab } from "@/components/member/muat-portal";
import { DOKUMENTASI_UI } from "@/lib/member/dokumentasi";
import { bagianTersembunyi } from "@/lib/logistik/bagian-tampil";
import { modaTiket } from "@/lib/logistik/moda";
import { type LogistikKamar } from "@/lib/logistik/peserta";
import { labelTautanPeta, landingEnAvailable, landingPath } from "@/lib/landing-i18n";
import { jenisKamar } from "@/lib/logistik/nama-kamar";
import { nomorKru } from "@/lib/logistik/kontak-kru";
import { staySaatBerangkat } from "@/lib/member/hotel-trip";
import { jamTiket, legSelesai, tanggalLeg } from "@/lib/logistik/kereta-tampil";
import { FotoBagasi } from "@/components/member/foto-bagasi";
import { rencanaTrip } from "@/lib/member/rencana-trip";
import { LompatPerjalanan } from "@/components/member/lompat-perjalanan";
import { DaftarRuteRingkas } from "@/components/landing/modern/blok-rute";
import { BukaRuteDariHash } from "@/components/member/buka-rute-dari-hash";
import { bagianOutfitTanggal } from "@/lib/outfit";
import { isUnread } from "@/lib/member/pengumuman";
import { TandaiPengumumanDibaca } from "@/components/member/tandai-pengumuman";
import { BarisNotifikasi } from "@/components/member/ajakan-notifikasi";
import { waktuPengumuman } from "@/lib/member/nav";
import { altFotoPengumuman } from "@/lib/pengumuman-foto";
import { FotoPengumuman } from "@/components/member/foto-pengumuman";
import { daftarKontakPanitia, telHref } from "@/lib/kontak-panitia";
import { QrMini } from "@/components/member/qr-mini";
import { GulirKeHash } from "@/components/member/gulir-ke-hash";
import { ALIS_HERO, Chip, JudulKepala, KARTU, MUTED, REDUP_HERO, TINTA_TANDA, TautanPortal, chipTanggal, hariHorizon, jamDariMenit, jamHorizon, labelBus, sekarangDi, tanggalBab, tanggalKartuHari, tanggalPanjangBab, tanggalSapaan } from "./gathering-bantu";
import type { siapkanDashboardGathering0 } from "./gathering-0";
import type { siapkanDashboardGathering1 } from "./gathering-1";
import type { siapkanDashboardGathering2 } from "./gathering-2";

/** Bagian 4 dari 4 badan DashboardGathering, dipindah apa adanya (audit platform, Fase 3). */
export async function siapkanDashboardGathering3(c: Awaited<ReturnType<typeof siapkanDashboardGathering0>> & Awaited<ReturnType<typeof siapkanDashboardGathering1>> & Awaited<ReturnType<typeof siapkanDashboardGathering2>>) {
  const { IkonKereta, adaDarurat, adaOutfit, adaPerjalanan, agenda, aksesCepat, alis, alisJadwal, bagasi, bantuan, banyakKendaraan, beranda, blokDarurat, catatanJadwal, checkpoint, config, diBeranda, event, halamanAcara, hari, hariOutfit, horizon, inap, indeksHariIni, inisial, judulDarurat, judulKereta, kamar, kartuBlok, kartuBus, kartuCheckpoint, kartuDokumentasi, kartuHadiah, kartuKamar, kartuKereta, kartuPengumuman, kartuRundown, kartuSelanjutnya, kartuTeman, keTab, kilas, kini, kontakDarurat, kontakHorizon, labelKontak, labelOutfitHalaman, lainnya, lang, legKereta, lengkapi, lihat, lingkupQr, logistik, lompatKereta, member, nama, namaBus, navPeserta, nomorBagasi, outfitDiAcara, outfitTampil, p, pakaiKontak, pantauPanitia, pengumuman, perjalananBus, perjalananBusHorizon, peserta, pilihanKu, pilihanOutfit, pitaEmail, pratinjau, ruteBaris, rutePerjalanan, sekarang, sesi, sesiDokumentasi, setiapHari, singkatanZona, statusPendaftaran, t, tH, tabAktif, tampilKode, tanggal, telepon, teman, tiketSemua, trip, utama, venue, zona } = c;
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
          <KartuKilas lang={lang} href={kilas} />
          {pantauPanitia("gathering")}
          {kartuHadiah("gathering", "atas", diBeranda("next"))}
          {kartuDokumentasi("gathering")}
          {beranda.order.map((id, index) => {
            // Status pendaftaran sebelum isi pertama selain Tautan cepat, seperti sebelum urutan ini ada.
            const status = index === beranda.order.findIndex((lain) => lain !== "quick") ? statusPendaftaran : null;
            const isi = !diBeranda(id) ? null : id === "quick" ? (
              <div className="lg:hidden">{aksesCepat}</div>
            ) : id === "announcements" ? (
              kartuPengumuman
            ) : id === "next" ? (
              <>
                <div className="lg:hidden">{kartuSelanjutnya(false)}</div>
                {kartuHadiah("gathering", "bawah", true)}
              </>
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
                          <Link href={hrefBagian(milik.indeks)} className="inline-flex min-h-12 items-center font-semibold text-[#101E38] underline decoration-[var(--hz-emas,currentColor)] decoration-2 underline-offset-[5px]">
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
                          catatan: item.subtitle?.trim() ? item.subtitle : null,
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
                          {item.subtitle ? <TeksKaya teks={item.subtitle} warna={TINTA_TANDA} className={`mt-1 whitespace-pre-line text-[14px] leading-5 ${MUTED}`} /> : null}
                          {/* Tautan 4 px di bawah judul tanpa margin negatif (tetap benar bila teksnya dua baris);
                              lapisan ::before memberi area ketuk 48 px tanpa menggeser apa pun. */}
                          {ruteBaris.has(item.id) ? (
                            <Link href={`${keTab("perjalanan")}#${ruteBaris.get(item.id)}`} className="relative mt-1 inline-flex items-start gap-1 self-start text-[14px] font-semibold leading-5 text-[#101E38] underline decoration-[var(--hz-emas,currentColor)] decoration-2 underline-offset-[5px] before:absolute before:inset-x-0 before:-inset-y-3.5 before:content-['']">
                              {tH.agenda.routeLink}
                              <CaretRight size={16} aria-hidden className="mt-0.5 shrink-0" />
                              <PenandaTab tab="perjalanan" />
                            </Link>
                          ) : null}
                          {adaTrip(bagian.tanggal, item) ? (
                            <Link href={keTab("perjalanan")} className="relative mt-1 inline-flex items-start gap-1 self-start text-[14px] font-semibold leading-5 text-[#101E38] underline decoration-[var(--hz-emas,currentColor)] decoration-2 underline-offset-[5px] before:absolute before:inset-x-0 before:-inset-y-3.5 before:content-['']">
                              {tH.agenda.tripLink}
                              <CaretRight size={16} aria-hidden className="mt-0.5 shrink-0" />
                              <PenandaTab tab="perjalanan" />
                            </Link>
                          ) : null}
                          {sesiDokumentasi.has(item.id) ? (
                            <a href={sesiDokumentasi.get(item.id)} target="_blank" rel="noreferrer noopener" className="relative mt-1 inline-flex items-start gap-1.5 self-start text-[14px] font-semibold leading-5 text-[#101E38] underline decoration-[var(--hz-emas,currentColor)] decoration-2 underline-offset-[5px] before:absolute before:inset-x-0 before:-inset-y-3.5 before:content-['']">
                              <Images size={18} aria-hidden className="shrink-0" />
                              {DOKUMENTASI_UI[lang].sesi}
                              <ArrowSquareOut size={16} aria-hidden className="mt-0.5 shrink-0" />
                              <span className="sr-only">({DOKUMENTASI_UI[lang].tabBaru})</span>
                            </a>
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
    kepala = <JudulKepala judul={t.schedule} catatan={[tanggal, venue].filter(Boolean).join(", ")} />;
    judulHorizon = { alis: nama, judul: t.schedule, catatan: [tanggal, venue].filter(Boolean).join(", ") };
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
                <p className={`mt-5 text-body-medium font-semibold ${MUTED}`}>{[bagian.hari, bagian.sectionTitle?.trim()].filter(Boolean).join(", ")}</p>
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
                        {item.subtitle ? <TeksKaya teks={item.subtitle} warna={TINTA_TANDA} className={`${horizon ? "mt-1 text-[14px] leading-5" : "mt-0.5 text-body-medium"} whitespace-pre-line ${MUTED}`} /> : null}
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
    judulHorizon = { alis: nama, judul: tH.tabs.perjalanan, catatan: tv.note(singkatanZona, bagianTersembunyi(member).size > 0, modaTiket(tiketSemua)) };
    const petaHotel = (h: LogistikKamar["hotel"]) =>
      h.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([h.name, h.address].filter(Boolean).join(", "))}`;
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
          const petaStay = petaHotel(h);
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
                stay.check_in_at ? `${tv.checkIn} ${hariHorizon(stay.check_in_at, zona, lang)}, ${jamHorizon(stay.check_in_at, zona, lang)}` : "",
                stay.check_out_at ? `${tv.checkOut} ${hariHorizon(stay.check_out_at, zona, lang)}, ${jamHorizon(stay.check_out_at, zona, lang)}` : "",
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
    // yang lain dicari di Google Maps bersama asal perjalanannya. Asal "Hotel"
    // berarti hotel yang ditempati saat berangkat (peserta pindah hotel naik
    // perjalanan 7 Nov dari hotel keduanya); asal yang menyebut nama hotel
    // memakai hotel itu.
    const staysPeserta = logistik?.stays.length ? logistik.stays : kamar ? [kamar] : [];
    const petaTrip = (trip: (typeof perjalananBusHorizon)[number]) => {
      const titik = trip.meeting_point?.trim();
      if (!titik) return null;
      const asal = trip.origin?.trim() || null;
      const asalKecil = asal?.toLocaleLowerCase("id") ?? "";
      const hotelDisebut = asalKecil
        ? staysPeserta.find((stay) => {
            const nama = stay.hotel?.name?.trim().toLocaleLowerCase("id");
            return Boolean(nama && asalKecil.includes(nama));
          })
        : undefined;
      const hotelAsal = hotelDisebut ?? (asalKecil === "hotel" ? staySaatBerangkat(staysPeserta, trip.depart_at) : null);
      if (hotelAsal?.hotel) return petaHotel(hotelAsal.hotel);
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
        kendaraan: lain ? [lain, detail?.plate].filter(Boolean).join(", ") : null,
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
      const tiket = logistik?.trains.find((item) => `${item.direction}-${item.segment}` === leg.kunci);
      // Segmen 1 tanpa parameter segmen: tautan lama tetap sama untuk acara tanpa transit.
      const segmen = tiket && tiket.segment > 1 ? `&segmen=${tiket.segment}` : "";
      const denganKalender = tiket?.depart_date && tiket.depart_time
        ? { ...leg, kalender: { href: `/e/${encodeURIComponent(event.slug)}/api/peserta/kalender-kereta?arah=${tiket.direction}${segmen}${lang === utama ? "" : `&bahasa=${lang}`}`, label: tv.addToCalendar } }
        : leg;
      // Leg yang sudah tiba dilipat jadi satu baris: "Berangkat · Kam, 5 Nov · selesai".
      return tiket && legSelesai(tiket, zona, sekarang)
        ? { ...denganKalender, lipat: { label: gabungMeta([leg.arah, tv.done]), catatan: gabungMeta([tiket.train_name, tH.travel.seatLine(tiket.carriage, tiket.seat)]) || null } }
        : denganKalender;
    });
    const kartuKeretaHorizon =
      legKereta.length > 0 ? <TiketKeretaHorizon judul={judulKereta} Ikon={IkonKereta} label={{ gerbong: tH.train.carriage, kursi: tH.train.seat, kode: tH.train.booking, jumlah: tH.train.count, selesai: tH.train.done, ke: tH.train.to }} leg={legDenganKalender} /> : null;
    // Bagasi (Record luggage): satu kartu per meja bagasi tempat peserta dipindai.
    // Pola kartu klaim titip koper hotel dan "bags checked" di aplikasi maskapai:
    // jumlah besar, kapan dan di mana, foto, lalu ajakan memeriksa sebelum pergi.
    const tl = tv.luggage;
    // Luggage number: strip abu-abu yang sama dengan "Kamar 1208" di kartu
    // hotel dan gerbong-kursi di tiket kereta: satu fakta kunci per kartu,
    // judulnya tetap jumlah bagasi. Sebelum dititipkan kartunya sudah muncul
    // dengan stripnya saja, supaya peserta tahu nomornya sejak awal.
    const stripNomor = nomorBagasi ? (
      <div className="rounded-[12px] px-3 py-2" style={{ background: LATAR_STRIP }}>
        <p className="break-words text-[16px] font-semibold leading-6 [overflow-wrap:anywhere]">{tl.number} <span className="tabular-nums">{nomorBagasi}</span></p>
      </div>
    ) : null;
    const kartuBagasi = bagasi.length > 0 ? (
      <>
        {bagasi.map((item) => (
          <KartuInfoHorizon
            key={item.session_id}
            id={item === bagasi[0] ? "bagasi" : undefined}
            judul={tl.title}
            Ikon={Suitcase}
            // 0 bagasi bukan "Dititipkan": kepala netral, judulnya yang berbicara.
            meta={{ teks: item.bag_count === 0 ? tl.recorded : item.handed_over_at ? tl.received : tl.stored, nada: item.handed_over_at && item.bag_count > 0 ? "hijau" : "redup" }}
            tanpaKepala={trip}
            nama={item.bag_count === 0 ? tl.none : tl.count(item.bag_count)}
            baris={[
              // Sebelum diambil kepala kartu sudah berbunyi "Dititipkan": barisnya cukup kapan dan di mana.
              gabungMeta([`${item.handed_over_at ? `${tl.droppedAt} ` : ""}${hariHorizon(item.recorded_at, zona, lang)} ${jamHorizon(item.recorded_at, zona, lang)}`, item.session_name || null]),
              item.handed_over_at ? `${tl.pickedUpAt} ${hariHorizon(item.handed_over_at, zona, lang)} ${jamHorizon(item.handed_over_at, zona, lang)}` : "",
            ].filter(Boolean)}
          >
            {stripNomor}
            {item.photo_url ? (
              <FotoBagasi
                src={item.photo_url}
                keterangan={tl.count(item.bag_count)}
                teks={{ buka: tl.openPhoto, perbesar: tl.enlarge, tutup: tl.close, judul: tl.title }}
              />
            ) : null}
            <p className="text-[14px] leading-5" style={{ color: "#526078" }}>{item.bag_count === 0 ? tl.noneHint : item.handed_over_at ? tl.checkAfter : tl.check}</p>
          </KartuInfoHorizon>
        ))}
      </>
    ) : stripNomor ? (
      <KartuInfoHorizon id="bagasi" judul={tl.title} Ikon={Suitcase} meta={{ teks: tl.notYet, nada: "redup" }} tanpaKepala={trip}>
        {stripNomor}
        <p className="text-[14px] leading-5" style={{ color: "#526078" }}>{tl.numberHint}</p>
      </KartuInfoHorizon>
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
      kartuKeretaHorizon ? { id: "kereta", label: lompatKereta } : null,
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
        const petaStay = petaHotel(h);
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
        legKereta.length > 0 ? { id: "kereta", label: lompatKereta } : null,
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
              <BagianTrip id="kereta" Ikon={IkonKereta} nada="kereta" judul={judulKereta} meta={legAktif > 0 ? tH.train.count(legAktif) : tH.train.done} duaKolom>
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
                        <Link href={hrefO(milik.indeks)} className="inline-flex min-h-12 items-center font-semibold text-[#101E38] underline decoration-[var(--hz-emas,currentColor)] decoration-2 underline-offset-[5px]">
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
        {/* Pintu ke notifikasi HP di tempat orang mencari kabar (pola Inbox Airbnb). */}
        {!pratinjau && navPeserta.notifikasi ? <BarisNotifikasi lang={lang} className={`${KARTU} ${horizon ? GARIS_KARTU : ""}`} /> : null}
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
              foto: item.image_url ? { src: item.image_url, alt: altFotoPengumuman(item) } : null,
            }))}
            lang={lang}
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
                {item.image_url ? <FotoPengumuman src={item.image_url} alt={altFotoPengumuman(item)} lang={lang} className="mt-3" /> : null}
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
              isi: perjalananBus?.depart_at ? `${hariHorizon(perjalananBus.depart_at, zona, lang)}, ${jamHorizon(perjalananBus.depart_at, zona, lang)}` : tH.travel.busTitle,
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
    judulHorizon = { alis: statusLabel, judul: sesi.name, catatan: peserta ? [peserta.title, peserta.company].filter(Boolean).join(", ") : "" };
    kepala = (
      <div className="flex flex-col items-center text-center">
        <span aria-hidden className="flex size-20 items-center justify-center rounded-full bg-[var(--aksen)] text-[28px] font-extrabold text-[#1A2333]">
          {inisial}
        </span>
        <h1 className={`${HEAD} mt-3 text-[26px] font-extrabold`}>{sesi.name}</h1>
        {peserta && [peserta.title, peserta.company].filter(Boolean).length > 0 ? (
          <p className="mt-0.5 text-body-medium opacity-85">{[peserta.title, peserta.company].filter(Boolean).join(", ")}</p>
        ) : null}
        <p className="mt-3 inline-flex min-h-7 items-center rounded-full border border-white/25 bg-white/10 px-3 text-label-large font-semibold">{statusLabel}</p>
      </div>
    );
    const baris: { href: string; judul: string; isi: string | null; Ikon: typeof House; luar?: boolean; pemicuQr?: string }[] = [
      ...(tampilKode && peserta ? [{ href: keTab("qr"), judul: t.ticket, isi: peserta.qr_code, Ikon: Ticket, pemicuQr: "pemicu-qr-profil" }] : []),
      ...(kamar ? [{ href: `${keTab("beranda")}#kamar`, judul: t.roomRow, isi: (kamar.room_number === null ? [kamar.hotel.name, t.roomPending] : [kamar.room_number, teman?.map((o) => o.name).join(", ")]).filter(Boolean).join(", "), Ikon: Bed }] : []),
      ...(namaBus ? [{ href: `${keTab("beranda")}#bus`, judul: t.busRow, isi: [namaBus, perjalananBus?.meeting_point].filter(Boolean).join(", "), Ikon: Bus }] : []),
      ...(telepon ? [{ href: `tel:${telepon.replace(/[^\d+]/g, "")}`, judul: t.contactRow, isi: [config.contact_name?.trim(), telepon].filter(Boolean).join(", "), Ikon: Phone, luar: true }] : []),
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
  return { isi, kepala, judulHorizon };
}
