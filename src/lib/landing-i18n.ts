import { sesiDariRundown } from "./landing-speaker-tabs";
import {
  LANDING_BLOCK_EN_KEYS,
  LANDING_CONFIG_EN_KEYS,
  LANDING_EVENT_EN_KEYS,
  LANDING_ITEM_EN_KEYS,
  LANDING_EYEBROW_DEFAULT,
  LANDING_SPEAKER_EN_KEYS,
  normalizeLandingSections,
  type EventLandingConfig,
  type EventRow,
  type LandingHeadedSection,
  type LandingSectionId,
} from "./domain";
import { formatEventDate } from "./event-datetime";
import { DEFAULT_TIME_ZONE } from "./timezone";
import { jumlahLembaga } from "./landing-speaker-tabs";
import { peranSesiUntukEn } from "./landing-peran-sesi";

/**
 * Halaman acara dwibahasa: Indonesia (bahasa utama, `/e/<slug>`) dan English
 * (`/e/<slug>/en`).
 *
 * Dua hal tinggal di sini, dan hanya di sini:
 *
 *   1. resolveLanding(): menumpuk teks English (`en` di samping tiap teks
 *      Indonesia, lihat LandingConfigEn di domain.ts) di atas teks Indonesia.
 *      Hasilnya event dan config biasa, jadi perender tidak tahu soal `en`.
 *   2. LANDING_UI: teks bawaan halaman yang ditulis di kode (menu, tombol,
 *      judul bawaan), satu kamus bertipe per bahasa.
 *
 * Aturan cadangan: kolom English yang kosong (atau hanya spasi) memakai teks
 * Indonesia kolom itu. Halaman English tidak pernah punya bagian kosong karena
 * terjemahannya belum ada; editor menandai kolom itu "belum diterjemahkan"
 * lewat landingUntranslated().
 */

export type LandingLang = "id" | "en";

export const LANDING_LANG_LABELS: Record<LandingLang, { name: string; short: string; htmlLang: string; locale: string }> = {
  id: { name: "Bahasa Indonesia", short: "ID", htmlLang: "id", locale: "id-ID" },
  en: { name: "English", short: "EN", htmlLang: "en", locale: "en-GB" },
};

/** Acara tanpa halaman acara: `/e/<slug>` langsung membuka formulir pendaftaran. */
export function landingFormOnly(config: EventLandingConfig | null | undefined): boolean {
  return config?.tayang === "formulir";
}

/** Versi English boleh tampil: dinyalakan admin, dan tata letaknya sudah punya terjemahan teks bawaan (Modern). */
export function landingEnAvailable(config: EventLandingConfig | null | undefined): boolean {
  return Boolean(config?.en_enabled) && config?.layout === "modern";
}

/**
 * Bahasa utama: bahasa di alamat tanpa akhiran (`/e/<slug>`), yang dicetak di
 * undangan dan QR. Pilihan admin (`default_lang`), tetapi English hanya bila
 * versi English menyala; selain itu selalu Indonesia.
 */
export function landingDefaultLang(config: EventLandingConfig | null | undefined): LandingLang {
  return config?.default_lang === "en" && landingEnAvailable(config) ? "en" : "id";
}

/**
 * Alamat halaman acara dalam satu bahasa. Bahasa utama tanpa akhiran, supaya QR
 * dan undangan lama tetap berlaku; bahasa lainnya di `/id` atau `/en`.
 */
export function landingPath(slug: string, lang: LandingLang, utama: LandingLang = "id"): string {
  return lang === utama ? `/e/${slug}` : `/e/${slug}/${lang}`;
}

type Kueri = Record<string, string | string[] | undefined>;

/**
 * `alamat` dengan kueri permintaan asalnya, untuk pengalihan antarbahasa:
 * `/en?utm_source=x` yang dialihkan tetap membawa `utm_source` ke alamat utama.
 */
export function withQuery(alamat: string, kueri: Kueri): string {
  const hasil = new URLSearchParams();
  for (const [kunci, nilai] of Object.entries(kueri)) {
    for (const satu of Array.isArray(nilai) ? nilai : nilai === undefined ? [] : [nilai]) hasil.append(kunci, satu);
  }
  const teks = hasil.toString();
  return teks ? `${alamat}?${teks}` : alamat;
}

// ---- Penumpukan teks -------------------------------------------------------------

function isi(teks: unknown): teks is string {
  return typeof teks === "string" && teks.trim().length > 0;
}

