import type { MemberSession } from "@/lib/member/account";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Pengumuman panitia untuk area peserta (migrasi 202610030002).
 *
 * Dibaca di dua tempat: lonceng di bilah atas halaman acara dan Dashboard saya.
 * Ditulis panitia di admin (menu Pengumuman, /api/admin/pengumuman).
 *
 * Semua pembacaan di sini TIDAK melempar. Sebelum migrasinya dijalankan tabel
 * itu belum ada; halaman acara tetap harus tampil, hanya tanpa pengumuman.
 */

export type AnnouncementAudience = "semua" | "disetujui";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  audience: AnnouncementAudience;
  pinned: boolean;
  published_at: string;
};

export type MemberAnnouncements = {
  /**
   * false: tabelnya belum ada (migrasi belum dijalankan) atau gagal dibaca.
   * Lonceng dan bagian Pengumuman lalu disembunyikan, bukan tampil kosong,
   * supaya peserta tidak mengira panitia memang belum mengumumkan apa pun.
   */
  ready: boolean;
  items: Announcement[];
  /** Jumlah yang terbit setelah peserta terakhir membuka lonceng/dashboard. */
  unread: number;
  /** Batas "belum dibaca" saat halaman dirender; null = belum pernah dibuka. */
  seenAt: string | null;
};

export const ANNOUNCEMENT_COLUMNS = "id,title,body,link_url,link_label,audience,pinned,published_at";

/** Pengumuman yang boleh dilihat peserta ini, disematkan dulu lalu yang terbaru. */
export async function loadMemberAnnouncements(
  eventId: string,
  sesi: Pick<MemberSession, "accountId" | "status">,
  limit = 20,
): Promise<MemberAnnouncements> {
  const client = getSupabaseServiceClient();
  let query = client
    .from("event_announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .eq("event_id", eventId)
    .lte("published_at", new Date().toISOString())
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(limit);
  // "disetujui" = akun yang sudah tertaut ke peserta, sama dengan status
  // "approved" di getMemberSession.
  if (sesi.status !== "approved") query = query.eq("audience", "semua");

  const [{ data, error }, akun] = await Promise.all([
    query,
    client.from("participant_accounts").select("announcements_seen_at").eq("id", sesi.accountId).maybeSingle(),
  ]);
  if (error || !data) return { ready: false, items: [], unread: 0, seenAt: null };

  const items = data as unknown as Announcement[];
  const seenAt = (akun.data as { announcements_seen_at?: string | null } | null)?.announcements_seen_at ?? null;
  const unread = items.filter((item) => isUnread(item, seenAt)).length;
  return { ready: true, items, unread, seenAt };
}

export function isUnread(item: Pick<Announcement, "published_at">, seenAt: string | null) {
  return !seenAt || new Date(item.published_at).getTime() > new Date(seenAt).getTime();
}

/**
 * Tandai semua pengumuman sampai saat ini sudah dibaca akun ini. false bila
 * gagal, termasuk sebelum migrasi (kolom `announcements_seen_at` belum ada).
 */
export async function markAnnouncementsSeen(accountId: string) {
  const { error } = await getSupabaseServiceClient()
    .from("participant_accounts")
    .update({ announcements_seen_at: new Date().toISOString() } as never)
    .eq("id", accountId);
  return !error;
}

/** Tabel belum ada: migrasi 202610030002 belum dijalankan. */
export function tabelBelumAda(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /event_announcements/.test(error.message ?? "");
}
