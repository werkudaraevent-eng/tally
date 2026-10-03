import { allowedByList, messagingAllowlist, normalizeAddress } from "@/lib/pesan/alamat";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Pendaftar disetujui yang belum pernah menerima email ber-QR: punya email,
 * email_sent_at kosong, pesertanya masih ada, dan alamatnya tidak pernah
 * memantul. Dipakai bilah "N pendaftar belum pernah menerima email ini" dan
 * "Kirim ke mereka…".
 */

export type Tertunda = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  access_token: string | null;
  qr_code: string;
  email_attempts: number;
  /** Klaim putaran "Kirim ke mereka…" lain yang masih berlaku; baris ini dilewati sampai lewat. */
  email_claimed_until: string | null;
};

type Baris = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  access_token: string | null;
  email_attempts?: number | null;
  email_claimed_until?: string | null;
  participant: { qr_code: string; email_invalid_at?: string | null } | null;
};

export async function daftarBelumTerima(eventId: string): Promise<Tertunda[]> {
  const client = getSupabaseServiceClient();
  const pilih = (kolom: string, kolomPeserta: string) =>
    client
      .from("event_registrations")
      .select(`id,name,email,company,access_token${kolom},participant:participants(${kolomPeserta})`)
      .eq("event_id", eventId)
      .eq("status", "approved")
      .is("email_sent_at", null)
      .not("email", "is", null)
      .not("participant_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1000);
  // Kolom klaim datang dari migrasi 202610030006 dan email_invalid_at dari
  // Pesan peserta (202610030003). Tanpa keduanya daftar tetap bisa dihitung;
  // pengirimannya sendiri menolak sampai migrasi klaim dijalankan.
  let { data, error } = await pilih(",email_attempts,email_claimed_until", "qr_code,email_invalid_at");
  if (error) ({ data, error } = await pilih(",email_attempts", "qr_code,email_invalid_at"));
  if (error) ({ data, error } = await pilih("", "qr_code"));
  if (error) return [];
  return ((data ?? []) as unknown as Baris[])
    .filter((row) => row.email && row.participant?.qr_code && !row.participant.email_invalid_at)
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email as string,
      company: row.company,
      access_token: row.access_token,
      qr_code: row.participant!.qr_code,
      email_attempts: row.email_attempts ?? 0,
      email_claimed_until: row.email_claimed_until ?? null,
    }));
}

/**
 * Yang benar-benar akan dikirimi dari sini. Di luar produksi (preview memakai
 * database produksi) hanya alamat di MESSAGING_ALLOWLIST, aturan yang sama
 * dengan Kiriman, Pengumuman, dan Kirim tes.
 */
export function bolehDikirim(daftar: Tertunda[]): Tertunda[] {
  const list = messagingAllowlist();
  return daftar.filter((row) => {
    const alamat = normalizeAddress(row.email);
    return alamat !== null && allowedByList(alamat, list);
  });
}

export async function hitungBelumTerima(eventId: string): Promise<{ semua: number; dikirim: number; daftarUji: "off" | "list" | "blocked" }> {
  const daftar = await daftarBelumTerima(eventId);
  return { semua: daftar.length, dikirim: bolehDikirim(daftar).length, daftarUji: messagingAllowlist().mode };
}
