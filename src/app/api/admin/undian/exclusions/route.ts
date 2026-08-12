import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Peserta yang tidak boleh menang: panitia, MC, direksi, perwakilan sponsor.
//
// Bekerja di atas syarat, bukan menggantikannya. Peserta di daftar ini gugur
// dari SEMUA hadiah tanpa peduli syaratnya apa, karena alasannya bukan soal
// kelayakan melainkan soal peran — dan menuliskannya sebagai syarat berarti
// mengulang aturan yang sama di setiap hadiah dan cukup satu terlewat.

const postSchema = z.object({
  participant_id: z.string().uuid(),
  reason: z.string().trim().max(200).nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  // Nama ikut diambil lewat relasi: daftar berisi uuid saja tidak dapat
  // diperiksa siapa pun.
  const { data, error } = await getSupabaseServiceClient()
    .from("undian_exclusions")
    .select("participant_id,reason,created_at,participants(name,company)")
    .eq("event_id", auth.scope.event.id)
    .order("created_at", { ascending: false });
  if (error) return apiError("INTERNAL_ERROR", 500);

  type Row = { participant_id: string; reason: string | null; created_at: string; participants: { name: string; company: string | null } | null };
  return Response.json({
    exclusions: ((data ?? []) as Row[]).map((row) => ({
      participant_id: row.participant_id,
      reason: row.reason,
      created_at: row.created_at,
      name: row.participants?.name ?? "(peserta terhapus)",
      company: row.participants?.company ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data: participant } = await client.from("participants").select("id,name").eq("event_id", eventId).eq("id", parsed.data.participant_id).maybeSingle();
  if (!participant) return apiError("PARTICIPANT_NOT_FOUND", 404);

  // upsert, bukan insert: menambahkan peserta yang sudah ada di daftar bukan
  // kesalahan yang perlu dilaporkan, hasil akhirnya sudah sesuai keinginan.
  //
  // onConflict WAJIB `event_id,participant_id`. Primary key lama (participant_id
  // saja) sudah diganti komposit di 202608070002, jadi target lama tidak lagi
  // cocok dengan constraint mana pun dan upsert-nya gagal 42P10 -- DIUKUR rusak
  // bahkan dengan satu event. Kelas kesalahan yang sama dengan
  // sync_booth_builtin_offer: mengganti constraint memutus setiap ON CONFLICT
  // yang menunjuknya, dan gagalnya baru muncul saat baris berikutnya ditulis.
  const { error } = await client
    .from("undian_exclusions")
    .upsert({
      event_id: eventId,
      participant_id: parsed.data.participant_id,
      reason: parsed.data.reason?.trim() || null,
      created_by: auth.user.id,
    } as never, { onConflict: "event_id,participant_id" });
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "undian_exclusion_add",
    payload: { old: null, new: { participant: participant, reason: parsed.data.reason ?? null } },
  } as never);
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const id = new URL(request.url).searchParams.get("participant_id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client
    .from("undian_exclusions")
    .select("participant_id,reason,participants(name)")
    .eq("event_id", eventId)
    .eq("participant_id", id)
    .maybeSingle();
  if (!current) return apiError("PARTICIPANT_NOT_FOUND", 404);

  const { error } = await client.from("undian_exclusions").delete().eq("event_id", eventId).eq("participant_id", id);
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "undian_exclusion_remove",
    payload: { old: current, new: null },
  } as never);
  return Response.json({ ok: true });
}
