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

/** Sesi milik acara ini yang dibuka dan menjadi meja AMBIL bagasi, atau null. */
export async function sesiAmbilBagasi(eventId: string, sessionId: number): Promise<{ id: number; name: string } | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("attendance_sessions")
    .select("*")
    .eq("event_id", eventId)
    .eq("id", sessionId)
    .maybeSingle();
  const sesi = data as { id: number; name: string; is_active: boolean; luggage_pickup?: boolean } | null;
  if (error || !sesi || !sesi.is_active || sesi.luggage_pickup !== true) return null;
  return { id: sesi.id, name: sesi.name };
}

/** Satu catatan titip seperti yang dilihat petugas meja ambil. */
export type TitipanBagasi = {
  id: number;
  session_id: number;
  /** Nama meja titipnya ("Titip bagasi Gambir"). */
  session_name: string;
  bag_count: number;
  photo_url: string | null;
  recorded_at: string;
  /** Petugas yang mencatat di meja titip. */
  by: string | null;
  /** Null = masih dititipkan. */
  handed_over_at: string | null;
  handed_over_by: string | null;
  /** Diserahkan oleh petugas yang sedang membuka layar ini (boleh Undo). */
  mine: boolean;
};

/**
 * Semua catatan titip satu peserta di acara ini, dari meja titip MANA PUN,
 * untuk meja ambil. Penyambungnya pesertanya, bukan sesinya: empat batch
 * dengan meja titip berbeda tetap terbaca di satu meja ambil tanpa setelan
 * pasangan sesi. Saklar meja titip yang sudah dimatikan tidak menyembunyikan
 * bagasinya di sini: koper yang masih di rak tetap harus bisa diserahkan.
 */
export async function titipanPeserta(eventId: string, participantId: string, petugasId: string): Promise<TitipanBagasi[]> {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("luggage_drops")
    .select(`id,${KOLOM},handed_over_at,handed_over_by`)
    .eq("event_id", eventId)
    .eq("participant_id", participantId)
    .order("recorded_at", { ascending: true });
  if (error) throw new Error("LUGGAGE_READ");
  const baris = (data ?? []) as Array<BarisBagasi & { id: number; handed_over_at: string | null; handed_over_by: string | null }>;
  if (baris.length === 0) return [];
  const idPetugas = [...new Set(baris.flatMap((item) => [item.recorded_by, item.handed_over_by]).filter((id): id is string => Boolean(id)))];
  const [sesi, petugas] = await Promise.all([
    db.from("attendance_sessions").select("id,name").eq("event_id", eventId).in("id", [...new Set(baris.map((item) => item.session_id))]),
    idPetugas.length > 0 ? db.from("users").select("id,username").in("id", idPetugas) : Promise.resolve({ data: [] }),
  ]);
  const namaSesi = new Map(((sesi.data ?? []) as Array<{ id: number; name: string }>).map((item) => [item.id, item.name]));
  const namaPetugas = new Map(((petugas.data ?? []) as Array<{ id: string; username: string }>).map((item) => [item.id, item.username]));
  return Promise.all(
    baris.map(async (item) => ({
      id: item.id,
      session_id: item.session_id,
      session_name: namaSesi.get(item.session_id) ?? "",
      bag_count: item.bag_count,
      photo_url: await tautan(item.photo_path, UMUR_TAUTAN_STAF),
      recorded_at: item.recorded_at,
      by: item.recorded_by ? namaPetugas.get(item.recorded_by) ?? null : null,
      handed_over_at: item.handed_over_at,
      handed_over_by: item.handed_over_by ? namaPetugas.get(item.handed_over_by) ?? null : null,
      mine: item.handed_over_by === petugasId,
    })),
  );
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
export async function bagasiPeserta(
  eventId: string,
  participantId: string,
  denganFoto = true,
): Promise<(CatatanBagasi & { session_name: string; handed_over_at: string | null })[]> {
  const db = getSupabaseServiceClient();
  // select *: handed_over_at baru ada setelah migrasi 202610240001.
  const { data, error } = await db
    .from("luggage_drops")
    .select("*")
    .eq("event_id", eventId)
    .eq("participant_id", participantId)
    .order("recorded_at", { ascending: true });
  if (error || !data || data.length === 0) return [];
  const baris = data as Array<BarisBagasi & { handed_over_at?: string | null }>;
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
      handed_over_at: item.handed_over_at ?? null,
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

/**
 * Kemajuan meja ambil untuk detail sesi di admin, se-ACARA (semua meja titip):
 * berapa orang dan koper sudah diserahkan, berapa masih di rak. Catatan "No
 * luggage" (0 koper) tidak dihitung. Orang dengan dua titipan terhitung
 * menunggu selama salah satunya belum diserahkan.
 */
export async function totalAmbilBagasi(eventId: string): Promise<{ handedPeople: number; handedBags: number; waitingPeople: number; waitingBags: number }> {
  const db = getSupabaseServiceClient();
  const menunggu = new Set<string>();
  const sudah = new Set<string>();
  let handedBags = 0;
  let waitingBags = 0;
  for (let dari = 0; dari < 20000; dari += 1000) {
    const { data, error } = await db
      .from("luggage_drops")
      .select("id,participant_id,bag_count,handed_over_at")
      .eq("event_id", eventId)
      .gt("bag_count", 0)
      .order("id", { ascending: true })
      .range(dari, dari + 999);
    if (error || !data) break;
    for (const baris of data as Array<{ participant_id: string; bag_count: number; handed_over_at: string | null }>) {
      if (baris.handed_over_at) {
        handedBags += baris.bag_count;
        sudah.add(baris.participant_id);
      } else {
        waitingBags += baris.bag_count;
        menunggu.add(baris.participant_id);
      }
    }
    if (data.length < 1000) break;
  }
  for (const id of menunggu) sudah.delete(id);
  return { handedPeople: sudah.size, handedBags, waitingPeople: menunggu.size, waitingBags };
}
