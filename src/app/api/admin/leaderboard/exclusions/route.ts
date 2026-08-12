import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Pengecualian peserta/perusahaan dari leaderboard top spender.
 *
 * Ini aturan KELAYAKAN ("tidak berhak ikut"), bukan setelan tampilan. Karena itu
 * endpoint-nya terpisah dari /api/display/settings: menaruhnya di sana berarti
 * daftar diskualifikasi ikut terkirim setiap kali ada yang mengubah warna latar,
 * dan sebaliknya menambah satu perusahaan akan menerbitkan perubahan tampilan
 * yang belum selesai. Alasan yang sama memisahkan leaderboard_reveal dari
 * display_settings.
 *
 * Penyaringannya sendiri TIDAK ada di sini — semuanya di dalam RPC
 * get_leaderboard. Lihat 202608060003_leaderboard_exclusions.sql.
 */

const COLUMNS = "id,company_keyword,participant_id,reason,is_active,created_at,created_by";

// Minimal 2 karakter, sama dengan CHECK di database.
//
// Bukan sekadar "jangan kosong": `position('' in apa_pun) = 1`, sehingga kata
// kunci kosong cocok dengan SEMUA perusahaan dan mengosongkan seluruh papan tanpa
// satu pun galat. Kata kunci satu huruf hampir sama buruknya — "a" ada di hampir
// setiap nama perusahaan Indonesia.
//
// Divalidasi di dua lapis dengan sengaja: di sini supaya pesannya menyebut field
// yang salah, di database supaya SQL manual pun tidak bisa menembusnya.
const keyword = z.string().trim().min(2, "Kata kunci minimal 2 huruf.").max(120);

const createSchema = z.object({
  company_keyword: keyword.nullable().optional(),
  participant_id: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(300).nullable().optional(),
  is_active: z.boolean().default(true),
}).superRefine((value, ctx) => {
  const hasKeyword = Boolean(value.company_keyword);
  const hasParticipant = Boolean(value.participant_id);
  // Tepat satu sasaran. Dua-duanya terisi tidak punya arti tunggal (perusahaan
  // ATAU orang itu? atau keduanya harus cocok?), dan tanpa keduanya baris ini
  // adalah aturan yang tidak menunjuk siapa pun.
  if (hasKeyword === hasParticipant) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["company_keyword"],
      message: "Pilih salah satu: kata kunci perusahaan ATAU satu peserta.",
    });
  }
});

type ImpactRow = { id: number; matched_participants: number; matched_spenders: number };
type SummaryRow = { total_spenders: number; excluded_spenders: number; remaining_spenders: number };

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const eventId = auth.scope.event.id;
  const client = getSupabaseServiceClient();
  const [rulesResult, impactResult, summaryResult, participantsResult, companiesResult] = await Promise.all([
    client.from("leaderboard_exclusions").select(COLUMNS).eq("event_id", eventId).order("created_at", { ascending: true }),
    client.rpc("leaderboard_exclusion_impact" as never, { p_event_id: eventId } as never),
    client.rpc("leaderboard_exclusion_summary" as never, { p_event_id: eventId } as never),
    client.from("participants").select("id,name,company").eq("event_id", eventId).is("source_removed_at", null).order("name"),
    client.from("participants").select("company").eq("event_id", eventId).is("source_removed_at", null).not("company", "is", null),
  ]);
  if (rulesResult.error) return apiError(mapDatabaseError(rulesResult.error), 500);

  // count(*) dari Postgres tiba sebagai STRING (bigint). Tanpa Number() di sini,
  // penjumlahan apa pun di layar akan menyambung teks: "10" + 1 === "101".
  const impact = new Map(
    ((impactResult.data ?? []) as ImpactRow[]).map((row) => [
      Number(row.id),
      { matched_participants: Number(row.matched_participants), matched_spenders: Number(row.matched_spenders) },
    ]),
  );
  const summaryRaw = ((summaryResult.data ?? []) as SummaryRow[])[0];

  // Daftar perusahaan unik untuk <select> di CMS.
  //
  // Admin memilih dari data nyata, tidak mengetik bebas: salah satu huruf pada
  // "Rintis" menghasilkan aturan yang tersimpan rapi, berefek nol, dan membuat
  // panitia menunggu perubahan yang tidak akan pernah muncul.
  //
  // Dikelompokkan case-insensitive supaya "PT Rintis Sejahtera" dan
  // "PT. Rintis Sejahtera" tidak tampil sebagai dua pilihan yang terlihat sama.
  const companyCount = new Map<string, { label: string; count: number }>();
  for (const row of (companiesResult.data ?? []) as Array<{ company: string | null }>) {
    const raw = row.company?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const current = companyCount.get(key);
    if (current) current.count += 1;
    else companyCount.set(key, { label: raw, count: 1 });
  }

  return Response.json({
    rules: (rulesResult.data ?? []).map((row) => {
      const rule = row as { id: number; participant_id: string | null };
      return {
        ...rule,
        ...(impact.get(Number(rule.id)) ?? { matched_participants: 0, matched_spenders: 0 }),
      };
    }),
    summary: {
      total_spenders: Number(summaryRaw?.total_spenders ?? 0),
      excluded_spenders: Number(summaryRaw?.excluded_spenders ?? 0),
      remaining_spenders: Number(summaryRaw?.remaining_spenders ?? 0),
    },
    participants: (participantsResult.data ?? []) as Array<{ id: string; name: string; company: string | null }>,
    companies: [...companyCount.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  });
}

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("leaderboard_exclusions")
    .insert({
      event_id: auth.scope.event.id,
      company_keyword: parsed.data.company_keyword ?? null,
      participant_id: parsed.data.participant_id ?? null,
      reason: parsed.data.reason ?? null,
      is_active: parsed.data.is_active,
      created_by: auth.user.id,
    } as never)
    .select(COLUMNS)
    .single();
  // 23505 = unique violation. Aturan kembar tidak menambah efek apa pun, hanya
  // membuat daftar terbaca seolah ada dua keputusan berbeda.
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return apiError("VALIDATION_ERROR", 422, { company_keyword: ["Aturan untuk sasaran ini sudah ada."] });
    }
    return apiError(mapDatabaseError(error), 500);
  }

  await client.from("audit_logs").insert({
    action: "leaderboard_exclusion_create",
    user_id: auth.user.id,
    payload: { old: null, new: data },
  } as never);

  return Response.json(data, { status: 201 });
}
