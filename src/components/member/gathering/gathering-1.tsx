import { bagianTampil, bagianTersembunyi } from "@/lib/logistik/bagian-tampil";
import { loadAgendaPreview } from "@/lib/landing-agenda";
import { loadOutfitBagian } from "@/lib/outfit-server";
import { loadSasaranPeserta } from "@/lib/sasaran-bagian-server";
import { oldSlugsFor } from "@/lib/slug-lama-peta";
import { LANDING_UI, landingPath } from "@/lib/landing-i18n";
import { pilihanPeserta } from "@/lib/sasaran-bagian";
import { outfitTerlihat } from "@/lib/outfit";
import { bacaOutfitSetiapHari, denganSetiapHari } from "@/lib/outfit-setiap-hari";
import { labelOutfit } from "@/lib/outfit";
import { kartuLengkapi, updatableFields } from "@/lib/member/lengkapi";
import { tautanKartuKilas } from "@/lib/kilas-balik/server";
import { loadMemberLogistics } from "@/lib/logistik/peserta";
import { loadCheckpointPeserta, loadCheckpointQr } from "@/lib/checkpoint/server";
import { bagasiPeserta, nomorBagasiPeserta } from "@/lib/bagasi/server";
import { loadHadiahPeserta } from "@/lib/member/hadiah-server";
import { hadiahDiAtas } from "@/lib/member/hadiah";
import { KartuHadiah, type GayaKartuHadiah } from "@/components/member/kartu-hadiah";
import { albumTerbuka, bacaSetelanDokumentasi, tautanSesiTerbuka } from "@/lib/member/dokumentasi";
import { KartuDokumentasi, type GayaKartuDokumentasi } from "@/components/member/kartu-dokumentasi";
import { formatEventDate, formatEventDateRingkas } from "@/lib/event-datetime";
import { inisialNama, muatNavPeserta } from "@/lib/member/nav";
import { isPortalEntry, landingBlockMemberOnly, landingMemberBlocks, memberHomeOrder, normalizeLandingSections, susunanDenganPortal } from "@/lib/domain";
import { loadLandingLodging } from "@/lib/landing-hotel";
import { saringBlokPeserta } from "@/lib/sasaran-blok-server";
import { jenisBlokDarurat } from "@/lib/member/blok-darurat";
import { bantuanBahasa, barisKontakDarurat } from "@/lib/member/kontak-darurat";
import { landingTokens } from "@/lib/landing-tokens";
import { KartuRute } from "@/components/landing/modern/blok-rute";
import { KartuHitungMundur } from "@/components/landing/modern/landing-blocks";
import { KartuBlok } from "@/components/member/kartu-blok";
import { bagianModern } from "@/components/landing/modern/kerangka";
import { kvGathering } from "@/lib/registration-theme-css";
import { kontakPanitia } from "@/lib/kontak-panitia";
import { menitDari, ringkasanBeranda, statusHari, type StatusButir } from "@/lib/member/hari-agenda";
import { nomorKru } from "@/lib/logistik/kontak-kru";
import { type KontakPanitiaHorizon } from "@/components/member/portal-horizon";
import { gabungMeta } from "@/lib/typography";
import { Bell, CalendarBlank, House, MapPin, Phone, Ticket, User } from "@phosphor-icons/react/dist/ssr";
import { PortalTab, sekarangDi } from "./gathering-bantu";
import type { siapkanDashboardGathering0 } from "./gathering-0";