/**
 * Salin `asli`, lalu timpa tiap kolom di `keys` dengan versi English bila
 * keduanya terisi. Teks Indonesia yang dikosongkan berarti kembali ke teks
 * bawaan di kedua bahasa: terjemahan lama yang tertinggal (kolomnya sudah
 * tidak tampil di editor EN) tidak boleh tetap tampil di halaman English.
 */
function tumpuk<T extends object>(asli: T, en: Partial<Record<string, unknown>> | undefined, keys: readonly string[]): T {
  if (!en) return asli;
  const hasil = { ...asli } as Record<string, unknown>;
  for (const key of keys) {
    if (isi(en[key]) && isi(hasil[key])) hasil[key] = en[key];
  }
  return hasil as T;
}

/**
 * Event dan config untuk satu bahasa. Indonesia dikembalikan apa adanya.
 *
 * English: setiap kolom teks yang punya versi English terisi diganti; sisanya
 * tetap teks Indonesia. Gambar, warna, urutan, dan tampil/sembunyi tidak
 * disentuh. `landing_config` di event hasil adalah config hasil, supaya
 * publicEventName() dan pembaca lain melihat nama English.
 *
 * Pengecualian: `speakers[i].session` (sesi teks lama) TIDAK diganti, karena ia
 * kunci yang mencocokkan pembicara dengan judul Indonesia baris rundown
 * (landing-speaker-tabs.ts). Label English-nya dibaca lewat
 * landingSessionLabels(). Sesi dari `session_refs` memakai judul rundown
 * English langsung.
 */
export function resolveLanding(event: EventRow, lang: LandingLang): { event: EventRow; config: EventLandingConfig } {
  const asli = (event.landing_config ?? {}) as EventLandingConfig;
  if (lang === "id") return { event, config: asli };

  const en = asli.en ?? {};
  const config: EventLandingConfig = {
    ...tumpuk(asli, en, LANDING_CONFIG_EN_KEYS),
    program_notes: asli.program_notes?.map((catatan, index) => (isi(en.program_notes?.[index]) && isi(catatan) ? en.program_notes![index]! : catatan)),
    about_cards: asli.about_cards?.map((kartu, index) => tumpuk(kartu, en.about_cards?.[index], ["title", "body"])),
    blocks: asli.blocks?.map((block) => ({
      ...tumpuk(block, block.en, LANDING_BLOCK_EN_KEYS),
      items: block.items?.map((item) => tumpuk(item, item.en, LANDING_ITEM_EN_KEYS)),
    })),
    // `role_id`: peran Indonesia, supaya urutan moderator di /en sama dengan
    // di halaman Indonesia walau `role` sudah English.
    speakers: asli.speakers?.map((speaker) => ({
      ...tumpuk(speaker, speaker.en, LANDING_SPEAKER_EN_KEYS.filter((key) => key !== "session")),
      ...(speaker.role ? { role_id: speaker.role } : {}),
      ...(speaker.session_refs ? { session_refs: speaker.session_refs.map((ref) => ({ ...tumpuk(ref, ref.en, ["role"]), ...(ref.role ? { role_id: ref.role } : {}) })) } : {}),
    })),
    faq: asli.faq?.map((item) => tumpuk(item, item.en, ["q", "a"])),
    highlights: asli.highlights?.map((item) => tumpuk(item, item.en, ["label", "value"])),
    sponsors: asli.sponsors?.map((item) => tumpuk(item, item.en, ["name"])),
  };
  const fakta = tumpuk(
    { tagline: event.tagline, description: event.description, venue_name: event.venue_name, venue_address: event.venue_address },
    en,
    LANDING_EVENT_EN_KEYS,
  );
  // Label kecil yang sama dengan judulnya tidak dirender. Bila di versi
  // Indonesia label itu tersembunyi karena sama, di /en juga dimatikan: kalau
  // tidak, label Indonesia yang belum diterjemahkan muncul sendiri di sana.
  for (const id of Object.keys(LANDING_EYEBROW_DEFAULT) as LandingHeadedSection[]) {
    if (landingEyebrowShown(asli, id) && landingSectionHeading(event, asli, "id", id).alis === null) {
      config.eyebrow_shown = { ...config.eyebrow_shown, [id]: false };
    }
  }
  return { event: { ...event, ...fakta, landing_config: config }, config };
}

