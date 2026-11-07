import { semuaBaris } from "@/lib/logistik/server";
import { muatPesertaAktif, pesertaCocok, type BarisPeserta, type Penerima } from "@/lib/pengumuman-penerima-server";
import { ringkasDilihat, statusDilihat, type AkunDilihat, type RingkasDilihat, type StatusDilihat } from "@/lib/pengumuman-dilihat";
import { bacaSyaratPengumuman } from "@/lib/sasaran-pengumuman";
import type { EventRow } from "@/lib/domain";
import { ringkasEmail, statusEmail, statusTerkuat, type RingkasEmail, type StatusEmail } from "@/lib/email/jejak-status";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Laporan Seen per pengumuman (lihat pengumuman-dilihat.ts). Peserta, akun
// dan stay hotel dibaca sekali untuk semua pengumuman yang diminta, lalu
// dicocokkan dengan aturan Send to yang sama dengan portal dan email.

type AcaraDilihat = Pick<EventRow, "id" | "registration_form_config" | "landing_config"> & { time_zone?: unknown };

export type PengumumanDilihat = {
  id: string;
  published_at: string;
  audience: string;
  audience_rules?: unknown;
  audience_ids?: unknown;
  audience_any?: unknown;
};

export type BarisDilihat = {
  participant_id: string;
  name: string;
  company: string | null;
  status: StatusDilihat;
  /** Terakhir membuka portal (masuk atau sesi), null bila belum pernah masuk. */
  last_opened: string | null;
  /** Email tracking untuk kiriman ini (published_at yang sama); null = tidak ada email terlacak. */
  email: StatusEmail | null;
};

type BarisEmail = { announcement_id: string; participant_id: string | null; published_at: string; clicked_at: string | null; opened_at: string | null; opened_auto_at: string | null };

/**
 * Email terlacak (migrasi 202611070030) untuk pengumuman yang diminta, per
 * pengumuman lalu per peserta, hanya untuk kiriman yang berlaku sekarang
 * (published_at sama; Notify again memulai hitungan baru). Kosong bila
 * tabelnya belum ada atau tidak terbaca: laporan Seen tetap jalan tanpanya.
 */
async function muatEmail(eventId: string, items: PengumumanDilihat[]) {
  const hasil = new Map<string, { ringkas: RingkasEmail; per: Map<string, StatusEmail> }>();
  if (items.length === 0) return hasil;
  const db = getSupabaseServiceClient();
  const terbit = new Map(items.map((item) => [item.id, Date.parse(item.published_at)]));
  const baris: BarisEmail[] = [];
  for (let i = 0; i < items.length; i += 100) {
    const potongan = items.slice(i, i + 100).map((item) => item.id);
    const isi = await semuaBaris<BarisEmail>(() =>
      db
        .from("announcement_email_recipients")
        .select("announcement_id,participant_id,published_at,clicked_at,opened_at,opened_auto_at")
        .eq("event_id", eventId)
        .in("announcement_id", potongan)
        .order("id"));
    if (!isi) return hasil;
    baris.push(...isi);
  }
  const status = new Map<string, StatusEmail[]>();
  for (const b of baris) {
    if (Date.parse(b.published_at) !== terbit.get(b.announcement_id)) continue;
    const s = statusEmail(b);
    status.set(b.announcement_id, [...(status.get(b.announcement_id) ?? []), s]);
    const entri = hasil.get(b.announcement_id) ?? { ringkas: ringkasEmail([]), per: new Map<string, StatusEmail>() };
    if (b.participant_id) entri.per.set(b.participant_id, statusTerkuat(entri.per.get(b.participant_id) ?? null, s));
    hasil.set(b.announcement_id, entri);
  }
  for (const [id, daftar] of status) hasil.get(id)!.ringkas = ringkasEmail(daftar);
  return hasil;
}