/** Bagian 2 dari 4 badan DashboardGathering, dipindah apa adanya (audit platform, Fase 3). */
export async function siapkanDashboardGathering1(c: Awaited<ReturnType<typeof siapkanDashboardGathering0>>) {
  const { asli, config, event, halamanAcara, horizon, keTab, kini, lang, member, nama, pengumuman, peserta, pratinjau, sekarang, sesi, singkatanZona, t, tH, tabDiminta, tampilKode, utama, zona } = c;
  const tampilSusunan = member.show_schedule !== false;
  // Who sees it per baris Agenda: baris bersyarat hanya untuk peserta yang cocok.
  const penonton = { acara: event, participantId: peserta?.id ?? null, tampilKamar: bagianTampil(member, "rooms") };
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
  // Kartu Kilas balik: hanya Beranda, hanya selama Feedback dibuka dan peserta belum menjawab.
  // Dimulai sekarang, ditunggu sesudah data Beranda lain, supaya tidak menambah antrean.
  const janjiKilas = tab === "beranda" && peserta && !pratinjau ? tautanKartuKilas(event, peserta.id, halamanAcara).catch(() => null) : Promise.resolve(null);
  // Checkpoint (Check-in > Checkpoints): hanya Beranda, hanya bila dinyalakan
  // dan tidak disembunyikan di Participant home.
  const [logistik, checkpoint, checkpointQr, bagasi, hadiah, nomorBagasi] = peserta
    ? await Promise.all([
        loadMemberLogistics(event.id, peserta.id, member.show_logistics === true, { plate: member.show_bus_plate === true, crew: member.show_bus_crew === true }, false, bagianTersembunyi(member)),
        (tab === "beranda" || (horizon && tab === "profil")) && !(member.home?.hidden ?? []).includes("checkpoints") ? loadCheckpointPeserta(event.id, peserta.id, lang, penonton) : null,
        // Petunjuk layar QR menyebut checkpoint hanya bila fiturnya menyala.
        horizon && tampilKode ? loadCheckpointQr(event.id) : null,
        // Bagasi yang dicatat di meja bagasi (Check-in > Sessions > Record
        // luggage), di Perjalanan. Tautan fotonya hanya dibuat di tab itu.
        horizon ? bagasiPeserta(event.id, peserta.id, tab === "perjalanan").catch(() => []) : [],
        // Hadiah undian yang sudah dikonfirmasi (Participant area > Lucky draw prize), hanya Beranda.
        tab === "beranda" ? loadHadiahPeserta(event.id, peserta.id, member.prize, lang).catch(() => []) : [],
        // Luggage number (Check-in > sesi > Luggage), di kartu Bagasi Perjalanan.
        horizon && tab === "perjalanan" ? nomorBagasiPeserta(event.id, peserta.id, asli.registration_form_config).catch(() => null) : null,
      ])
    : [null, null, null, [], [], null];
  const kilas = await janjiKilas;
  const setelanCheckpoint = checkpointQr?.setelan ?? null;
  // Kartu Hadiah kamu (lib/member/hadiah.ts): paling atas Beranda, sesudah kartu panitia.
  // Paling atas hanya pada hari dikonfirmasi; sesudahnya di bawah Next up
  // (hadiahDiAtas). Tanpa Next up di Beranda: selalu paling atas.
  const hadiahAtas = hadiahDiAtas(hadiah, zona, sekarang);
  const kartuHadiah = (gayaKartu: GayaKartuHadiah, posisi: "atas" | "bawah", adaNext: boolean) => {
    if (!hadiah.length) return null;
    if (posisi === "atas" ? adaNext && !hadiahAtas : !adaNext || hadiahAtas) return null;
    const kartu = <KartuHadiah gaya={gayaKartu} hadiah={hadiah} lang={lang} zona={zona} qrHref={tampilKode ? keTab("qr") : null} />;
    return gayaKartu !== "gathering" && posisi === "atas" ? <div className="order-[0] lg:order-none">{kartu}</div> : kartu;
  };

  // Foto dan video acara (lib/member/dokumentasi.ts): album yang hari atau sesinya
  // sudah selesai. Agenda yang dipakai sudah disaring Who sees it. Bawaan mati.
  const albumDokumentasi = albumTerbuka(
    bacaSetelanDokumentasi(member.photos),
    agendaNav,
    { event_date: event.event_date ?? null, end_date: event.end_date ?? null, start_time: event.start_time ?? null, end_time: event.end_time ?? null, time_zone: zona },
    sekarang.getTime(),
  );
  const kartuDokumentasi = (gayaKartu: GayaKartuDokumentasi) =>
    albumDokumentasi.length && tab === "beranda" ? (
      gayaKartu === "gathering" ? <KartuDokumentasi gaya={gayaKartu} album={albumDokumentasi} lang={lang} /> : <div className="order-[0] lg:order-none"><KartuDokumentasi gaya={gayaKartu} album={albumDokumentasi} lang={lang} /></div>
    ) : null;
  const sesiDokumentasi = tautanSesiTerbuka(albumDokumentasi);

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
  const blokPeserta = await saringBlokPeserta(landingMemberBlocks(config.sections, config.blocks, hotelIds), event, peserta?.id ?? null, bagianTampil(member, "rooms"));
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
  // Pratinjau di Participant area: tanpa ajakan notifikasi dan tanpa service worker.
  if (pratinjau) navPeserta.notifikasi = null;
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
  return { tampilSusunan, penonton, agenda, petaOutfit, sasaranPeserta, slugLama, lingkupQr, pilihanKu, agendaNav, hariOutfit, setiapHari, adaOutfit, outfitTampil, pilihanOutfit, outfitDiAcara, labelOutfitHalaman, tab, lengkapi, janjiKilas, logistik, checkpoint, checkpointQr, bagasi, hadiah, nomorBagasi, kilas, setelanCheckpoint, hadiahAtas, kartuHadiah, albumDokumentasi, kartuDokumentasi, sesiDokumentasi, tanggal, venue, inisial, sectionsHalaman, inap, adaHotel, hotelIds, blokPeserta, blokDarurat, bantuan, kontakDarurat, pakaiKontak, adaDarurat, judulDarurat, tokensTema, warnaTema, kartuBlok, beranda, tersembunyiBeranda, diBeranda, navSections, tampil, menuAtas, navPeserta, subNama, alis, logo, latarKv, petaUrl, telepon, indeksHariIni, sesudahAcara, indeksBeranda, statusHariIni, selanjutnya, besokTanggal, ringkasan, kontakAcara, nomorPanitia, kontakHorizon, labelKontak, alisJadwal, catatanJadwal, tautanCepat, menuTab };
}
