import type { EventLandingConfig } from "./landing-config.ts";

/**
 * Area peserta: peserta masuk dengan email pendaftaran + kata sandi di halaman
 * acara, lalu melihat kode QR, kursi, susunan acara, dan tautan voting miliknya.
 *
 * `audience`:
 *   - `approved` (bawaan): hanya peserta dari pendaftaran publik yang disetujui.
 *   - `all`: semua baris di Daftar peserta yang punya email, termasuk impor.
 *
 * Tiap `show_*` bawaan menyala; `feedback_url` kosong berarti kartu umpan balik
 * tidak tampil.
 */
export type LandingMemberAudience = "approved" | "all";

export type LandingMemberSignIn = "password" | "email_code" | "fields";

export type LandingMemberConfig = {
  enabled: boolean;
  audience?: LandingMemberAudience;
  show_code?: boolean;
  show_seat?: boolean;
  show_schedule?: boolean;
  show_vote?: boolean;
  /**
   * Kamar, bus, dan barang dari Logistik di Dashboard saya. Bawaan MATI, beda
   * dengan sakelar lain: penempatan yang setengah jadi tidak boleh terbaca
   * peserta sebagai kamar finalnya. Panitia menyalakannya saat siap.
   */
  show_logistics?: boolean;
  /**
   * Bagian Logistik yang disembunyikan walau show_logistics menyala: "rooms",
   * "vehicles", "trains", "items" (lib/logistik/bagian-tampil.ts). Kosong =
   * semua tampil.
   */
  hide_logistics?: string[];
  /** Teman sekamar di kartu Kamar (dibaca member_logistics). Bawaan tampil. */
  show_roommates?: boolean;
  /**
   * Plat nomor dan kontak kru bus yang dinaiki peserta, di kartu Bus. Bawaan
   * MATI: kontak kru adalah nomor pribadi. Diatur di Logistics > Buses.
   */
  show_bus_plate?: boolean;
  show_bus_crew?: boolean;
  /**
   * Email Sign-in link ke walk-in yang baru didaftarkan petugas (lihat
   * sendWalkinLink). Bawaan MATI: menyalakannya tidak mengirim ke peserta lama.
   */
  walkin_link?: boolean;
  /**
   * Cara peserta masuk (Participant area > How participants sign in). Kosong =
   * "password", sama dengan sebelum pilihan ini ada.
   *   password    email + kata sandi (tautan email untuk membuat kata sandi)
   *   email_code  email, lalu kode 6 digit ke email itu setiap kali masuk
   *   fields      dua kolom data peserta pilihan admin (`sign_in_fields`).
   *               Paling lemah: isinya sering diketahui rekan kerja.
   */
  sign_in?: LandingMemberSignIn;
  /** Dua kolom untuk `sign_in: "fields"`: "email", "phone", "name", atau "x:<kunci pertanyaan tambahan>". */
  sign_in_fields?: [string, string] | null;
  /**
   * Contoh isian (placeholder) per kolom cara dua kolom, dikunci id kolom
   * (bukan urutan), jadi ikut kolomnya bila First/Second field ditukar.
   * `text` untuk halaman Indonesia, `en` untuk halaman English (kosong =
   * `text`). Kolom tanpa isian memakai bawaan (contohKolomMasuk).
   */
  sign_in_examples?: Record<string, { text?: string | null; en?: string | null }> | null;
  /**
   * Kapan acara ini terakhir pindah KE cara dua kolom. Diisi server
   * (api/admin/area-peserta), bukan layar admin: sesi dua kolom yang lebih
   * tua ditolak, jadi pindah ke cara lain lalu kembali tidak menghidupkannya.
   */
  sign_in_since?: string;
  feedback_url?: string | null;
  /**
   * Beranda halaman peserta (Participant area > Participant home): urutan id
   * bawaan (MEMBER_HOME_BUILTINS) dan blok `blk_...`, dan yang disembunyikan
   * dari Beranda. Kosong = urutan bawaan, sama dengan sebelum pilihan ini ada.
   * Menyembunyikan di sini hanya dari Beranda: tab Jadwal, Info, dan data
   * Logistik tetap diatur saklarnya sendiri (show_schedule, show_logistics).
   */
  home?: { order?: string[]; hidden?: string[] };
  /**
   * Kehadiran untuk panitia di portal (lib/member/akses-panitia.ts): Tipe
   * peserta yang mendapat akses dan titik yang disembunyikan. Disunting di
   * Check-in > Checkpoints > Committee access. Kosong = mati.
   */
  committee?: { types: string[]; hidden: string[] } | null;
  /**
   * Label halaman Outfit di portal Gathering Horizon (judul halaman, strip di
   * Susunan acara, baris Beranda; bilah atas dan Menu bila Jadwal
   * disembunyikan). Kosong = "Outfit". Paling panjang 16 huruf.
   * Disunting dan disimpan di Participant area (Dress code page > Page name);
   * Agenda > Dress code hanya menampilkannya.
   */
  outfit_label?: string | null;
  /**
   * Dresscode Setiap hari portal Gathering Horizon (keputusan Mas 21 Okt): satu
   * baris untuk seluruh acara, di depan baris tiap hari, juga tanpa tab Agenda.
   * Tidak ada atau `what` kosong = tidak ada. Dibaca lewat
   * bacaOutfitSetiapHari (lib/outfit-setiap-hari.ts), karena portal tidak
   * memeriksa `member` dengan skema.
   */
  outfit_every_day?: { what: string; note?: string; photo_url?: string } | null;
  /**
   * Kartu darurat dan bantuan di Menu portal Gathering Horizon (E-03): satu
   * blok khusus peserta pilihan panitia, tampil di bawah Perjalanan dan
   * ditaut dari kartu bantuan Perjalanan, bukan di Beranda. Kosong = tidak ada.
   */
  help_block?: string | null;
  /**
   * Kontak darurat dan bantuan (E-03) yang diisi langsung di Participant
   * area > Emergency and help. Ada kontaknya = menggantikan `help_block`.
   */
  help?: {
    title?: string | null;
    note?: string | null;
    contacts?: Array<{ name: string; kind?: "hospital" | "police" | "fire" | "ambulance" | "hotel" | "other" | null; phone?: string | null; note?: string | null; map_url?: string | null; en?: { name?: string | null; note?: string | null } | null }>;
    /** Teks English untuk halaman /en; kosong = teks Indonesia. */
    en?: { title?: string | null; note?: string | null } | null;
  } | null;
  /**
   * Kartu "Hadiah kamu" di Beranda pemenang undian (lib/member/hadiah.ts),
   * Participant area > Lucky draw prize. Bawaan MATI. `note` = cara mengambil
   * bawaan untuk hadiah yang catatannya sendiri kosong; `en.note` untuk /en.
   */
  prize?: { enabled: boolean; note?: string | null; en?: { note?: string | null } | null } | null;
  /**
   * Notifikasi HP (Web Push), Participant area > Phone notifications. Bawaan
   * MATI. Menyala: peserta diajak mengaktifkan notifikasi (ajakan sekali
   * setelah masuk + baris di panel lonceng), dan portal memakai manifest per
   * acara supaya bisa dipasang di Layar Utama iPhone.
   */
  push?: { enabled: boolean } | null;
  /**
   * Foto dan video acara (lib/member/dokumentasi.ts), Participant area >
   * Event photos and videos. Bawaan MATI. Satu link, per hari Agenda (id
   * bagian), atau per baris Agenda (id baris); tampil setelah selesai.
   */
  photos?: { enabled: boolean; mode: "event" | "day" | "session"; url?: string | null; days?: Record<string, string> | null; sessions?: Record<string, string> | null } | null;
};

