import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { tabelBelumAda } from "@/lib/member/pengumuman";
import { laporanDilihat, type PengumumanDilihat } from "@/lib/pengumuman-dilihat-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Laporan "Seen by participants" (lihat lib/pengumuman-dilihat.ts).
 *
 * GET tanpa `id`: ringkasan semua pengumuman acara, untuk chip "312 of 446
 * seen" di daftar. GET dengan `id`: ringkasan dan daftar peserta penerimanya
 * dengan status Seen / Not seen yet / Never signed in, untuk panel detail
 * dan dialog follow-up, ditambah ringkasan Email tracking bila ada
 * (migrasi 202611070030; tanpa itu email: null). Hanya membaca.
 */

export const maxDuration = 30;

const DASAR = "id,published_at,audience";
const belumAda = (galat: { code?: string } | null) => galat?.code === "42703" || galat?.code === "PGRST204";

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const event = auth.scope.event;
  const id = new URL(request.url).searchParams.get("id");
  if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const baca = (kolom: string) => {
    const kueri = client.from("event_announcements").select(kolom).eq("event_id", event.id);
    return id ? kueri.eq("id", id) : kueri.order("published_at", { ascending: false });
  };
  // Kolom penerima ditambahkan migrasi 202610300004 dan 202611040001: tanpa
  // kolom itu semua pengumuman memakai semua atau disetujui.
  let { data, error } = await baca(`${DASAR},audience_rules,audience_ids,audience_any`);
  if (belumAda(error)) ({ data, error } = await baca(`${DASAR},audience_rules,audience_ids`));
  if (belumAda(error)) ({ data, error } = await baca(DASAR));
  if (tabelBelumAda(error)) return apiError("ANNOUNCEMENTS_NOT_READY", 409);
  if (error) return apiError("INTERNAL_ERROR", 500);
  const items = (data ?? []) as unknown as PengumumanDilihat[];
  if (id && items.length === 0) return apiError("ANNOUNCEMENT_NOT_FOUND", 404);

  const laporan = await laporanDilihat(event, items, Boolean(id));
  if (!laporan) return apiError("INTERNAL_ERROR", 500);

  if (id) {
    const isi = laporan.get(id);
    if (!isi) return apiError("INTERNAL_ERROR", 500);
    return Response.json({ id, published_at: items[0].published_at, summary: isi.ringkas, email: isi.email, people: isi.baris });
  }
  return Response.json({ items: Object.fromEntries([...laporan].map(([kunci, isi]) => [kunci, isi.ringkas])) });
}
