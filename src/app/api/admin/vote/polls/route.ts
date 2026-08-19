import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { pollBodySchema, type VoteStatus, type VoteType, type VoterMode } from "@/lib/vote";

/**
 * Daftar pertanyaan voting beserta opsi dan jumlah suaranya.
 *
 * Jumlah suara diambil dari `vote_ballots`, bukan dari penjumlahan
 * `vote_options.vote_count`: pada pertanyaan pilihan ganda satu pemilih
 * menyumbang beberapa suara, sehingga penjumlahan penghitung menjawab
 * pertanyaan yang berbeda ("berapa suara") dari yang dibutuhkan CMS ("berapa
 * orang sudah memilih") -- dan angka kedua itulah yang menentukan apakah opsi
 * masih boleh diubah.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"], { readOnly: true });
  if (auth.response) return auth.response;

  const client = getSupabaseServiceClient();
  const eventId = auth.scope.event.id;

  const [pollResult, stateResult, ballotResult] = await Promise.all([
    client
      .from("vote_polls")
      .select("id,question,description,type,voter_mode,max_choices,status,results_visible,sort_order,rating_max,rating_min_label,rating_max_label,moderation,max_words,vote_options(id,label,vote_count,sort_order,image_url)")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    client.from("vote_state").select("active_poll_id").eq("event_id", eventId).maybeSingle(),
    // `text_status` ikut diambil supaya antrean moderasi word cloud dapat
    // dihitung dari permintaan yang sama, tanpa satu query tambahan per
    // pertanyaan.
    client.from("vote_ballots").select("poll_id,text_status").eq("event_id", eventId),
  ]);
  if (pollResult.error) return apiError("INTERNAL_ERROR", 500);

  // Dihitung di sini, bukan lewat satu query agregat per pertanyaan: jumlah
  // pertanyaan per event belasan, dan satu permintaan yang mengambil kolom
  // poll_id saja jauh lebih murah daripada belasan permintaan count.
  const ballotsByPoll = new Map<number, number>();
  const pendingByPoll = new Map<number, number>();
  for (const row of (ballotResult.data ?? []) as { poll_id: number; text_status: string }[]) {
    ballotsByPoll.set(row.poll_id, (ballotsByPoll.get(row.poll_id) ?? 0) + 1);
    if (row.text_status === "pending") pendingByPoll.set(row.poll_id, (pendingByPoll.get(row.poll_id) ?? 0) + 1);
  }

  type Row = {
    id: number; question: string; description: string | null; type: VoteType;
    voter_mode: VoterMode; max_choices: number;
    status: VoteStatus; results_visible: boolean;
    rating_max: number; rating_min_label: string | null; rating_max_label: string | null;
    moderation: boolean; max_words: number;
    vote_options: Array<{ id: number; label: string; vote_count: number; sort_order: number; image_url: string | null }>;
  };

  const polls = ((pollResult.data ?? []) as unknown as Row[]).map((poll) => ({
    ...poll,
    // PostgREST tidak menjamin urutan baris anak; diurutkan di sini supaya
    // nomor opsi di CMS, di HP pemilih, dan di layar panggung selalu sama.
    options: [...poll.vote_options].sort((a, b) => a.sort_order - b.sort_order)
      .map(({ id, label, vote_count, image_url }) => ({ id, label, vote_count, image_url })),
    ballots: ballotsByPoll.get(poll.id) ?? 0,
    pending_words: pendingByPoll.get(poll.id) ?? 0,
    vote_options: undefined,
  }));

  return Response.json({
    polls,
    active_poll_id: (stateResult.data as { active_poll_id: number | null } | null)?.active_poll_id ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const body = pollBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const { data, error } = await getSupabaseServiceClient().rpc("save_vote_poll" as never, {
    p_event_id: auth.scope.event.id,
    p_id: null,
    p_question: body.data.question,
    p_description: body.data.description ?? null,
    p_type: body.data.type,
    p_voter_mode: body.data.voter_mode,
    p_max_choices: body.data.max_choices,
    p_options: body.data.options.map((option) => ({ label: option.label, image_url: option.image_url ?? null })),
    p_actor: auth.user.id,
    p_rating_max: body.data.rating_max,
    p_rating_min_label: body.data.rating_min_label ?? null,
    p_rating_max_label: body.data.rating_max_label ?? null,
    p_moderation: body.data.moderation,
    p_max_words: body.data.max_words,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }
  return Response.json(data, { status: 201 });
}