/** `outfit` dan `help`: hanya Gathering Horizon (Beranda "Hari ini"). */
export type MemberHomeId = "quick" | "announcements" | "next" | "checkpoints" | "logistics" | "roommates" | "agenda" | "outfit" | "help";

/**
 * Isi bawaan Beranda halaman peserta, dalam urutan bawaannya per tata letak.
 * Urutan bawaan sama persis dengan dashboard sebelum daftar ini ada, supaya
 * acara yang belum menyentuhnya tidak bergeser satu piksel pun. Blok peserta
 * masuk tepat sebelum `agenda`.
 */
export type MemberHomeSource = { label: string; href: string };
const SUMBER_AGENDA: MemberHomeSource = { label: "Agenda", href: "/admin/rundown" };
const SUMBER_LOGISTIK: MemberHomeSource = { label: "Logistics", href: "/admin/logistik" };
const SUMBER_PESAN: MemberHomeSource = { label: "Messages", href: "/admin/pengumuman/lonceng" };
const SUMBER_CHECKPOINT: MemberHomeSource = { label: "Check-in", href: "/admin/attendance?tab=checkpoint" };
const SUMBER_HALAMAN: MemberHomeSource = { label: "Event page", href: "/admin/landing" };
const SUMBER_PENGATURAN: MemberHomeSource = { label: "Event settings", href: "/admin/settings" };

