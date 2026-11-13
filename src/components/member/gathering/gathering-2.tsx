import { Bed, Bus, CheckCircle, EnvelopeSimple, Hourglass, Megaphone, Users, XCircle } from "@phosphor-icons/react/dist/ssr";
import { isUnread } from "@/lib/member/pengumuman";
import { inisialNama, waktuPengumuman } from "@/lib/member/nav";
import Link from "next/link";
import { HEAD } from "@/components/landing/modern/styles";
import { teksPolos } from "@/lib/landing-teks-kaya";
import { agendaBerikutnya, urutWaktuBerangkat } from "@/lib/logistik/peserta";
import { bacaTautanAgenda } from "@/lib/sasaran-blok";
import { KartuKereta, KontakKru } from "@/components/member/kartu-logistik";
import { jenisKamar } from "@/lib/logistik/nama-kamar";
import { judulTiket, lompatTiket, modaTiket } from "@/lib/logistik/moda";
import { ikonModa } from "@/components/member/ikon-moda";
import { type LegKereta } from "@/components/member/portal-horizon";
import { jamLeg, jamTiket, ruteLeg, tanggalLeg } from "@/lib/logistik/kereta-tampil";
import { gabungMeta } from "@/lib/typography";
import { KartuCheckpoint } from "@/components/member/kartu-checkpoint";
import { TeksKaya } from "@/components/landing/teks-kaya";
import { KirimUlangKonfirmasi } from "@/components/member/kirim-ulang-konfirmasi";
import { Chip, KARTU, KartuAngka, LABEL, MUTED, PortalTab, TINTA_TANDA, TautanPortal } from "./gathering-bantu";
import type { siapkanDashboardGathering0 } from "./gathering-0";
import type { siapkanDashboardGathering1 } from "./gathering-1";

/** Bagian 3 dari 4 badan DashboardGathering, dipindah apa adanya (audit platform, Fase 3). */
export async function siapkanDashboardGathering2(c: Awaited<ReturnType<typeof siapkanDashboardGathering0>> & Awaited<ReturnType<typeof siapkanDashboardGathering1>>) {
  const { agenda, bagasi, blokPeserta, checkpoint, diBeranda, event, horizon, indeksBeranda, indeksHariIni, kartuBlok, keTab, konfirmasi, lang, logistik, p, pengumuman, peserta, sekarang, selanjutnya, sesi, singkatanZona, statusHariIni, t, tH, tab, tampilKode, tautanCepat, zona } = c;
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
            {[selanjutnya.hari, `${selanjutnya.item.time} ${singkatanZona}`, teksPolos(selanjutnya.item.subtitle) || null, gelap ? selanjutnya.hitung : null].filter(Boolean).join(", ")}
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
        : teman && teman.length > 0 ? t.withRoommate(teman.map((orang) => orang.name).join(", ")) : [kamar.floor ? t.floor(kamar.floor) : null, jenisKamar(kamar)].filter(Boolean).join(", ") || kamar.hotel.name}
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
                <p className={`text-body-medium ${MUTED}`}>{[orang.company, kamar?.room_number ? t.room(kamar.room_number) : null].filter(Boolean).join(", ")}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  // Tiket kereta Horizon: kartu di halaman Perjalanan, baris ringkas di Beranda.
  const tiketSemua = logistik?.trains ?? [];
  // Kereta saja: judul, label lompat, dan ikon lama persis; pesawat atau kapal mengganti katanya.
  const judulKereta = judulTiket(lang, tiketSemua, tH.train.title);
  const lompatKereta = lompatTiket(lang, tiketSemua, tH.travel.jump.train);
  const IkonKereta = ikonModa(modaTiket(tiketSemua));
  const legKereta: LegKereta[] = tiketSemua.map((tiket) => {
    const rute = ruteLeg(tiket);
    return {
      // Transit: arah yang sama bisa punya beberapa segmen.
      kunci: `${tiket.direction}-${tiket.segment}`,
      moda: tiket.mode,
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
                {item.subtitle ? <TeksKaya teks={item.subtitle} warna={TINTA_TANDA} className={`whitespace-pre-line text-body-medium ${MUTED}`} /> : null}
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
  return { tabAktif, kartuPengumuman, kartuSelanjutnya, perjalananBus, namaBus, kamar, teman, perjalananBusHorizon, banyakKendaraan, adaPerjalanan, rutePerjalanan, idRutePerjalanan, ruteBaris, detailNamaBus, kartuBus, kartuKamar, kartuKereta, kartuTeman, tiketSemua, judulKereta, lompatKereta, IkonKereta, legKereta, kartuCheckpoint, bagianBeranda, kartuRundown, statusPendaftaran, pitaEmail, aksesCepat };
}
