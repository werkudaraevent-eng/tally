import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Bagasi di meja checkpoint (Check-in > Sessions > Record luggage).
 *
 * Satu baris per peserta per sesi: jumlah bagasi (bukti utama) dan satu foto
 * opsional (bukti pendukung). Fotonya di bucket PRIVAT `luggage-photos`; yang
 * keluar dari server hanya signed URL berumur pendek, dibuat saat dibaca.
 *
 * Yang boleh melihat foto: admin dan scanner acara itu (layar pemindai, detail
 * sesi), dan peserta untuk fotonya sendiri (portal). Tidak ada URL permanen
 * yang bisa tertempel di grup panitia dan terus bekerja.
 */

export const BUCKET_BAGASI = "luggage-photos";

/** Umur tautan foto. Layar pemindai memuatnya per tamu, jadi lima menit cukup. */
export const UMUR_TAUTAN_STAF = 300;
/** Portal dirender sekali per kunjungan; satu jam supaya halaman yang dibiarkan terbuka tetap menampilkan fotonya. */
export const UMUR_TAUTAN_PESERTA = 3600;

/** Batas jumlah, sama dengan CHECK di database. */
export const BAGASI_MAKS = 30;

/**
 * Path foto di bucket: rata per acara, supaya penghapus foto cukup membaca satu
 * folder per acara (migrasi 202610230004). Nama berkas membawa sesi dan
 * peserta untuk penelusuran manual; baris `luggage_drops` tetap sumber
 * kebenarannya.
 */
export function pathFotoBagasi(eventId: string, sessionId: number, participantId: string, ext: string) {
  return `${eventId}/${sessionId}-${participantId.toLowerCase()}-${crypto.randomUUID()}.${ext}`;
}

/** Catatan bagasi seperti yang dikirim ke layar pemindai dan portal. */
export type CatatanBagasi = {
  session_id: number;
  bag_count: number;
  /** Signed URL, atau null bila belum ada foto (atau sudah dihapus setelah acara). */
  photo_url: string | null;
  recorded_at: string;
  updated_at: string;
  /** Username petugas terakhir yang menyimpan; hanya untuk staf. */
  by?: string | null;
};

type BarisBagasi = {
  session_id: number;
  bag_count: number;
  photo_path: string | null;
  recorded_at: string;
  updated_at: string;
  recorded_by: string | null;
  updated_by: string | null;
};

const KOLOM = "session_id,bag_count,photo_path,recorded_at,updated_at,recorded_by,updated_by";

async function tautan(path: string | null, umur: number): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await getSupabaseServiceClient().storage.from(BUCKET_BAGASI).createSignedUrl(path, umur);
  return error || !data ? null : data.signedUrl;
}

/** Sesi milik acara ini yang dibuka dan mencatat bagasi, atau null. */
export async function sesiBagasi(eventId: string, sessionId: number): Promise<{ id: number; name: string } | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_sessions")
    .select("id,name,is_active,records_luggage")
    .eq("event_id", eventId)
    .eq("id", sessionId)
    .maybeSingle();
  const sesi = data as { id: number; name: string; is_active: boolean; records_luggage?: boolean } | null;
  if (error || !sesi || !sesi.is_active || sesi.records_luggage !== true) return null;
  return { id: sesi.id, name: sesi.name };
}

/** Catatan satu peserta di satu sesi, untuk layar pemindai (dengan nama petugas). */
export async function catatanBagasiStaf(eventId: string, sessionId: number, participantId: string): Promise<CatatanBagasi | null> {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("luggage_drops")
    .select(KOLOM)
    .eq("event_id", eventId)
    .eq("session_id", sessionId)
    .eq("participant_id", participantId)
    .maybeSingle();
  if (error) throw new Error("LUGGAGE_READ");
  const baris = data as BarisBagasi | null;
  if (!baris) return null;
  const petugasId = baris.updated_by ?? baris.recorded_by;
  const [url, petugas] = await Promise.all([
    tautan(baris.photo_path, UMUR_TAUTAN_STAF),
    petugasId ? db.from("users").select("username").eq("id", petugasId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    session_id: baris.session_id,
    bag_count: baris.bag_count,
    photo_url: url,
    recorded_at: baris.recorded_at,
    updated_at: baris.updated_at,
    by: (petugas.data as { username?: string } | null)?.username ?? null,
  };
}

/**
 * Catatan bagasi milik satu peserta di semua sesi, untuk portal. Hanya sesi
 * yang masih mencatat bagasi: admin yang mematikan saklarnya juga menyembunyikan
 * kartunya. Galat ditelan (kartu tidak tampil), karena portal tidak boleh gagal
 * dimuat hanya karena kartu pelengkap ini.
 */
export async function bagasiPeserta(eventId: string, participantId: string, denganFoto = true): Promise<(CatatanBagasi & { session_name: string })[]> {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("luggage_drops")
    .select(KOLOM)
    .eq("event_id", eventId)
    .eq("participant_id", participantId)
    .order("recorded_at", { ascending: true });
  if (error || !data || data.length === 0) return [];
  const baris = data as BarisBagasi[];
  const { data: sesi } = await db
    .from("attendance_sessions")
    .select("id,name,records_luggage")
    .eq("event_id", eventId)
    .in("id", baris.map((item) => item.session_id));
  const nama = new Map(
    ((sesi ?? []) as Array<{ id: number; name: string; records_luggage?: boolean }>)
      .filter((item) => item.records_luggage === true)
      .map((item) => [item.id, item.name]),
  );
  const tampil = baris.filter((item) => nama.has(item.session_id));
  return Promise.all(
    tampil.map(async (item) => ({
      session_id: item.session_id,
      session_name: nama.get(item.session_id) ?? "",
      bag_count: item.bag_count,
      // Tautan foto hanya dibuat untuk halaman yang menampilkannya (Perjalanan);
      // tab lain cukup tahu catatannya ada.
      photo_url: denganFoto ? await tautan(item.photo_path, UMUR_TAUTAN_PESERTA) : null,
      recorded_at: item.recorded_at,
      updated_at: item.updated_at,
    })),
  );
}

/** Jumlah bagasi dan orang per sesi, untuk detail sesi di admin (muat truk). */
export async function totalBagasiSesi(eventId: string): Promise<Map<number, { bags: number; people: number; photos: number }>> {
  const db = getSupabaseServiceClient();
  const total = new Map<number, { bags: number; people: number; photos: number }>();
  // Per 1000 baris: PostgREST memotong satu jawaban di 1000.
  for (let dari = 0; dari < 20000; dari += 1000) {
    const { data, error } = await db
      .from("luggage_drops")
      .select("id,session_id,bag_count,photo_path")
      .eq("event_id", eventId)
      .order("id", { ascending: true })
      .range(dari, dari + 999);
    if (error || !data) break;
    for (const baris of data as Array<{ session_id: number; bag_count: number; photo_path: string | null }>) {
      const lama = total.get(baris.session_id) ?? { bags: 0, people: 0, photos: 0 };
      total.set(baris.session_id, {
        bags: lama.bags + baris.bag_count,
        people: lama.people + (baris.bag_count > 0 ? 1 : 0),
        photos: lama.photos + (baris.photo_path ? 1 : 0),
      });
    }
    if (data.length < 1000) break;
  }
  return total;
}
