import { bacaToken, buatToken, bukaOtomatis, type Jejak, type JenisJejak } from "@/lib/email/jejak";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Sisi server jejak email (lihat jejak.ts dan migrasi 202611070030).

const TABEL: Record<JenisJejak, string> = { a: "announcement_email_recipients", b: "message_blast_recipients" };

function rahasia(): string | null {
  const nilai = process.env.SESSION_SECRET;
  return nilai && nilai.length >= 16 ? nilai : null;
}

export function tokenJejak(jenis: JenisJejak, id: number): string | null {
  const kunci = rahasia();
  return kunci ? buatToken(kunci, jenis, id) : null;
}

export function bacaJejak(token: string | null | undefined): Jejak | null {
  const kunci = rahasia();
  return kunci ? bacaToken(kunci, token) : null;
}

/** Gambar 1x1 untuk satu penerima. */
export function urlBuka(origin: string, slug: string, token: string) {
  return `${origin}/e/${encodeURIComponent(slug)}/api/jejak/buka/${token}`;
}

/** Halaman baca pengumuman dari email (tanpa masuk portal). */
export function urlBaca(origin: string, slug: string, token: string) {
  return `${origin}/e/${encodeURIComponent(slug)}/peserta/kabar?t=${encodeURIComponent(token)}`;
}

/**
 * Sakelar Messages > Email tracking untuk acara ini. false bila mati, bila
 * migrasi 202611070030 belum dijalankan, atau bila tidak terbaca: tanpa
 * kepastian, email dikirim seperti sebelumnya (tanpa jejak).
 */
export async function jejakMenyala(eventId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServiceClient().from("event_settings").select("email_tracking").eq("event_id", eventId).maybeSingle();
  return !error && (data as { email_tracking?: boolean } | null)?.email_tracking === true;
}

/** Migrasi 202611070030 sudah dijalankan? */
export async function jejakSiap(): Promise<boolean> {
  const { error } = await getSupabaseServiceClient().from("announcement_email_recipients").select("id").limit(0);
  return !error;
}

/**
 * Catat gambar 1x1 dimuat. Hanya pemuatan pertama per jenis yang tercatat
 * (kolomnya diisi bila masih kosong). Proxy Apple Mail masuk opened_auto_at.
 */
export async function catatBuka(jejak: Jejak, userAgent: string | null) {
  const kolom = bukaOtomatis(userAgent) ? "opened_auto_at" : "opened_at";
  await getSupabaseServiceClient()
    .from(TABEL[jejak.jenis])
    .update({ [kolom]: new Date().toISOString() } as never)
    .eq("id", jejak.id)
    .is(kolom, null);
}

/**
 * Catat klik. Klik berarti email juga dibuka, walau gambarnya diblokir
 * (Outlook memblokir gambar secara bawaan), jadi opened_at ikut diisi.
 */
export async function catatKlik(jejak: Jejak) {
  const client = getSupabaseServiceClient();
  const kini = new Date().toISOString();
  await client.from(TABEL[jejak.jenis]).update({ clicked_at: kini } as never).eq("id", jejak.id).is("clicked_at", null);
  await client.from(TABEL[jejak.jenis]).update({ opened_at: kini } as never).eq("id", jejak.id).is("opened_at", null);
}
