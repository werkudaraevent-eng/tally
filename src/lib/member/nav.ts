import type { EventLandingConfig, EventRow } from "@/lib/domain";
import { landingDefaultLang, landingPath, type LandingLang } from "@/lib/landing-i18n";
import type { MemberSession } from "@/lib/member/account";
import { isUnread, loadMemberAnnouncements, type MemberAnnouncements } from "@/lib/member/pengumuman";
import type { LoncengItem } from "@/components/member/lonceng-pengumuman";
import type { PopupItem } from "@/components/member/popup-pengumuman";
import { altFotoPengumuman } from "@/lib/pengumuman-foto";
import type { DataNotifikasi } from "@/components/member/ajakan-notifikasi";
import { publicEventName } from "@/lib/domain";
import { namaPendek } from "@/lib/push/ikon";
import { alamatIkon } from "@/lib/push/manifest";

/**
 * Isi bilah atas untuk peserta yang sudah masuk: lonceng pengumuman dan tombol
 * Dashboard saya, menggantikan Masuk dan Daftar di tempat yang sama.
 */
export type NavPeserta = {
  slug: string;
  dashboardHref: string;
  keluarAction: string;
  /** Dua huruf awal nama, untuk lingkaran di tombol Dashboard saya. */
  inisial: string;
  /** null: fitur pengumuman belum siap (migrasi belum jalan), lonceng disembunyikan. */
  lonceng: { items: LoncengItem[]; unread: number; popup: PopupItem[] } | null;
  /** Participant area > Phone notifications menyala: ajakan dan baris Notifikasi HP. */
  notifikasi: DataNotifikasi | null;
};

/** Notifikasi HP berlaku sampai akhir hari sesudah tanggal terakhir acara (UTC, longgar ke arah aman). */
export function pushMasihBerlaku(event: Pick<EventRow, "event_date" | "end_date">, sekarang = Date.now()): boolean {
  const akhir = event.end_date ?? event.event_date;
  if (!akhir) return true;
  return sekarang < new Date(`${akhir}T00:00:00Z`).getTime() + 2 * 24 * 60 * 60 * 1000;
}

/** Data ajakan notifikasi HP, atau null bila saklarnya mati (bawaan). */
export function dataNotifikasi(event: Pick<EventRow, "slug" | "name" | "landing_config" | "event_date" | "end_date">, lang: LandingLang): DataNotifikasi | null {
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  if (landing.member?.enabled !== true || landing.member.push?.enabled !== true) return null;
  // Lembar ajakan menjanjikan "berhenti setelah acara selesai": sehari setelah
  // tanggal terakhir acara, ajakan dan baris Notifikasi HP tidak tampil lagi.
  if (!pushMasihBerlaku(event)) return null;
  const utama = landingDefaultLang(landing);
  const nama = publicEventName(event);
  const portal = `${landingPath(event.slug, lang, utama)}/peserta`;
  return {
    slug: event.slug,
    // Sama persis dengan QR luring (DashboardGathering), supaya satu registrasi.
    sw: `${landingPath(event.slug, utama, utama)}/peserta-sw.js`,
    lingkup: portal,
    portal,
    ikon: alamatIkon(event.slug, utama, 180),
    namaAcara: nama,
    namaPendek: namaPendek(nama),
    logistik: landing.member.show_logistics === true,
  };
}

/** Paling banyak lima di lonceng; sisanya di Dashboard saya. */
const DI_LONCENG = 5;

export function inisialNama(nama: string) {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  const huruf = kata.length > 1 ? kata[0][0] + kata[kata.length - 1][0] : (kata[0] ?? "?").slice(0, 2);
  return huruf.toUpperCase();
}

/**
 * Nama di sapaan dashboard: nama lengkap seperti tertulis di data peserta.
 * Bukan kata pertama: banyak nama Indonesia diawali "Muhammad", "Siti", atau
 * "Ni Luh" yang bukan nama panggilan, jadi kata pertama sering salah orang.
 */
export function namaSapaan(nama: string) {
  return nama.trim().replace(/\s+/g, " ");
}

/** "3 Okt, 14.20" dalam zona waktu acara. */
export function waktuPengumuman(iso: string, timeZone: string | null | undefined, lang: LandingLang) {
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timeZone || "Asia/Jakarta",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function itemLonceng(
  data: MemberAnnouncements,
  event: Pick<EventRow, "time_zone">,
  lang: LandingLang,
  batas = DI_LONCENG,
): LoncengItem[] {
  return data.items.slice(0, batas).map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    link_url: item.link_url,
    link_label: item.link_label,
    foto: item.image_url ? { src: item.image_url, alt: altFotoPengumuman(item) } : null,
    pinned: item.pinned,
    waktu: waktuPengumuman(item.published_at, event.time_zone, lang),
    baru: isUnread(item, data.seenAt),
  }));
}

/**
 * Pengumuman Show as pop-up untuk peserta ini, yang terbaru dulu. Komponennya
 * membuka yang pertama yang belum ditutup di perangkat ini. `kunci` memuat
 * published_at, jadi Notify again membuatnya terbuka lagi.
 */
export function itemPopup(data: MemberAnnouncements, event: Pick<EventRow, "time_zone">, lang: LandingLang): PopupItem[] {
  return data.items
    .filter((item) => item.popup)
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .map((item) => ({
      kunci: `${item.id}:${item.published_at}`,
      title: item.title,
      body: item.body,
      link_url: item.link_url,
      link_label: item.link_label,
      foto: item.image_url ? { src: item.image_url, alt: altFotoPengumuman(item) } : null,
      waktu: waktuPengumuman(item.published_at, event.time_zone, lang),
    }));
}

/**
 * `data`: pengumuman yang sudah dimuat pemanggil (Dashboard saya memuatnya
 * sekali untuk lonceng dan daftarnya). `unread` dipaksa nol oleh pemanggil
 * yang sedang menampilkan semua pengumuman.
 */
export async function muatNavPeserta(
  event: Pick<EventRow, "id" | "slug" | "name" | "event_date" | "end_date" | "time_zone" | "landing_config" | "registration_form_config">,
  sesi: MemberSession,
  lang: LandingLang,
  opsi: { data?: MemberAnnouncements; unread?: number } = {},
): Promise<NavPeserta> {
  const data = opsi.data ?? (await loadMemberAnnouncements(event, sesi));
  const slug = encodeURIComponent(event.slug);
  // Dashboard dalam bahasa halaman yang sedang dibuka: `/e/<slug>/en/peserta`
  // dari halaman acara English, `/e/<slug>/peserta` dari bahasa utama.
  const utama = landingDefaultLang(event.landing_config as EventLandingConfig | null);
  return {
    slug: event.slug,
    dashboardHref: `${landingPath(slug, lang, utama)}/peserta`,
    keluarAction: `/e/${slug}/api/peserta/keluar`,
    inisial: inisialNama(sesi.name),
    lonceng: data.ready ? { items: itemLonceng(data, event, lang), unread: opsi.unread ?? data.unread, popup: itemPopup(data, event, lang) } : null,
    notifikasi: dataNotifikasi(event, lang),
  };
}