/**
 * `source`: layar tempat isi baris itu disunting. Participant home menautkannya
 * ("Edit in Agenda"), bukan menyalin editornya: satu data, satu tempat.
 */
export const MEMBER_HOME_BUILTINS: Record<"gathering" | "modern" | "horizon", readonly { id: MemberHomeId; label: string; sub: string; source: MemberHomeSource; side?: boolean }[]> = {
  gathering: [
    { id: "quick", label: "Quick links", sub: "Ticket, map, organisers", source: SUMBER_HALAMAN, side: true },
    { id: "announcements", label: "Announcements", sub: "Latest announcement", source: SUMBER_PESAN },
    { id: "next", label: "Next up", sub: "The next session", source: SUMBER_AGENDA },
    { id: "checkpoints", label: "Checkpoints", sub: "Progress and next step", source: SUMBER_CHECKPOINT },
    { id: "logistics", label: "Vehicle and room", sub: "Their vehicle and room", source: SUMBER_LOGISTIK, side: true },
    { id: "roommates", label: "Roommates", sub: "Who shares their room", source: SUMBER_LOGISTIK, side: true },
    { id: "agenda", label: "Today\u2019s agenda", sub: "Today\u2019s sessions", source: SUMBER_AGENDA },
  ],
  modern: [
    { id: "next", label: "Next vehicle", sub: "The next trip", source: SUMBER_LOGISTIK },
    { id: "checkpoints", label: "Checkpoints", sub: "Progress and next step", source: SUMBER_CHECKPOINT },
    { id: "announcements", label: "Announcements", sub: "Latest announcement", source: SUMBER_PESAN },
    { id: "agenda", label: "Agenda", sub: "Their sessions", source: SUMBER_AGENDA },
    { id: "logistics", label: "Room, vehicle and items", sub: "Their room, vehicle and kit items", source: SUMBER_LOGISTIK, side: true },
    { id: "quick", label: "Quick links", sub: "Voting, feedback, map", source: SUMBER_HALAMAN, side: true },
  ],
  // Gathering Horizon (Beranda "Hari ini"); urutannya diatur lib/member/susunan-horizon.ts.
  horizon: [
    { id: "announcements", label: "Announcements", sub: "Latest announcement", source: SUMBER_PESAN },
    { id: "next", label: "Next up", sub: "Now and next sessions", source: SUMBER_AGENDA },
    { id: "outfit", label: "Today's dress code", sub: "From Agenda > Dress code", source: SUMBER_AGENDA },
    { id: "checkpoints", label: "Checkpoints", sub: "Progress and next step", source: SUMBER_CHECKPOINT },
    { id: "logistics", label: "Vehicle and room", sub: "Travel card before the event, then a trip summary", source: SUMBER_LOGISTIK },
    { id: "roommates", label: "Roommates", sub: "Who shares their room", source: SUMBER_LOGISTIK },
    { id: "help", label: "Help card", sub: "Links to organiser and emergency contacts", source: SUMBER_PENGATURAN },
  ],
};

/**
 * Urutan Beranda halaman peserta: yang tersimpan dulu, lalu yang belum ada di
 * sana (blok baru, isi bawaan baru) di tempat bawaannya, yaitu sebelum isi
 * berikutnya dalam urutan bawaan yang sudah ada. Dipakai CMS dan kedua
 * dashboard, jadi daftar di CMS selalu sama dengan halamannya.
 */
/**
 * Tempat Announcements di Beranda Gathering Horizon, dibaca dari urutan
 * tersimpan (posisinya terhadap Bus and room dan Next up). 0 = paling atas,
 * 1 = setelah Bus and room, 2 = setelah Next up, 3 = urutan lama Gathering
 * klasik (Next up di depan), di ponsel sama dengan 0. Isi bawaan lain di
 * Horizon tempatnya tetap; dashboard dan editor Participant home memakai
 * fungsi yang sama, jadi keduanya selalu sepakat.
 */
export type SlotPengumumanHorizon = 0 | 1 | 2 | 3;

