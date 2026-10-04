import { z } from "zod";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { rateCount, rateNote, readInvite, requestIp } from "@/lib/undangan/publik";

/**
 * Penanda "Membuka formulir" (perkiraan). Formulir mengirimnya SEKALI, setelah
 * ada interaksi nyata (fokus ke kolom, gulir, atau halaman terlihat lebih dari
 * 3 detik), supaya pemindai tautan email kantor yang membuka setiap URL tidak
 * ikut terhitung. Tanda tangan tautannya diperiksa seperti pendaftaran.
 *
 * Jawabannya selalu sama dan tanpa isi: penanda tidak boleh menjadi cara
 * menguji apakah sebuah token sah.
 */

const schema = z.object({ undangan: z.string().max(200) });
const PER_JAM = 60;

export async function POST(request: Request) {
  const selesai = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const event = await getPublicRequestEvent(request);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!event || !parsed.success) return selesai;
  const ip = requestIp(request.headers);
  if (ip && (await rateCount(event.id, "penanda", { ip }, 3_600_000)) >= PER_JAM) return selesai;
  await rateNote(event.id, "penanda", { ip }).catch(() => undefined);
  const baca = await readInvite(event, parsed.data.undangan, ip);
  if (baca.state !== "ok" || baca.inv.link_opened_at) return selesai;
  await getSupabaseServiceClient()
    .from("event_invitations")
    .update({ link_opened_at: new Date().toISOString() } as never)
    .eq("id", baca.inv.id)
    .is("link_opened_at", null);
  return selesai;
}