/** Label tab sesi pembicara dalam satu bahasa: kunci sesi Indonesia ke label English bila diisi. */
export function landingSessionLabels(config: EventLandingConfig, lang: LandingLang): Map<string, string> {
  const peta = new Map<string, string>();
  if (lang === "id") return peta;
  // Termasuk pembicara yang sudah memilih sesi dari rundown: label English
  // lamanya dipakai tab baris rundown yang belum punya judul English.
  for (const speaker of config.speakers ?? []) {
    const kunci = speaker.session?.trim();
    const label = speaker.en?.session?.trim();
    if (kunci && label && !peta.has(kunci.toLowerCase())) peta.set(kunci.toLowerCase(), label);
  }
  return peta;
}

/** Label kecil di atas judul bagian bawaan tampil atau tidak; satu saklar untuk kedua bahasa. */
export function landingEyebrowShown(config: EventLandingConfig, id: LandingHeadedSection): boolean {
  return config.eyebrow_shown?.[id] ?? LANDING_EYEBROW_DEFAULT[id];
}

/** Bagian acara yang dibaca judul otomatis: tanggal dan nama tempat. */
export type LandingHeadingFacts = Pick<EventRow, "event_date" | "end_date" | "venue_name"> & { time_zone?: EventRow["time_zone"] | null };

/**
 * Judul dan label kecil satu bagian bawaan Modern dalam satu bahasa: teks dari
 * CMS, atau judul otomatis (tanggal, nama tempat, jumlah pembicara) dan teks
 * bawaan bila kosong. `alis` null bila dimatikan atau sama dengan judulnya
 * (mis. "Lokasi" saat nama tempat belum diisi). `event` dan `config` sudah
 * dalam bahasa itu (resolveLanding).
 */
export function landingSectionHeading(
  event: LandingHeadingFacts,
  config: EventLandingConfig,
  lang: LandingLang,
  id: LandingHeadedSection,
): { judul: string; alis: string | null } {
  const t = LANDING_UI[lang];
  const nama = t.sectionLabels[id];
  const otomatis = (() => {
    switch (id) {
      case "agenda": {
        const jadwal = { event_date: event.event_date, end_date: event.end_date, start_time: null, end_time: null, time_zone: event.time_zone ?? DEFAULT_TIME_ZONE };
        return formatEventDate(jadwal, lang) ?? nama;
      }
      case "venue": return event.venue_name?.trim() || nama;
      case "faq": return t.faqHeading;
      case "speakers": {
        const pembicara = (config.speakers ?? []).filter((speaker) => speaker.name?.trim());
        const lembaga = jumlahLembaga(pembicara);
        return lembaga >= 3 ? t.speakersFrom(pembicara.length, lembaga) : nama;
      }
      default: return nama;
    }
  })();
  const judul = (id === "about" ? config.about_heading : config[`${id}_heading`])?.trim() || otomatis;
  const alis = config[`${id}_eyebrow`]?.trim() || nama;
  return { judul, alis: landingEyebrowShown(config, id) && alis.toLowerCase() !== judul.toLowerCase() ? alis : null };
}

// ---- Kolom yang belum diterjemahkan ---------------------------------------------

/**
 * Terjemahan satu nama sesi. Sesi diterjemahkan sekali per nama, tetapi
 * disimpan di `en.session` tiap pembicara bersesi itu. Dianggap terjemahan
 * hanya bila semua pembicara sesi itu memegang teks English yang sama; kalau
 * tidak, tab sesinya terpecah di halaman English. Editor dan penghitung
 * "belum diterjemahkan" sama-sama membaca dari sini.
 */
export function landingSessionEn(speakers: EventLandingConfig["speakers"], nama: string): string | undefined {
  const sesi = (speakers ?? []).filter((s) => !sesiDariRundown(s) && s.session?.trim() === nama);
  const teks = sesi[0]?.en?.session?.trim();
  if (!teks || sesi.some((s) => s.en?.session?.trim() !== teks)) return undefined;
  return sesi[0].en?.session;
}

/**
 * Satu kolom teks Indonesia terisi yang versi English-nya kosong. `path` ditulis
 * menurut letak kolom English yang perlu diisi, mis.
 * `blocks.blk_tentang0001.items.2.title` berarti
 * `landing_config.blocks[id=blk_tentang0001].items[2].en.title`, dan
 * `event.tagline` berarti `landing_config.en.tagline`.
 */
export type LandingUntranslated = { path: string; section: string; id: string };

