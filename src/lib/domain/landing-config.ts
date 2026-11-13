import type { LandingCardTone } from "@/lib/landing-card-icons";
import type { RegistrationFormTheme } from "../registration-theme";
import type { LandingAboutMedia, LandingAgendaSpeakers, LandingBlock, LandingBlockTone, LandingConfigEn, LandingFaqLayout, LandingSectionEntry, LandingSectionId, LandingSpeakerFrame } from "./landing-blok.ts";
import type { LandingGatheringVariant, LandingHorizonStyle, LandingMemberConfig, LandingNavConfig } from "./landing-peserta.ts";
import type { LandingBannerStyle, LandingBodyFont, LandingCorners, LandingForumConfig, LandingHeadingFont, LandingHeadingScale, LandingHeroAlign, LandingHeroHeight, LandingHeroPosition, LandingLayout, LandingSpeaker } from "./landing-tampilan.ts";

export type EventLandingConfig = {
  /** Bawaan `editorial`. */
  layout?: LandingLayout;
  /**
   * Yang tayang di `/e/<slug>`. Bawaan `halaman` (halaman acara). `formulir`:
   * acara tanpa halaman acara; alamat itu langsung membuka formulir
   * pendaftaran, dan Tema (logo, gambar utama, warna, huruf) tetap dipakai
   * formulir, masuk peserta, dan area peserta. Lihat landingFormOnly.
   */
  tayang?: "halaman" | "formulir";
  /** Isi khusus tata letak Forum. */
  forum?: LandingForumConfig;
  /**
   * Nama acara yang dilihat tamu. Nama di kolom `events.name` dipakai admin
   * untuk membedakan acara di daftar (sering memuat nama klien, mis. "ILO ..."),
   * dan tidak selalu cocok tampil di hero. Kosong = pakai `events.name`.
   */
  public_name?: string;
  /** Bilah atas tata letak Modern: warna, transparansi, lebar, tinggi. */
  nav?: LandingNavConfig;
  // ---- Teks tambahan tata letak Modern --------------------------------------
  // Semuanya opsional; yang kosong jatuh ke judul bawaan atau tidak dirender
  // sama sekali, tidak pernah ke teks contoh.
  /** Judul besar di samping deskripsi (bagian Tentang). */
  about_heading?: string;
  /**
   * Gambar di samping deskripsi (tata letak Modern). Bawaan `auto`: banner
   * hero dengan angka pertama Sorotan atau jumlah sesi. `image`: gambar
   * `about_image_url`. `none`: deskripsi selebar halaman.
   */
  about_media?: LandingAboutMedia;
  /** Bingkai foto kartu pembicara, tata letak Modern saja. Bawaan `portrait`. */
  speaker_frame?: LandingSpeakerFrame;
  /** Pembicara di Susunan acara, tata letak Modern saja. Bawaan `text`. */
  agenda_speakers?: LandingAgendaSpeakers;
  about_image_url?: string | null;
  /** Teks alternatif gambar sendiri, dibacakan pembaca layar. */
  about_image_alt?: string;
  /**
   * Kartu bagian Tentang acara gaya gathering (rancangan pen.dev: tiga kartu
   * berikon di bawah judul). Preset Gathering mengisi tiga kartu bawaan bila
   * kosong; acara lain tidak membacanya.
   */
  about_cards?: {
    title: string;
    body: string;
    /** Nama ikon Phosphor, mis. "Users" (landing-card-icons.ts). Kosong = ikon bawaan urutannya. */
    icon?: string;
    /** Warna ubin ikon dari tema. Kosong = bawaan urutannya (Button, Brand, Accent). */
    tone?: LandingCardTone;
    /** Gambar ikon sendiri (PNG/WebP transparan, mis. ikon 3D). Diisi = menggantikan ikon dan ubinnya. */
    icon_url?: string | null;
  }[];
  /** Judul bagian Program, mis. "Dua program, satu hari". */
  program_heading?: string;
  /** Kalimat pengantar di kanan judul Program. */
  program_intro?: string;
  /** Keterangan tiap kartu program, urut sesuai bagian di Rundown. */
  program_notes?: string[];
  /** true = kartu Program dari Rundown tidak tampil (mis. sesi sudah ditulis di blok Kartu bergambar). */
  program_hidden?: boolean;
  /** Catatan di kiri Susunan acara, mis. "Registrasi dibuka pukul 08.00 WIB." */
  agenda_note?: string;
  /**
   * Judul bagian bawaan. Kosong = judul otomatis (tanggal, nama tempat,
   * jumlah pembicara) atau teks bawaan per bahasa.
   */
  agenda_heading?: string;
  speakers_heading?: string;
  venue_heading?: string;
  faq_heading?: string;
  /** Kalimat di bawah judul Pertanyaan umum. */
  faq_intro?: string;
  /** Label kecil di atas judul bagian. Kosong = nama bagian. */
  about_eyebrow?: string;
  agenda_eyebrow?: string;
  speakers_eyebrow?: string;
  venue_eyebrow?: string;
  faq_eyebrow?: string;
  /** Label kecil tampil atau tidak per bagian; dipakai bersama oleh ID dan EN. Default di LANDING_EYEBROW_DEFAULT. */
  eyebrow_shown?: Partial<Record<LandingSectionId, boolean>>;
  /**
   * Latar bagian bawaan gaya gathering, pilihan yang sama dengan blok.
   * Kosong = bawaan bagiannya (Susunan acara dan Pembicara abu-abu, lainnya putih).
   */
  section_tone?: Partial<Record<LandingSectionId, LandingBlockTone>>;
  /** Background › Custom per bagian (#RRGGBB); menimpa section_tone bila diisi. */
  section_bg_color?: Partial<Record<LandingSectionId, string>>;
  /** Kalimat penyelenggara di kaki halaman, mis. "Diselenggarakan oleh ...". */
  footer_note?: string;
  /** Judul banner ajakan di bawah halaman. */
  cta_heading?: string;
  /** Kalimat di bawah judul banner ajakan. */
  cta_note?: string;
  /** Area peserta. Tanpa nilai = mati. */
  member?: LandingMemberConfig;
  /** Isi blok dari pustaka blok; urutannya ada di `sections`. */
  blocks?: LandingBlock[];
  banner_url?: string | null;
  /** Bawaan `theme` — perilaku sebelum pilihan ini ada. */
  banner_style?: LandingBannerStyle;
  /** Bawaan `standard`. Diabaikan bila `hero_min_height` diisi. */
  hero_height?: LandingHeroHeight;
  /** Tinggi minimum hero di layar lebar, dalam px. Tidak pernah melebihi tinggi layar. */
  hero_min_height?: number;
  cta_label?: string;
  /** Bawaan per tata letak, lihat LANDING_TOKEN_DEFAULTS (landing-tokens.ts). */
  heading_font?: LandingHeadingFont;
  /**
   * Huruf isi. Kosong = bawaan tata letak (Inter; Ubuntu di Forum). Hanya
   * huruf yang terbaca di ukuran kecil, lihat LANDING_BODY_FONTS.
   */
  body_font?: LandingBodyFont;
  /**
   * Sudut tombol, kartu, dan foto halaman acara. Kosong = `soft` (skala M3
   * apa adanya). Forum tidak membacanya: rancangan IFC punya sudutnya sendiri.
   */
  corners?: LandingCorners;
  /**
   * Perataan teks hero, khusus Modern. Kosong = kiri; gaya gathering tengah.
   * Editorial selalu kiri karena kolom fakta acara ada di kanan.
   */
  hero_align?: LandingHeroAlign;
  /** Letak isi hero, khusus Modern. Kosong = bawah bila ada KV, tengah bila tidak ada; gathering tengah. */
  hero_position?: LandingHeroPosition;
  /** Bawaan `lg`. Diabaikan bila `heading_size` diisi. */
  heading_scale?: LandingHeadingScale;
  /** Ukuran nama acara di layar lebar, dalam px. Di layar sempit mengecil otomatis. */
  heading_size?: number;
  sections?: LandingSectionEntry[];
  speakers?: LandingSpeaker[];
  /** Angka yang ingin ditonjolkan: "300+ peserta", "12 booth". */
  highlights?: { label: string; value: string; en?: { label?: string; value?: string } }[];
  /**
   * `group`: topik opsional (tampilan Daftar), teks bebas dari panitia.
   * `group_id` hanya ada setelah resolveLanding di /en: nama Indonesianya,
   * supaya pengelompokan tidak pecah bila terjemahan topik berbeda.
   */
  faq?: { q: string; a: string; group?: string; group_id?: string; en?: { q?: string; a?: string; group?: string } }[];
  /** Tampilan FAQ di tata letak Modern. Kosong = kartu (seperti sebelumnya). */
  faq_layout?: LandingFaqLayout;
  /** Logo sponsor dan mitra. Diunggah di CMS halaman acara, bukan ditarik dari layar lain. */
  sponsors?: { name?: string; logo_url: string; en?: { name?: string } }[];
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  /**
   * Kontak panitia kedua dan ketiga (Event settings > Kontak panitia). Yang
   * pertama tetap `contact_*`, dipakai halaman yang hanya butuh satu kontak.
   */
  contact_more?: { name?: string; role?: string; phone?: string; email?: string }[];
  /** Peran atau jabatan kontak utama, mis. "Ketua Panitia" (Event settings). */
  contact_role?: string;
  /**
   * Warna merek halaman. Bentuknya sama dengan tema form pendaftaran, dan
   * memang disengaja: satu acara punya satu warna, dua permukaan.
   */
  theme?: RegistrationFormTheme;
  /**
   * Versi English halaman (`/e/<slug>/en`) dan tombol bahasanya tampil. Bawaan
   * mati: selama mati, alamat English 404 dan halaman Indonesia tidak berubah.
   */
  en_enabled?: boolean;
  /**
   * Khusus undangan (preset Gathering): peserta diimpor panitia, jadi saat
   * pendaftaran tertutup hero dan pita penutup mengajak MASUK, bukan menunggu
   * pendaftaran dibuka. Hanya berlaku di Modern dan bila area peserta aktif;
   * tanpa itu halaman sama persis dengan pendaftaran tertutup biasa.
   */
  invite_only?: boolean;
  /**
   * Gaya gathering (preset Gathering, tata letak Modern saja): hero perjalanan
   * dengan lama menginap, susunan acara per "Hari N", bagian Tempat menginap
   * dari hotel di Logistik menggantikan Lokasi, dan kartu Program serta kotak
   * angka sesi (khas acara rapat) disembunyikan.
   */
  gathering?: boolean;
  /**
   * Varian gaya gathering. Kosong = Gathering yang sudah ada (tidak berubah).
   * `horizon`: rancangan V5 "Beyond Everyday" Hanung (pen.dev, 2026-10-13):
   * hero navy dengan KV utuh di bawah judul, cerita bergambar di atas krem,
   * perjalanan per hari di atas navy, kartu perjalanan, pita penutup emas.
   * Hanya dibaca bila `gathering` menyala; dipilih lewat preset Gathering Horizon.
   */
  gathering_variant?: LandingGatheringVariant;
  /**
   * Gaya portal peserta Gathering Horizon. Kosong = Horizon klasik (tidak
   * berubah). `trip`: tema "Gathering Trip" (keputusan Mas 28 Okt 2026), pola
   * aplikasi perjalanan: e-tiket, kartu per pesanan, dua kolom di desktop.
   * Data dan teksnya sama dengan Horizon, jadi pindah bolak-balik tidak
   * menghapus apa pun. Hanya dibaca bila `gathering_variant` = "horizon".
   */
  horizon_style?: LandingHorizonStyle;
  /**
   * Kartu perjalanan Gathering Horizon: asal dan tujuan ("Gambir" dan
   * "Yogyakarta"). Kosong = tujuan dari nama tempat acara, tanpa asal.
   */
  pass_from?: string;
  pass_to?: string;
  /**
   * Teks Gathering Horizon yang bisa disunting. Kosong = teks bawaan
   * ("Mulai perjalanan kita", "01 / Sebuah awal baru", ajakan Portal peserta).
   * Gaya lain tidak membacanya.
   */
  hero_button_label?: string;
  hero_index?: string;
  portal_eyebrow?: string;
  portal_heading?: string;
  portal_note?: string;
  portal_button_label?: string;
  /**
   * Logo di tengah hero gaya gathering, di atas judul ajakan. Kosong = hero
   * tanpa logo. Acara lain tidak membacanya.
   */
  hero_logo_url?: string | null;
  /**
   * Warna aksen gaya gathering: tombol utama hero, label kecil, angka hari, dan
   * permukaan pasir (aksen yang diencerkan). Bawaan emas #E9C46A.
   */
  accent?: string;
  /**
   * Warna tombol gaya gathering: tombol utama, label kecil, tab aktif, dan ikon
   * portal. Preset Gathering mengisi hijau #007F50; kosong = tombol warna aksen
   * seperti sebelumnya.
   */
  button_color?: string;
  /** Kalimat di bawah judul hero gaya gathering. Kosong = tanpa kalimat. */
  hero_note?: string;
  /** Label pil di atas judul hero gaya gathering. Kosong = "Anda diundang · nama acara". */
  hero_eyebrow?: string;
  /**
   * Kotak HP "Portal peserta" di kanan hero gaya gathering, selama Participant
   * area menyala. Kosong = tampil (false menyembunyikannya).
   */
  portal_preview?: boolean;
  /** Bagian "Portal peserta" di akhir halaman gaya gathering. Kosong = tampil. */
  portal_section?: boolean;
  /**
   * Gambar latar (KV) hero gaya gathering dan kepala navy portal peserta,
   * tampil 20% di atas gradasi navy seperti rancangan Figma Hanung. Kosong =
   * gradasi saja, seperti sebelumnya.
   */
  hero_bg_url?: string | null;
  /** Saklar KV di atas. Kosong = tampil selama gambarnya ada. */
  hero_bg_on?: boolean;
  /** Kekuatan KV dalam persen (HERO_KV_KUAT, 5 sampai 50). Kosong = 20. */
  hero_bg_opacity?: number;
  /** Warna lapisan di bawah KV. Kosong = warna merek (gradasi navy). */
  hero_bg_color?: string;
  /**
   * Piksel terang KV (persentil 99,9 sesudah blur, #rrggbbaa), diukur peramban saat unggah.
   * Dipakai kvGathering untuk menakar bayangan; kosong = dianggap putih polos.
   */
  hero_bg_terang?: string;
  /** URL gambar yang diukur untuk hero_bg_terang. Beda dengan hero_bg_url = ukuran diabaikan. */
  hero_bg_terang_src?: string;
  /**
   * Bahasa di alamat utama `/e/<slug>` (bawaan "id"). "en" hanya berlaku
   * selama versi English menyala; lihat landingDefaultLang.
   */
  default_lang?: "id" | "en";
  /** Teks English tingkat halaman. Lihat src/lib/landing-i18n.ts. */
  en?: LandingConfigEn;
};
