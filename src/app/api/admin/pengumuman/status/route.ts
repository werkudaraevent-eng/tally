import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { tabelBelumAda } from "@/lib/member/pengumuman";
import { sembunyiSiap } from "@/lib/pengumuman-penerima-server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Hide, Show dan Notify again untuk satu pengumuman (Messages > Announcements).
 *
 * hide   = hidden_at diisi: hilang dari lonceng dan Dashboard saya, tidak
 *          dihapus. Butuh migrasi 202611060002.
 * show   = hidden_at dikosongkan. published_at tetap, jadi lonceng TIDAK
 *          menyala lagi; untuk itu ada notify.
 * notify = published_at = sekarang. "Belum dibaca" di lonceng dihitung dari
 *          published_at > announcements_seen_at per akun (migrasi
 *          202610030002), jadi pengumuman ini menjadi baru lagi bagi semua
 *          penerimanya dan naik ke atas daftar. Tanpa migrasi baru. Tidak
 *          mengirim email: salinan email tetap tombol terpisah.
 *
 * Pagar spam: notify ditolak bila pengumuman itu terbit atau dikirim ulang
 * kurang dari 10 menit lalu. Syaratnya ada di UPDATE itu sendiri, jadi dua
 * klik bersamaan tetap hanya menyalakan lonceng sekali.
 */

const JEDA_MS = 10 * 60_000;

const schema = z.object({ id: z.string().guid(), action: z.enum(["hide", "show", "notify"]) });

type Baris = { id: string; title: string; published_at: string; hidden_at?: string | null };

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, action } = parsed.data;

  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();
  const siap = await sembunyiSiap();
  if (action !== "notify" && !siap) return apiError("ANNOUNCEMENT_HIDE_NOT_READY", 409);
  const kolom = siap ? "id,title,published_at,hidden_at" : "id,title,published_at";

  const { data: lama, error: galatBaca } = await client
    .from("event_announcements")
    .select(kolom)
    .eq("id", id)
    .eq("event_id", eventId)
    .maybeSingle();
  if (tabelBelumAda(galatBaca)) return apiError("ANNOUNCEMENTS_NOT_READY", 409);
  if (galatBaca) return apiError("INTERNAL_ERROR", 500);
  if (!lama) return apiError("ANNOUNCEMENT_NOT_FOUND", 404);
  const sebelum = lama as unknown as Baris;

  const sekarang = new Date();
  let query = client.from("event_announcements").update(
    (action === "notify"
      ? { published_at: sekarang.toISOString() }
      : { hidden_at: action === "hide" ? sekarang.toISOString() : null }) as never,
  )
    .eq("id", id)
    .eq("event_id", eventId);
  if (action === "notify") {
    query = query.lt("published_at", new Date(sekarang.getTime() - JEDA_MS).toISOString());
    if (siap) query = query.is("hidden_at", null);
  }
  const { data, error } = await query.select(kolom).maybeSingle();
  if (error) return apiError("INTERNAL_ERROR", 500);
  if (!data) {
    // Hanya notify yang bersyarat: tersembunyi, atau terlalu cepat.
    if (sebelum.hidden_at) return apiError("ANNOUNCEMENT_HIDDEN", 409);
    return apiError("ANNOUNCEMENT_NOTIFIED_RECENTLY", 409, { published_at: sebelum.published_at });
  }

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: action === "notify" ? "announcement_notify_again" : action === "hide" ? "announcement_hide" : "announcement_show",
    payload: { id, title: sebelum.title, old: { published_at: sebelum.published_at, hidden_at: sebelum.hidden_at ?? null } },
  } as never);
  return Response.json(data);
}