type BarisAkun = AkunDilihat & { participant_id: string; participant_sessions: Array<{ last_seen_at: string | null }> | null };
type Akun = AkunDilihat & { last_opened: string | null };

/** Penerima tersimpan dalam bentuk yang dipahami pesertaCocok. Null = audience tidak dikenal. */
export function penerimaDari(item: PengumumanDilihat): Penerima | null {
  const audience = item.audience;
  if (audience !== "semua" && audience !== "disetujui" && audience !== "syarat" && audience !== "pilih") return null;
  return {
    audience,
    audience_rules: audience === "syarat" ? bacaSyaratPengumuman(item.audience_rules) : null,
    audience_ids: audience === "pilih" && Array.isArray(item.audience_ids) ? (item.audience_ids as string[]) : null,
    audience_any: audience === "syarat" && item.audience_any === true,
  };
}

function terbaru(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

async function muatAkun(eventId: string): Promise<Map<string, Akun> | null> {
  const db = getSupabaseServiceClient();
  const baris = await semuaBaris<BarisAkun>(() =>
    db
      .from("participant_accounts")
      .select("participant_id,last_login_at,announcements_seen_at,participant_sessions(last_seen_at)")
      .eq("event_id", eventId)
      .not("participant_id", "is", null)
      .order("id"));
  if (!baris) return null;
  const peta = new Map<string, Akun>();
  for (const akun of baris) {
    let buka = akun.last_login_at;
    for (const sesi of akun.participant_sessions ?? []) buka = terbaru(buka, sesi.last_seen_at);
    // Satu peserta satu akun; bila suatu saat tidak, stempel terbaru menang.
    const ada = peta.get(akun.participant_id);
    peta.set(akun.participant_id, {
      last_login_at: terbaru(ada?.last_login_at ?? null, akun.last_login_at),
      announcements_seen_at: terbaru(ada?.announcements_seen_at ?? null, akun.announcements_seen_at),
      last_opened: terbaru(ada?.last_opened ?? null, buka),
    });
  }
  return peta;
}

/**
 * Ringkasan Seen untuk tiap pengumuman, dan baris per peserta bila `denganBaris`.
 * Null bila data tidak bisa dibaca. Pengumuman dengan audience tidak dikenal
 * dilewati.
 */
export async function laporanDilihat(
  event: AcaraDilihat,
  items: PengumumanDilihat[],
  denganBaris: boolean,
): Promise<Map<string, { ringkas: RingkasDilihat; email: RingkasEmail | null; baris: BarisDilihat[] }> | null> {
  const [peserta, akun, email] = await Promise.all([muatPesertaAktif(event.id), muatAkun(event.id), muatEmail(event.id, items)]);
  if (!peserta || !akun) return null;
  const muatan: { peserta: BarisPeserta[] } = { peserta };
  const hasil = new Map<string, { ringkas: RingkasDilihat; email: RingkasEmail | null; baris: BarisDilihat[] }>();
  for (const item of items) {
    const penerima = penerimaDari(item);
    if (!penerima) continue;
    const cocok = await pesertaCocok(event, penerima, muatan);
    if (!cocok) return null;
    const lewatEmail = email.get(item.id);
    // Menekan tombol di email membuka pengumuman itu: ikut terhitung Seen.
    const status = cocok.cocok.map((orang) =>
      lewatEmail?.per.get(orang.id) === "diklik" ? "dilihat" : statusDilihat(item.published_at, akun.get(orang.id)),
    );
    hasil.set(item.id, {
      ringkas: ringkasDilihat(status),
      email: lewatEmail?.ringkas ?? null,
      baris: denganBaris
        ? cocok.cocok.map((orang, i) => ({
            participant_id: orang.id,
            name: orang.name,
            company: orang.company,
            status: status[i],
            last_opened: akun.get(orang.id)?.last_opened ?? null,
            email: lewatEmail?.per.get(orang.id) ?? null,
          }))
        : [],
    });
  }
  return hasil;
}
