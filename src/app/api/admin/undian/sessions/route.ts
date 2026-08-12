import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeSessionSummary } from "@/lib/undian";

// Sesi undian: mulai, tutup, dan riwayatnya.
//
// Sesi memberi hasil undian sebuah batas yang eksplisit. Tanpa itu, "mana hasil
// sesi gala dinner" dan "sesi siang sudah selesai, bersihkan" tidak punya jawaban
// yang bisa ditunjuk.
//
// Batasnya dibuat SADAR oleh panitia, tidak disimpulkan sistem dari tanggal atau
// jeda waktu. Tebakan otomatis akan salah persis pada acara yang undiannya terpecah
// pagi dan malam di hari yang sama.

const SESSION_COLUMNS = "id,name,note,status,started_at,closed_at";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(300).nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("undian_session_summary" as never, { p_event_id: eventId } as never);
  if (error) return apiError("INTERNAL_ERROR", 500);

  // Pemenang yang belum bersesi dihitung terpisah.
  //
  // Mereka diundi sebelum fitur sesi ada dan karena itu TIDAK PERNAH lepas dari
  // kolam: tidak ada sesi yang bisa ditutup untuk membebaskan mereka. Angka ini
  // dipakai layar untuk menawarkan pengarsipannya, karena keadaan itu mustahil
  // ditemukan sendiri oleh panitia — yang terlihat hanya hadiah yang terus
  // menolak diundi tanpa alasan yang tertulis di mana pun.
  const { count: orphanCount } = await client
    .from("undian_winners")
    .select("id", { count: "exact", head: true })
    .is("session_id", null);

  const sessions = ((data ?? []) as Record<string, unknown>[]).map(normalizeSessionSummary);
  return Response.json({
    sessions,
    active: sessions.find((session) => session.status === "active") ?? null,
    orphan_winners: orphanCount ?? 0,
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();

  // Sesi aktif diperiksa lebih dulu agar pesannya bisa menyebut NAMA sesi yang
  // sedang berjalan. Unique index di database tetap menjadi penegak sebenarnya —
  // pemeriksaan ini hanya untuk pesan yang bisa ditindaklanjuti, bukan pengaman.
  // Index itu kini `(event_id, status) where status='active'`, jadi satu sesi
  // aktif PER EVENT: membuka sesi di event A tidak memblokir event B.
  const { data: existing } = await client
    .from("undian_sessions")
    .select(SESSION_COLUMNS)
    .eq("event_id", eventId)
    .eq("status", "active")
    .maybeSingle();
  if (existing) {
    return apiError("UNDIAN_SESSION_ACTIVE", 409, {
      active: existing,
      message: `Sesi "${(existing as { name: string }).name}" masih berjalan. Tutup dulu sebelum memulai sesi baru.`,
    });
  }

  const { data, error } = await client
    .from("undian_sessions")
    .insert({ event_id: eventId, name: parsed.data.name, note: parsed.data.note?.trim() || null, created_by: auth.user.id } as never)
    .select(SESSION_COLUMNS)
    .single();
  // 23505 = unique_violation, yaitu sesi lain dibuat di sela pemeriksaan di atas.
  if (error) {
    return (error as { code?: string }).code === "23505"
      ? apiError("UNDIAN_SESSION_ACTIVE", 409)
      : apiError("INTERNAL_ERROR", 500);
  }

  const session = data as { id: number; name: string };

  // State runtime langsung menunjuk sesi baru, sehingga tombol undi tidak perlu
  // mencari sesi aktif sendiri pada setiap penekanan.
  await client.from("undian_state").update({ session_id: session.id, updated_at: new Date().toISOString() } as never).eq("event_id", eventId);

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "undian_session_start",
    payload: { old: null, new: session },
  } as never);

  return Response.json(session, { status: 201 });
}

export { SESSION_COLUMNS };