/**
 * Kolom yang tampil di halaman Indonesia tetapi belum punya teks English, untuk
 * penanda "belum diterjemahkan" di editor. Hanya bagian dan blok yang menyala
 * dihitung: teks di bagian tersembunyi tidak dibaca siapa pun.
 *
 * Nama instansi (`company`), nama tempat, nama mitra, dan nama orang di kutipan
 * tidak dihitung: biasanya nama diri yang sama di kedua bahasa. Kolomnya tetap
 * bisa diterjemahkan.
 */
export function landingUntranslated(event: Partial<LandingHeadingFacts> & {
  landing_config: EventLandingConfig | null | undefined;
  tagline?: string | null;
  description?: string | null;
  venue_address?: string | null;
}): LandingUntranslated[] {
  const config = event.landing_config ?? {};
  const en = config.en ?? {};
  const menyala = new Set(normalizeLandingSections(config.sections, config.blocks).filter((s) => s.enabled).map((s) => s.id));
  const hasil: LandingUntranslated[] = [];
  const periksa = (id: unknown, terjemahan: unknown, path: string, section: string) => {
    if (isi(id) && !isi(terjemahan)) hasil.push({ path, section, id });
  };
  const bagian = (id: LandingSectionId) => menyala.has(id);

  periksa(config.public_name, en.public_name, "public_name", "pembuka");
  periksa(config.cta_label, en.cta_label, "cta_label", "pembuka");
  periksa(event.tagline, en.tagline, "event.tagline", "pembuka");
  periksa(config.footer_note, en.footer_note, "footer_note", "kaki");
  periksa(config.cta_heading, en.cta_heading, "cta_heading", "kaki");
  periksa(config.cta_note, en.cta_note, "cta_note", "kaki");
  // Judul bagian bawaan. Label kecil yang dimatikan tidak tampil, jadi tidak ditagih.
  (Object.keys(LANDING_EYEBROW_DEFAULT) as LandingHeadedSection[]).forEach((id) => {
    if (!bagian(id)) return;
    const alis = `${id}_eyebrow` as const;
    // Label yang tersembunyi karena sama dengan judulnya juga tidak ditagih.
    const fakta = { event_date: event.event_date ?? null, end_date: event.end_date ?? null, venue_name: event.venue_name ?? null, time_zone: event.time_zone };
    if (landingSectionHeading(fakta, config, "id", id).alis !== null) periksa(config[alis], en[alis], alis, id);
    if (id !== "about") periksa(config[`${id}_heading`], en[`${id}_heading`], `${id}_heading`, id);
  });
  if (bagian("faq")) periksa(config.faq_intro, en.faq_intro, "faq_intro", "faq");
  if (bagian("about")) {
    periksa(config.about_heading, en.about_heading, "about_heading", "about");
    periksa(event.description, en.description, "event.description", "about");
  }
  if (bagian("agenda")) {
    periksa(config.agenda_note, en.agenda_note, "agenda_note", "agenda");
    periksa(config.program_heading, en.program_heading, "program_heading", "agenda");
    periksa(config.program_intro, en.program_intro, "program_intro", "agenda");
    config.program_notes?.forEach((catatan, index) => periksa(catatan, en.program_notes?.[index], `program_notes.${index}`, "agenda"));
  }
  if (bagian("venue")) periksa(event.venue_address, en.venue_address, "event.venue_address", "venue");
  if (bagian("contact")) periksa(config.contact_name, en.contact_name, "contact_name", "contact");
  if (bagian("speakers")) {
    config.speakers?.forEach((speaker, index) => {
      (["title", "role"] as const).forEach((key) => periksa(speaker[key], speaker.en?.[key], `speakers.${index}.${key}`, "speakers"));
    });
    // Satu sesi dihitung sekali, berapa pun pembicaranya. Hanya sesi teks lama:
    // sesi dari rundown diterjemahkan di kartu rundown English.
    new Set(config.speakers?.filter((s) => !sesiDariRundown(s)).map((s) => s.session?.trim()).filter((nama): nama is string => !!nama)).forEach((nama) =>
      periksa(nama, landingSessionEn(config.speakers, nama), `speakers.session.${nama}`, "speakers"),
    );
    // Peran sesi dihitung sekali per peran berbeda, seperti di tab EN.
    peranSesiUntukEn(config.speakers).forEach(({ kunci, teks, en: terjemahan }) => periksa(teks, terjemahan, `speakers.session_role.${kunci}`, "speakers"));
  }
  if (bagian("faq")) {
    config.faq?.forEach((item, index) => {
      periksa(item.q, item.en?.q, `faq.${index}.q`, "faq");
      periksa(item.a, item.en?.a, `faq.${index}.a`, "faq");
    });
  }
  if (bagian("highlights")) {
    config.highlights?.forEach((item, index) => periksa(item.label, item.en?.label, `highlights.${index}.label`, "highlights"));
  }
  for (const block of config.blocks ?? []) {
    if (!menyala.has(block.id)) continue;
    LANDING_BLOCK_EN_KEYS.filter((key) => key !== "name").forEach((key) => periksa(block[key], block.en?.[key], `blocks.${block.id}.${key}`, block.id));
    block.items?.forEach((item, index) =>
      LANDING_ITEM_EN_KEYS.forEach((key) => periksa(item[key], item.en?.[key], `blocks.${block.id}.items.${index}.${key}`, block.id)),
    );
  }
  return hasil;
}

