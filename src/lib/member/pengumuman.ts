import type { EventRow } from "@/lib/domain";
import { bagianTampil } from "@/lib/logistik/bagian-tampil";
import { memberConfig, type MemberSession } from "@/lib/member/account";
import { muatDataSasaran } from "@/lib/sasaran-blok-server";
import { pengumumanUntuk, syaratKolom, type AudiensPengumuman } from "@/lib/sasaran-pengumuman";
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

export type AnnouncementAudience = AudiensPengumuman;

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
/** Kolom penerima dari migrasi 202610300004 (Send to per syarat atau per peserta). */
const KOLOM_PENERIMA = "audience_rules,audience_ids";

/**
 * Pengumuman bersasaran yang dibaca sebelum disaring. Jauh di atas jumlah
 * pengumuman satu acara sejauh ini; pengumuman untuk orang lain tidak boleh
 * mendorong keluar pengumuman milik peserta ini dari `limit`.
 */
const BACA_MAX = 200;

type AcaraPengumuman = Pick<EventRow, "id" | "registration_form_config" | "time_zone" | "landing_config">;
type BarisPengumuman = Announcement & { audience_rules?: unknown; audience_ids?: unknown };

/** Pengumuman yang boleh dilihat peserta ini, disematkan dulu lalu yang terbaru. */
export async function loadMemberAnnouncements(
  event: AcaraPengumuman,
  sesi: Pick<MemberSession, "accountId" | "status" | "participant">,
  limit = 20,
): Promise<MemberAnnouncements> {
  const client = getSupabaseServiceClient();
  // "disetujui" = akun yang sudah tertaut ke peserta, sama dengan status
  // "approved" di getMemberSession. Yang belum disetujui hanya membaca "semua".
  const disetujui = sesi.status === "approved";
  const kueri = (kolom: string) => {
    let query = client
      .from("event_announcements")
      .select(kolom)
      .eq("event_id", event.id)
      .lte("published_at", new Date().toISOString())
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(disetujui ? BACA_MAX : limit);
    if (!disetujui) query = query.eq("audience", "semua");
    return query;
  };

  const [hasil, akun] = await Promise.all([
    kueri(`${ANNOUNCEMENT_COLUMNS},${KOLOM_PENERIMA}`),
    client.from("participant_accounts").select("announcements_seen_at").eq("id", sesi.accountId).maybeSingle(),
  ]);
  let { data, error } = hasil;
  // Sebelum migrasi 202610300004 kolom penerima belum ada: baca seperti dulu.
  if (error && (error.code === "42703" || error.code === "PGRST204")) ({ data, error } = await kueri(ANNOUNCEMENT_COLUMNS));
  if (error || !data) return { ready: false, items: [], unread: 0, seenAt: null };

  const items = (await saringUntukPeserta(event, sesi, data as unknown as BarisPengumuman[])).slice(0, limit);
  const seenAt = (akun.data as { announcements_seen_at?: string | null } | null)?.announcements_seen_at ?? null;
  const unread = items.filter((item) => isUnread(item, seenAt)).length;
  return { ready: true, items, unread, seenAt };
}

/**
 * Hanya pengumuman untuk peserta ini (sasaran-pengumuman.ts), tanpa kolom
 * penerimanya. Jawaban dan hotel peserta dimuat sekali, hanya bila ada
 * pengumuman bersyarat kolom. Hotel hanya terbaca bila kamar ditampilkan ke
 * peserta, seperti Who sees it di Agenda dan Rute.
 */
async function saringUntukPeserta(
  event: AcaraPengumuman,
  sesi: Pick<MemberSession, "status" | "participant">,
  baris: BarisPengumuman[],
): Promise<Announcement[]> {
  const peserta = sesi.participant;
  const kolom = syaratKolom(baris);
  const data = peserta && sesi.status === "approved" && kolom.length > 0
    ? await muatDataSasaran(event, peserta.id, kolom, bagianTampil(memberConfig(event), "rooms")).catch(() => null)
    : null;
  const penonton = { disetujui: sesi.status === "approved", participantId: peserta?.id ?? null, company: peserta?.company ?? null, data };
  return baris
    .filter((item) => pengumumanUntuk(item, penonton))
    .map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      link_url: item.link_url,
      link_label: item.link_label,
      audience: item.audience,
      pinned: item.pinned,
      published_at: item.published_at,
    }));
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