export function slotPengumumanHorizon(order: readonly string[]): SlotPengumumanHorizon | null {
  const posisi = (id: string) => order.indexOf(id);
  if (!order.includes("announcements")) return null;
  const sebelumBus = posisi("announcements") < posisi("logistics");
  const sebelumNext = posisi("announcements") < posisi("next");
  return sebelumBus ? (sebelumNext ? 0 : 3) : sebelumNext ? 1 : 2;
}

export function memberHomeOrder(home: LandingMemberConfig["home"], blockIds: readonly string[], gathering: boolean): { order: string[]; hidden: Set<string> } {
  const bawaan = MEMBER_HOME_BUILTINS[gathering ? "gathering" : "modern"].map((item) => item.id as string);
  const posisiAgenda = bawaan.indexOf("agenda");
  const urutanBawaan = [...bawaan.slice(0, posisiAgenda), ...blockIds, ...bawaan.slice(posisiAgenda)];
  const dikenal = new Set(urutanBawaan);
  const order = [...new Set((home?.order ?? []).filter((id) => dikenal.has(id)))];
  urutanBawaan.forEach((id, index) => {
    if (order.includes(id)) return;
    const sesudah = urutanBawaan.slice(index + 1).find((lain) => order.includes(lain));
    if (sesudah) order.splice(order.indexOf(sesudah), 0, id);
    else order.push(id);
  });
  return { order, hidden: new Set((home?.hidden ?? []).filter((id) => dikenal.has(id))) };
}

export const LANDING_MEMBER_AUDIENCE_LABELS: Record<LandingMemberAudience, string> = {
  approved: "Peserta yang pendaftarannya disetujui",
  all: "Semua peserta di Daftar peserta",
};

/**
 * Bilah atas tata letak Modern. Semua opsional; yang kosong memakai
 * LANDING_NAV_DEFAULTS (bilah hitam 72%, selebar layar, 64px), tampilan
 * sebelum pengaturan ini ada.
 */
export type LandingNavConfig = {
  /** Warna bilah, hex 6 digit. */
  color?: string;
  /** Ketidaktembusan 0-100 (%). 0 = bening, 100 = pekat. */
  opacity?: number;
  /** `full` = selebar layar; `content` = selebar isi halaman, sudut membulat. */
  width?: LandingNavWidth;
  /** Tinggi bilah dalam px. */
  height?: number;
  /** Logo acara di pojok kiri, menggantikan nama acara. Kosong = nama acara. */
  logo_url?: string | null;
  /**
   * Logo di atas gambar hero selagi bilah bening (opacity < 50). Bawaan
   * `white`: diputihkan (perilaku lama, acara lama tidak berubah). `original`:
   * warna logo sendiri.
   */
  logo_on_image?: LandingNavLogoTone;
};

export type LandingNavLogoTone = "white" | "original";

export type LandingGatheringVariant = "horizon";
export type LandingHorizonStyle = "trip";

/** Gaya Gathering Horizon dipakai halaman ini: varian hanya berlaku di gaya gathering. */
export function gatheringHorizon(config: EventLandingConfig | null | undefined): boolean {
  return config?.gathering === true && config.gathering_variant === "horizon";
}

/** Tema Gathering Trip: Gathering Horizon dengan portal bergaya aplikasi perjalanan. */
export function gatheringTrip(config: EventLandingConfig | null | undefined): boolean {
  return gatheringHorizon(config) && config?.horizon_style === "trip";
}

/**
 * Logo bilah atas diputihkan selagi di atas gambar hero? Hanya bila bilahnya
 * bening (opacity < 50), ada gambar di belakangnya, dan admin tidak memilih
 * warna asli logo.
 */
export function logoNavPutih(nav: LandingNavConfig | undefined, adaGambar: boolean): boolean {
  return adaGambar && (nav?.opacity ?? LANDING_NAV_DEFAULTS.opacity) < 50 && nav?.logo_on_image !== "original";
}

export type LandingNavWidth = "full" | "content";

export const LANDING_NAV_WIDTH_LABELS: Record<LandingNavWidth, string> = {
  full: "Full width",
  content: "Content width",
};

export const LANDING_NAV_DEFAULTS = { color: "#121212", opacity: 72, width: "full", height: 64 } as const;
/** Batas tinggi bilah. Di bawah 48px tombol Masuk/Daftar tidak muat (target sentuh 44px). */
export const LANDING_NAV_HEIGHT_MIN = 48;
export const LANDING_NAV_HEIGHT_MAX = 120;
/** Batas kartu Tentang acara gaya gathering. */
export const LANDING_ABOUT_CARDS = { max: 4, title: 40, body: 200 } as const;