// ---- Teks bawaan halaman ---------------------------------------------------------

/** Teks yang ditulis di kode halaman acara Modern, per bahasa. Admin tetap berbahasa Indonesia. */
export type LandingUiText = {
  sectionLabels: Record<LandingSectionId, string>;
  nav: { program: string; speakers: string; agenda: string; venue: string; faq: string };
  navAria: string;
  openMenu: string;
  closeMenu: string;
  register: string;
  registerNow: string;
  signIn: string;
  memberArea: string;
  signInMemberArea: string;
  /** Pengganti tombol Daftar di bilah atas saat peserta sudah masuk. */
  myDashboard: string;
  signOut: string;
  /** Pengganti tombol utama hero saat peserta sudah masuk. */
  viewMyTicket: string;
  /** Pengganti "Lihat tiket saya" selama pendaftaran belum disetujui. */
  viewRegistrationStatus: string;
  announcements: string;
  /** Nama tombol lonceng untuk pembaca layar, dengan jumlah belum dibaca. */
  announcementsButton: (unread: number) => string;
  noAnnouncements: string;
  newAnnouncement: string;
  pinned: string;
  viewAllInDashboard: string;
  viewAgenda: string;
  aboutEvent: string;
  registrationSoon: string;
  /** Khusus undangan (invite_only): ajakan masuk menggantikan "pendaftaran dibuka segera". */
  memberSignIn: string;
  inviteOnly: string;
  inviteHeading: string;
  inviteNote: string;
  /** Gaya gathering (EventLandingConfig.gathering). */
  inviteOnlyShort: string;
  inviteCta: string;
  stayLength: (days: number) => string;
  day: (n: number) => string;
  invitedYou: string;
  /** Pil hitung mundur di hero: null setelah acara selesai (tidak dirender). */
  /** Angka (tebal, warna aksen) dan sisa kalimatnya; tanpa angka seluruh label ditebalkan. */
  countdown: (sisa: number, hariKe: number, lama: number) => { angka: string | null; teks: string };
  seeTrip: string;
  fullSchedule: string;
  moreItems: (n: number) => string;
  navTrip: string;
  navHotel: string;
  tripEyebrow: string;
  /** Bagian Portal peserta dan pratinjau di hero gaya gathering. */
  portalEyebrow: string;
  portalHeading: string;
  portalNote: string;
  portalFirstUp: string;
  portalAfterSignIn: string;
  portalTicket: string;
  portalTicketNote: string;
  portalRoom: string;
  portalRoomNote: (roommates: boolean) => string;
  portalBus: string;
  portalBusNote: string;
  portalNews: string;
  portalNewsNote: string;
  /** Tombol bagian Portal peserta, tombol bilah atas, dan tautan menu ke bagian itu. */
  portalCta: string;
  navPortalSignIn: string;
  navPortal: string;
  /** Kartu pratinjau portal di hero. */
  miniTitle: string;
  miniBus: string;
  miniRoom: string;
  /** Pita penutup gaya gathering tanpa isian CMS. */
  bandHeading: string;
  bandNote: string;
  /** Judul Rundown gaya gathering tanpa isian CMS: "Perjalanan 3 hari". */
  tripDays: (days: number) => string;
  /** Kartu Tentang acara bawaan preset Gathering. */
  aboutCardsDefault: { title: string; body: string }[];
  /** Judul Tentang acara yang diisi preset Gathering bila masih kosong. */
  aboutHeadingDefault: string;
  /** Label menu Tentang acara, gaya gathering. */
  navAbout: string;
  hotelEyebrow: string;
  hotelHeading: string;
  checkIn: string;
  checkOut: string;
  room: string;
  roomShare: (capacity: number, sameGender: boolean) => string;
  program: string;
  /** `${n} sesi` */
  sessions: (n: number) => string;
  /** `Dalam ${n} program.` */
  inPrograms: (n: number) => string;
  /** `Bagian ${n}` */
  part: (n: number) => string;
  /** Judul Pembicara bila pembicara datang dari 3 lembaga atau lebih. */
  speakersFrom: (speakers: number, institutions: number) => string;
  speakersBySession: string;
  speakerHighlights: string;
  otherSpeakers: string;
  agendaParts: string;
  /** "Andini dan Luis", "Andini, Luis, dan 3 lainnya" */
  andOthers: (names: string[], total: number) => string;
  openGoogleMaps: string;
  openMap: string;
  mapOf: (venue: string | null) => string;
  addToCalendar: string;
  findSeat: string;
  faqHeading: string;
  faqIntro: string;
  faqContact: string;
  ctaHeading: string;
  organisedBy: string;
  footerEvent: string;
  footerGuests: string;
  footerContact: string;
  poweredBy: string;
  readMore: string;
  downloadMaterial: string;
  document: string;
  /** Label kelompok pilihan bahasa "ID | EN" untuk pembaca layar. */
  languageGroup: string;
};

