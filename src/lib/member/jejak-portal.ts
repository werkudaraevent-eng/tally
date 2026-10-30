import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Jejak portal peserta untuk panitia: kapan pertama kali masuk dan kapan
 * terakhir membuka portal. Dipakai kolom "Portal" di daftar peserta dan kartu
 * Dashboard, supaya panitia bisa mengejar yang belum pernah masuk sebelum acara.
 *
 * "Masuk" adalah `participant_accounts.last_login_at`, ditulis setiap kali
 * peserta masuk. Sejak sesi diperpanjang sampai acara selesai (#335), peserta
 * jarang masuk ulang, jadi kapan terakhir membuka portal dibaca dari
 * `participant_sessions.last_seen_at` (diperbarui getMemberSession paling
 * sering sekali per jam). Yang tampil adalah yang paling baru dari keduanya.
 *
 * Hanya stempel waktu, bukan halaman yang dibuka: panitia butuh "siapa yang
 * belum", bukan jejak perilaku.
 */

export type JejakPortal = {
  /** Masuk terakhir (email + kata sandi, kode email, tautan, atau dua kolom). */
  masuk: string;
  /** Terakhir membuka portal; tidak pernah lebih lama dari `masuk`. */
  buka: string;
};

const HALAMAN = 1000;
/** Id per permintaan saat membaca satu halaman tabel: 100 uuid tetap jauh di bawah batas URL. */
const POTONG = 100;

type BarisAkun = { participant_id: string; last_login_at: string; participant_sessions: Array<{ last_seen_at: string | null }> | null };

function tambah(peta: Map<string, JejakPortal>, baris: BarisAkun) {
  let buka = baris.last_login_at;
  for (const sesi of baris.participant_sessions ?? []) {
    if (sesi.last_seen_at && Date.parse(sesi.last_seen_at) > Date.parse(buka)) buka = sesi.last_seen_at;
  }
  // Satu peserta satu akun (participant_accounts_participant_unique); yang
  // terbaru menang bila suatu saat tidak lagi begitu.
  const ada = peta.get(baris.participant_id);
  if (!ada || Date.parse(buka) > Date.parse(ada.buka)) peta.set(baris.participant_id, { masuk: baris.last_login_at, buka });
}

/**
 * Jejak portal per participant_id. Tanpa `ids`: seluruh acara (saringan,
 * urutan, hitungan), dibaca per 1000 akun. Peserta yang tidak ada di peta
 * belum pernah masuk.
 */
export async function jejakPortal(eventId: string, ids?: string[]): Promise<Map<string, JejakPortal>> {
  const client = getSupabaseServiceClient();
  const peta = new Map<string, JejakPortal>();
  const dasar = () => client
    .from("participant_accounts")
    .select("participant_id,last_login_at,participant_sessions(last_seen_at)")
    .eq("event_id", eventId)
    .not("participant_id", "is", null)
    .not("last_login_at", "is", null);

  if (ids) {
    for (let i = 0; i < ids.length; i += POTONG) {
      const { data, error } = await dasar().in("participant_id", ids.slice(i, i + POTONG));
      if (error) throw new Error(error.message);
      for (const baris of (data ?? []) as unknown as BarisAkun[]) tambah(peta, baris);
    }
    return peta;
  }
  for (let dari = 0; ; dari += HALAMAN) {
    const { data, error } = await dasar().order("id").range(dari, dari + HALAMAN - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as BarisAkun[];
    for (const baris of rows) tambah(peta, baris);
    if (rows.length < HALAMAN) return peta;
  }
}

/** Area peserta dipakai acara ini: tanpa itu kolom Portal tidak berarti apa-apa. */
export function pakaiPortal(event: { landing_config: unknown }): boolean {
  return (event.landing_config as { member?: { enabled?: boolean } } | null)?.member?.enabled === true;
}

/** Cara masuk "dua kolom" tidak butuh email; cara lain tidak bisa tanpa email. */
export function portalTanpaEmail(event: { landing_config: unknown }): boolean {
  return (event.landing_config as { member?: { sign_in?: string } } | null)?.member?.sign_in === "fields";
}
