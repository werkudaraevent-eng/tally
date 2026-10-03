import type { EventRow } from "@/lib/domain";
import type { LandingLang } from "@/lib/landing-i18n";
import type { MemberSession } from "@/lib/member/account";
import { isUnread, loadMemberAnnouncements, type MemberAnnouncements } from "@/lib/member/pengumuman";
import type { LoncengItem } from "@/components/member/lonceng-pengumuman";

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
  lonceng: { items: LoncengItem[]; unread: number } | null;
};

/** Paling banyak lima di lonceng; sisanya di Dashboard saya. */
const DI_LONCENG = 5;

export function inisialNama(nama: string) {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  const huruf = kata.length > 1 ? kata[0][0] + kata[kata.length - 1][0] : (kata[0] ?? "?").slice(0, 2);
  return huruf.toUpperCase();
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
    pinned: item.pinned,
    waktu: waktuPengumuman(item.published_at, event.time_zone, lang),
    baru: isUnread(item, data.seenAt),
  }));
}

/**
 * `data`: pengumuman yang sudah dimuat pemanggil (Dashboard saya memuatnya
 * sekali untuk lonceng dan daftarnya). `unread` dipaksa nol oleh pemanggil
 * yang sedang menampilkan semua pengumuman.
 */
export async function muatNavPeserta(
  event: Pick<EventRow, "id" | "slug" | "time_zone">,
  sesi: MemberSession,
  lang: LandingLang,
  opsi: { data?: MemberAnnouncements; unread?: number } = {},
): Promise<NavPeserta> {
  const data = opsi.data ?? (await loadMemberAnnouncements(event.id, sesi));
  const slug = encodeURIComponent(event.slug);
  return {
    slug: event.slug,
    dashboardHref: `/e/${slug}/peserta`,
    keluarAction: `/e/${slug}/api/peserta/keluar`,
    inisial: inisialNama(sesi.name),
    lonceng: data.ready ? { items: itemLonceng(data, event, lang), unread: opsi.unread ?? data.unread } : null,
  };
}