export const LANDING_UI: Record<LandingLang, LandingUiText> = {
  id: {
    sectionLabels: {
      about: "Tentang acara",
      highlights: "Angka penting",
      agenda: "Susunan acara",
      speakers: "Pembicara",
      venue: "Lokasi",
      faq: "Pertanyaan umum",
      sponsors: "Sponsor & mitra",
      contact: "Kontak panitia",
    },
    nav: { program: "Program", speakers: "Pembicara", agenda: "Susunan acara", venue: "Lokasi", faq: "FAQ" },
    navAria: "Navigasi acara",
    openMenu: "Buka menu",
    closeMenu: "Tutup menu",
    register: "Daftar",
    registerNow: "Daftar sekarang",
    signIn: "Masuk",
    memberArea: "Area peserta",
    signInMemberArea: "Masuk area peserta",
    myDashboard: "Dashboard saya",
    signOut: "Keluar",
    viewMyTicket: "Lihat tiket saya",
    viewRegistrationStatus: "Lihat status pendaftaran",
    announcements: "Pengumuman",
    announcementsButton: (n) => (n > 0 ? `Pengumuman, ${n} belum dibaca` : "Pengumuman"),
    noAnnouncements: "Belum ada pengumuman dari panitia.",
    newAnnouncement: "Baru",
    pinned: "Disematkan",
    viewAllInDashboard: "Lihat semua di Dashboard saya",
    viewAgenda: "Lihat susunan acara",
    aboutEvent: "Pelajari acaranya",
    registrationSoon: "Pendaftaran dibuka segera.",
    memberSignIn: "Masuk peserta",
    inviteOnly: "Khusus undangan.",
    inviteHeading: "Sudah menerima undangan?",
    inviteNote: "Masuk dengan email yang didaftarkan panitia untuk melihat tiket dan info perjalanan Anda.",
    inviteOnlyShort: "Khusus undangan",
    inviteCta: "Lihat Perjalanan Saya",
    stayLength: (days) => (days > 1 ? `${days} hari ${days - 1} malam` : "1 hari"),
    day: (n) => `Hari ${n}`,
    invitedYou: "Anda diundang",
    countdown: (sisa, hariKe, lama) =>
      sisa > 1 ? { angka: String(sisa), teks: "hari lagi" } : { angka: null, teks: sisa === 1 ? "Besok" : lama > 1 ? `Hari ke-${hariKe} dari ${lama}` : "Hari ini" },
    seeTrip: "Intip Rundown",
    fullSchedule: "Lihat jadwal lengkap jam per jam",
    moreItems: (n) => `+${n} lagi di jadwal lengkap`,
    navTrip: "Rundown",
    navHotel: "Hotel",
    tripEyebrow: "Rundown",
    portalEyebrow: "Portal peserta",
    portalHeading: "Semua info perjalananmu, di satu genggaman.",
    portalNote: "Masuk ke portal pribadimu untuk melihat tiket, nomor kamar & teman sekamar, rundown lengkap, jadwal bus, dan pengumuman panitia, langsung dari HP-mu.",
    portalFirstUp: "Agenda selanjutnya",
    portalAfterSignIn: "Setelah masuk",
    portalTicket: "Tiket masuk",
    portalTicketNote: "Kode QR untuk meja registrasi",
    portalRoom: "Info kamar",
    portalRoomNote: (roommates) => (roommates ? "Nomor kamar & teman sekamar" : "Nomor kamar & hotel"),
    portalBus: "Jadwal bus",
    portalBusNote: "Antar-jemput tiap pindah lokasi",
    portalNews: "Pengumuman",
    portalNewsNote: "Info terbaru dari panitia",
    portalCta: "Masuk ke Portal Peserta",
    navPortalSignIn: "Masuk Portal",
    navPortal: "Perjalanan",
    miniTitle: "Perjalanan Anda",
    miniBus: "Bus Anda",
    miniRoom: "Kamar Anda",
    bandHeading: "Siap berangkat bareng?",
    bandNote: "Masuk dengan email yang terdaftar untuk lihat tiket dan kamarmu.",
    tripDays: (days) => `Perjalanan ${days} hari`,
    aboutHeadingDefault: "Bukan sekadar kumpul, ini waktunya kita recharge bareng.",
    navAbout: "Tentang",
    aboutCardsDefault: [
      { title: "Kebersamaan", body: "Satu tujuan, satu keluarga. Perkuat kebersamaan lewat aktivitas yang seru dan bermakna." },
      { title: "Jelajah", body: "Menikmati kota tujuan, dari tempat bersejarah sampai kuliner yang bikin kangen." },
      { title: "Energi Baru", body: "Pulang bukan cuma bawa oleh-oleh, tapi juga semangat dan kebanggaan jadi bagian tim." },
    ],
    hotelEyebrow: "Hotel",
    hotelHeading: "Tempat menginap",
    checkIn: "Check-in",
    checkOut: "Check-out",
    room: "Kamar",
    roomShare: (capacity, sameGender) =>
      `${capacity === 1 ? "Sendiri" : capacity === 2 ? "Berdua" : capacity === 3 ? "Bertiga" : `${capacity} orang`}${capacity > 1 && sameGender ? ", sesama jenis kelamin" : ""}`,
    program: "Program",
    sessions: (n) => `${n} sesi`,
    inPrograms: (n) => `Dalam ${n} program.`,
    part: (n) => `Bagian ${n}`,
    speakersFrom: (speakers, institutions) => `${speakers} pembicara dari ${institutions} lembaga`,
    speakersBySession: "Pembicara per sesi",
    speakerHighlights: "Sorotan",
    otherSpeakers: "Pembicara lain",
    agendaParts: "Bagian acara",
    andOthers: (names, total) => (total > 2 ? `${names.join(", ")}, dan ${total - 2} lainnya` : names.join(" dan ")),
    openGoogleMaps: "Buka di Google Maps",
    openMap: "Buka peta",
    mapOf: (venue) => `Peta ${venue ?? "lokasi acara"}`,
    addToCalendar: "Tambah ke kalender",
    findSeat: "Cari kursi Anda di denah",
    faqHeading: "Sebelum Anda datang",
    faqIntro: "Pertanyaan yang paling sering ditanyakan tamu.",
    faqContact: " Hubungi panitia untuk hal lain.",
    ctaHeading: "Amankan tempat Anda",
    organisedBy: "Diselenggarakan oleh",
    footerEvent: "Acara",
    footerGuests: "Peserta",
    footerContact: "Kontak panitia",
    poweredBy: "Dikelola dengan Tally",
    readMore: "Selengkapnya",
    downloadMaterial: "Unduh materi",
    document: "Dokumen",
    languageGroup: "Bahasa halaman",
  },
  en: {
    sectionLabels: {
      about: "About the event",
      highlights: "Key figures",
      agenda: "Agenda",
      speakers: "Speakers",
      venue: "Venue",
      faq: "Frequently asked questions",
      sponsors: "Sponsors & partners",
      contact: "Contact",
    },
    nav: { program: "Programme", speakers: "Speakers", agenda: "Agenda", venue: "Venue", faq: "FAQ" },
    navAria: "Event navigation",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    register: "Register",
    registerNow: "Register now",
    signIn: "Sign in",
    memberArea: "Participant area",
    signInMemberArea: "Participant sign-in",
    myDashboard: "My dashboard",
    signOut: "Sign out",
    viewMyTicket: "View my ticket",
    viewRegistrationStatus: "View registration status",
    announcements: "Announcements",
    announcementsButton: (n) => (n > 0 ? `Announcements, ${n} unread` : "Announcements"),
    noAnnouncements: "No announcements from the organisers yet.",
    newAnnouncement: "New",
    pinned: "Pinned",
    viewAllInDashboard: "View all in My dashboard",
    viewAgenda: "View agenda",
    aboutEvent: "About the event",
    registrationSoon: "Registration opens soon.",
    memberSignIn: "Participant sign in",
    inviteOnly: "By invitation only.",
    inviteHeading: "Received an invitation?",
    inviteNote: "Sign in with the email the organisers registered to see your ticket and travel details.",
    inviteOnlyShort: "By invitation only",
    inviteCta: "See My Trip",
    stayLength: (days) => (days > 1 ? `${days} days, ${days - 1} night${days - 1 > 1 ? "s" : ""}` : "1 day"),
    day: (n) => `Day ${n}`,
    invitedYou: "You're invited",
    countdown: (sisa, hariKe, lama) =>
      sisa > 1 ? { angka: String(sisa), teks: "days to go" } : { angka: null, teks: sisa === 1 ? "Tomorrow" : lama > 1 ? `Day ${hariKe} of ${lama}` : "Today" },
    seeTrip: "Peek at the Rundown",
    fullSchedule: "See the full hour-by-hour schedule",
    moreItems: (n) => `+${n} more in the full schedule`,
    navTrip: "Rundown",
    navHotel: "Hotel",
    tripEyebrow: "Rundown",
    portalEyebrow: "Participant portal",
    portalHeading: "All your trip info, in the palm of your hand.",
    portalNote: "Open your personal portal to see your ticket, room number & roommate, the full rundown, bus times and announcements from the organisers, right on your phone.",
    portalFirstUp: "Up next",
    portalAfterSignIn: "After sign-in",
    portalTicket: "Entry ticket",
    portalTicketNote: "QR code for the registration desk",
    portalRoom: "Room info",
    portalRoomNote: (roommates) => (roommates ? "Room number & roommate" : "Room number & hotel"),
    portalBus: "Bus schedule",
    portalBusNote: "Transfers each time you move",
    portalNews: "Announcements",
    portalNewsNote: "The latest from the organisers",
    portalCta: "Open the Participant Portal",
    navPortalSignIn: "Portal Sign-in",
    navPortal: "Your trip",
    miniTitle: "Your trip",
    miniBus: "Your bus",
    miniRoom: "Your room",
    bandHeading: "Ready to go together?",
    bandNote: "Sign in with your registered email to see your ticket and room.",
    tripDays: (days) => `${days}-day trip`,
    aboutHeadingDefault: "More than a get-together: this is our time to recharge.",
    navAbout: "About",
    aboutCardsDefault: [
      { title: "Together", body: "One goal, one family. Grow closer through activities that are fun and meaningful." },
      { title: "Explore", body: "Enjoy the destination, from its landmarks to the food you'll miss once you're home." },
      { title: "New Energy", body: "Come home with more than souvenirs: fresh energy and pride in being part of the team." },
    ],
    hotelEyebrow: "Hotel",
    hotelHeading: "Where you'll stay",
    checkIn: "Check-in",
    checkOut: "Check-out",
    room: "Room",
    roomShare: (capacity, sameGender) =>
      `${capacity === 1 ? "Single" : capacity === 2 ? "Twin share" : `${capacity} per room`}${capacity > 1 && sameGender ? ", same gender" : ""}`,
    program: "Programme",
    sessions: (n) => `${n} ${n === 1 ? "session" : "sessions"}`,
    inPrograms: (n) => `Across ${n} programmes.`,
    part: (n) => `Part ${n}`,
    speakersFrom: (speakers, institutions) => `${speakers} speakers from ${institutions} institutions`,
    speakersBySession: "Speakers by session",
    speakerHighlights: "Highlights",
    otherSpeakers: "Other speakers",
    agendaParts: "Event parts",
    andOthers: (names, total) => (total > 2 ? `${names.join(", ")} and ${total - 2} more` : names.join(" and ")),
    openGoogleMaps: "Open in Google Maps",
    openMap: "Open map",
    mapOf: (venue) => `Map of ${venue ?? "the venue"}`,
    addToCalendar: "Add to calendar",
    findSeat: "Find your seat on the seating plan",
    faqHeading: "Before you come",
    faqIntro: "The questions guests ask most often.",
    faqContact: " Contact the organisers for anything else.",
    ctaHeading: "Save your seat",
    organisedBy: "Organised by",
    footerEvent: "Event",
    footerGuests: "Participants",
    footerContact: "Contact",
    poweredBy: "Powered by Tally",
    readMore: "Learn more",
    downloadMaterial: "Download",
    document: "Document",
    languageGroup: "Page language",
  },
};
