import { timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";
import { BUCKET_BAGASI } from "@/lib/bagasi/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Penghapus foto bagasi: pg_cron memanggilnya sekali sehari lewat pg_net
 * (migrasi 202610230004), hanya bila bucket masih menyimpan berkas dari acara
 * yang selesai lebih dari 30 hari lalu atau yang sudah dihapus.
 *
 * Foto bagasi bisa memperlihatkan barang pribadi dan kadang orangnya. Setelah
 * acara ia tidak lagi menjawab pertanyaan apa pun ("koper saya mana?" sudah
 * terjawab di hari kedatangan), jadi tidak disimpan lebih lama dari perlu (UU
 * PDP: data pribadi disimpan sesuai tujuannya). Jumlahnya tetap disimpan.
 *
 * Yang dibaca adalah BUCKET, bukan tabel: berkas yang tidak lagi ditunjuk baris
 * mana pun (foto lama yang gagal dihapus, peserta atau acara yang dihapus) ikut
 * terhapus. Tiap acara punya satu folder `<event_id>/`; folder milik acara yang
 * sudah lewat 30 hari atau tidak ada lagi dikosongkan seluruhnya.
 */

export const maxDuration = 60;

const HARI_SIMPAN = 30;
const PER_PUTARAN = 500;
const PER_HALAMAN = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Db = ReturnType<typeof getSupabaseServiceClient>;

function rahasiaCocok(request: Request) {
  const rahasia = process.env.CRON_SECRET;
  const diberikan = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!rahasia || diberikan.length !== rahasia.length) return false;
  return timingSafeEqual(Buffer.from(diberikan), Buffer.from(rahasia));
}

/** Semua path berkas di bawah `folder`, turun ke subfolder (bentuk path lama). */
async function isiFolder(db: Db, folder: string, batas: number): Promise<string[]> {
  const hasil: string[] = [];
  const antre = [folder];
  while (antre.length > 0 && hasil.length < batas) {
    const sekarang = antre.shift()!;
    for (let offset = 0; hasil.length < batas; offset += PER_HALAMAN) {
      const { data, error } = await db.storage.from(BUCKET_BAGASI).list(sekarang, { limit: PER_HALAMAN, offset });
      if (error) throw error;
      for (const item of data ?? []) {
        // Storage melaporkan folder sebagai entri tanpa id.
        if (item.id === null) antre.push(`${sekarang}/${item.name}`);
        else hasil.push(`${sekarang}/${item.name}`);
      }
      if ((data ?? []).length < PER_HALAMAN) break;
    }
  }
  return hasil.slice(0, batas);
}

export async function POST(request: Request) {
  if (!rahasiaCocok(request)) return apiError("FORBIDDEN", 403);

  const db = getSupabaseServiceClient();
  const batasTanggal = new Date(Date.now() - HARI_SIMPAN * 86_400_000).toISOString().slice(0, 10);

  try {
    // Folder teratas = satu per acara.
    const { data: akar, error: galatAkar } = await db.storage.from(BUCKET_BAGASI).list("", { limit: 1000 });
    if (galatAkar) throw galatAkar;
    const folder = (akar ?? []).filter((item) => item.id === null && UUID.test(item.name)).map((item) => item.name);
    if (folder.length === 0) return Response.json({ deleted: 0 });

    const masihDisimpan = new Set<string>();
    for (let awal = 0; awal < folder.length; awal += 100) {
      const { data, error } = await db.from("events").select("id,event_date,end_date").in("id", folder.slice(awal, awal + 100));
      if (error) throw error;
      for (const acara of (data ?? []) as Array<{ id: string; event_date: string | null; end_date: string | null }>) {
        const terakhir = acara.end_date ?? acara.event_date;
        // Sama dengan job SQL: acara tanpa tanggal tidak disentuh.
        if (!terakhir || terakhir >= batasTanggal) masihDisimpan.add(acara.id);
      }
    }

    let dihapus = 0;
    for (const eventId of folder) {
      if (dihapus >= PER_PUTARAN) break;
      if (masihDisimpan.has(eventId)) continue;
      const paths = await isiFolder(db, eventId, PER_PUTARAN - dihapus);
      if (paths.length === 0) continue;
      // Berkas dulu, baru barisnya: baris yang masih menunjuk berkas yang gagal
      // dihapus dicoba lagi besok; sebaliknya berkasnya yatim selamanya.
      const { error: galatHapus } = await db.storage.from(BUCKET_BAGASI).remove(paths);
      if (galatHapus) throw galatHapus;
      for (let awal = 0; awal < paths.length; awal += 100) {
        const { error } = await db
          .from("luggage_drops")
          .update({ photo_path: null } as never)
          .eq("event_id", eventId)
          .in("photo_path", paths.slice(awal, awal + 100));
        if (error) throw error;
      }
      dihapus += paths.length;
    }
    return Response.json({ deleted: dihapus });
  } catch {
    return apiError("INTERNAL_ERROR", 500);
  }
}
