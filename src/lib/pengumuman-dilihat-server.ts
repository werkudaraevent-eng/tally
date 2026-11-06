import { semuaBaris } from "@/lib/logistik/server";
import { muatPesertaAktif, pesertaCocok, type BarisPeserta, type Penerima } from "@/lib/pengumuman-penerima-server";
import { ringkasDilihat, statusDilihat, type AkunDilihat, type RingkasDilihat, type StatusDilihat } from "@/lib/pengumuman-dilihat";
import { bacaSyaratPengumuman } from "@/lib/sasaran-pengumuman";
import type { EventRow } from "@/lib/domain";
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
};

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
): Promise<Map<string, { ringkas: RingkasDilihat; baris: BarisDilihat[] }> | null> {
  const [peserta, akun] = await Promise.all([muatPesertaAktif(event.id), muatAkun(event.id)]);
  if (!peserta || !akun) return null;
  const muatan: { peserta: BarisPeserta[] } = { peserta };
  const hasil = new Map<string, { ringkas: RingkasDilihat; baris: BarisDilihat[] }>();
  for (const item of items) {
    const penerima = penerimaDari(item);
    if (!penerima) continue;
    const cocok = await pesertaCocok(event, penerima, muatan);
    if (!cocok) return null;
    const status = cocok.cocok.map((orang) => statusDilihat(item.published_at, akun.get(orang.id)));
    hasil.set(item.id, {
      ringkas: ringkasDilihat(status),
      baris: denganBaris
        ? cocok.cocok.map((orang, i) => ({
            participant_id: orang.id,
            name: orang.name,
            company: orang.company,
            status: status[i],
            last_opened: akun.get(orang.id)?.last_opened ?? null,
          }))
        : [],
    });
  }
  return hasil;
}
