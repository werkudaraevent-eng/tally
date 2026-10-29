import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { LandingLang } from "@/lib/landing-i18n";
import { barisTampil, catatanHadiah, kartuHadiahNyala, type BarisMenang, type HadiahPeserta, type SetelanHadiah } from "@/lib/member/hadiah";

/**
 * Hadiah undian yang dimenangkan peserta ini (lib/member/hadiah.ts), dibaca di
 * server untuk akun yang sedang masuk saja. Hanya nama, gambar, sponsor, dan
 * catatan hadiahnya: tidak ada nama pemenang lain atau data undian lain.
 * Gagal baca = tanpa kartu, bukan halaman galat: Beranda tetap terbuka.
 */
export async function loadHadiahPeserta(eventId: string, participantId: string | null | undefined, setelan: SetelanHadiah, lang: LandingLang): Promise<HadiahPeserta[]> {
  if (!participantId || !kartuHadiahNyala(setelan)) return [];
  const client = getSupabaseServiceClient();
  const { data: menang, error } = await client
    .from("undian_winners")
    .select("id,prize_id,status,rehearsal,decided_at,drawn_at")
    .eq("event_id", eventId)
    .eq("participant_id", participantId)
    .eq("status", "confirmed")
    .limit(50);
  if (error) return [];
  const baris = barisTampil((menang ?? []) as BarisMenang[]);
  if (!baris.length) return [];
  const { data: hadiah, error: galatHadiah } = await client
    .from("undian_prizes")
    .select("id,name,image_url,sponsor_name,claim_note")
    .eq("event_id", eventId)
    .in("id", [...new Set(baris.map((item) => item.prize_id))]);
  if (galatHadiah) return [];
  type Hadiah = { id: number; name: string; image_url: string | null; sponsor_name: string | null; claim_note: string | null };
  const peta = new Map(((hadiah ?? []) as Hadiah[]).map((item) => [item.id, item]));
  return baris.flatMap((item) => {
    const isi = peta.get(item.prize_id);
    if (!isi) return [];
    return [
      {
        id: item.id,
        nama: isi.name,
        gambar: isi.image_url?.trim() || null,
        sponsor: isi.sponsor_name?.trim() || null,
        catatan: catatanHadiah(isi.claim_note, setelan, lang),
        waktu: item.decided_at ?? item.drawn_at,
      },
    ];
  });
}
