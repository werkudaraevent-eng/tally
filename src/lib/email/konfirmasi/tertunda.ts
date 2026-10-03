import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Pendaftar disetujui yang belum pernah menerima email ber-QR: punya email,
 * email_sent_at kosong, pesertanya masih ada, dan alamatnya tidak pernah
 * memantul. Dipakai bilah "N pendaftar belum pernah menerima email ini".
 */

export type Tertunda = { id: string; name: string; email: string; company: string | null; access_token: string | null; qr_code: string };

type Baris = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  access_token: string | null;
  participant: { qr_code: string; email_invalid_at?: string | null } | null;
};

async function baris(eventId: string): Promise<Tertunda[]> {
  const client = getSupabaseServiceClient();
  const pilih = (kolomPeserta: string) =>
    client
      .from("event_registrations")
      .select(`id,name,email,company,access_token,participant:participants(${kolomPeserta})`)
      .eq("event_id", eventId)
      .eq("status", "approved")
      .is("email_sent_at", null)
      .not("email", "is", null)
      .not("participant_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1000);
  // email_invalid_at datang dari migrasi Pesan peserta (202610030003); tanpa
  // kolom itu daftar tetap bisa dibuat, hanya tanpa penyaring alamat memantul.
  let { data, error } = await pilih("qr_code,email_invalid_at");
  if (error) ({ data, error } = await pilih("qr_code"));
  if (error) return [];
  return ((data ?? []) as unknown as Baris[])
    .filter((row) => row.email && row.participant?.qr_code && !row.participant.email_invalid_at)
    .map((row) => ({ id: row.id, name: row.name, email: row.email as string, company: row.company, access_token: row.access_token, qr_code: row.participant!.qr_code }));
}

export async function hitungBelumTerima(eventId: string): Promise<number> {
  return (await baris(eventId)).length;
}

export async function daftarBelumTerima(eventId: string): Promise<Tertunda[]> {
  return baris(eventId);
}
