import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizePrize, type UndianPrize } from "@/lib/undian";
import { buildPool } from "@/lib/undian-pool";

// CRUD hadiah undian. Admin saja.

export const PRIZE_COLUMNS =
  "id,name,description,image_url,sponsor_name,winners_per_draw,winner_quota,backup_per_draw," +
  "animation,spin_seconds,source,entry_group_id,conditions,exclude_scope," +
  "weight_mode,weight_var,weight_divisor,weight_base,weight_max,sort_order,is_active";

// Pohon syarat divalidasi rekursif. Kedalaman dibatasi 4 karena z.lazy tanpa
// batas dapat dipakai untuk memaksa parser menelusuri struktur bersarang yang
// sangat dalam; batas ini juga jauh di atas kedalaman 2 yang diizinkan UI.
const TEXT_VARS = ["name", "company", "job_title", "qr_code", "seat_label"] as const;
const TEXT_CMPS = ["eq", "neq", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"] as const;
const CMP_WITHOUT_VALUE: string[] = ["is_empty", "is_not_empty"];

const leafSchema = z.union([
  z.object({
    var: z.enum(["total_spend", "booth_count", "scan_count"]),
    cmp: z.enum(["gte", "gt", "lte", "lt", "eq"]),
    value: z.number().min(0).max(1_000_000_000),
  }),
  z.object({
    var: z.enum(["participant_type", "rsvp_status"]),
    cmp: z.enum(["in", "not_in"]),
    values: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  }),
  z.object({ var: z.enum(["checked_in", "has_seat"]), is: z.boolean() }),
  z.object({
    var: z.enum(TEXT_VARS),
    cmp: z.enum(TEXT_CMPS),
    text: z.string().trim().max(200),
  }).superRefine((value, ctx) => {
    // `contains ""` cocok dengan semua orang. Pada syarat hadiah itu tampak tidak
    // berbahaya, tapi tetap ditolak supaya aturan yang setengah jadi tidak
    // tersimpan dan terbaca sebagai syarat yang sengaja dibuat longgar.
    if (!CMP_WITHOUT_VALUE.includes(value.cmp) && value.text === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Isi nilai pembandingnya." });
    }
  }),
]);

type ConditionInput = z.infer<typeof leafSchema> | { op: "and" | "or"; children: ConditionInput[] };

const nodeSchema: z.ZodType<ConditionInput> = z.lazy(() =>
  z.union([
    leafSchema,
    z.object({ op: z.enum(["and", "or"]), children: z.array(nodeSchema).max(20) }),
  ]),
);

const groupSchema = z.object({ op: z.enum(["and", "or"]), children: z.array(nodeSchema).max(20) });

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).nullable().optional(),
  image_url: z.string().trim().url().max(600).nullable().optional(),
  sponsor_name: z.string().trim().max(120).nullable().optional(),
  winners_per_draw: z.number().int().min(1).max(50),
  winner_quota: z.number().int().min(1).max(500),
  backup_per_draw: z.number().int().min(0).max(20),
  animation: z.enum(["wheel", "slot", "cards", "digits", "instant"]),
  spin_seconds: z.number().min(1).max(60),
  source: z.enum(["participants", "entries"]),
  entry_group_id: z.number().int().positive().nullable().optional(),
  conditions: groupSchema,
  exclude_scope: z.enum(["none", "this_prize", "all_prizes"]),
  weight_mode: z.enum(["equal", "formula"]),
  weight_var: z.enum(["total_spend", "booth_count", "scan_count"]),
  weight_divisor: z.number().min(1).max(1_000_000_000),
  weight_base: z.number().int().min(0).max(100),
  weight_max: z.number().int().min(1).max(1000),
  sort_order: z.number().int().min(0).max(9999),
  is_active: z.boolean(),
}).superRefine((value, ctx) => {
  // Sumber 'entries' tanpa daftar akan menghasilkan kolam kosong dan tombol undi
  // yang gagal tanpa penjelasan. Ditolak di sini, sebelum menyentuh database,
  // supaya pesannya menyebut field yang salah.
  if (value.source === "entries" && !value.entry_group_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["entry_group_id"], message: "Pilih daftar entri yang akan diundi." });
  }
  if (value.weight_base > value.weight_max) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["weight_max"], message: "Tiket maksimum tidak boleh lebih kecil dari tiket dasar." });
  }
  // Cadangan ikut diambil dari kolam yang sama dalam satu kali undi, jadi
  // totalnya yang menentukan berapa nama harus tersedia.
  if (value.winners_per_draw + value.backup_per_draw > 60) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["backup_per_draw"], message: "Pemenang + cadangan per undi maksimal 60." });
  }
});

/**
 * Jumlah pemenang per hadiah dalam SATU query, bukan satu query per hadiah.
 *
 * Daftar hadiah bisa berisi belasan baris dan halaman CMS ini dibuka di sela
 * acara; N+1 di sini berarti belasan bolak-balik ke database setiap kali halaman
 * disegarkan.
 *
 * Dihitung dalam lingkup SESI AKTIF saja, sama dengan pemeriksaan kuota di
 * /api/undian/control. Kalau dihitung lintas sesi, hadiah yang kuotanya habis di
 * sesi siang akan tampil "penuh" di sesi malam — padahal panitia menutup sesi
 * sebelumnya justru supaya hadiah itu bisa diundi lagi.
 */
async function winnerCounts(): Promise<Record<number, number>> {
  const client = getSupabaseServiceClient();
  const { data: session } = await client.from("undian_sessions").select("id").eq("status", "active").maybeSingle();
  const sessionId = (session as { id: number } | null)?.id ?? null;

  let query = client.from("undian_winners").select("prize_id").neq("status", "rejected");
  query = sessionId === null ? query.is("session_id", null) : query.eq("session_id", sessionId);

  const { data } = await query;
  const counts: Record<number, number> = {};
  for (const row of (data ?? []) as { prize_id: number }[]) {
    counts[row.prize_id] = (counts[row.prize_id] ?? 0) + 1;
  }
  return counts;
}

export async function GET(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("undian_prizes").select(PRIZE_COLUMNS).order("sort_order").order("id");
  if (error) return apiError("INTERNAL_ERROR", 500);

  const prizes = ((data ?? []) as Record<string, unknown>[]).map(normalizePrize);
  const counts = await winnerCounts();

  // Ukuran kolam dihitung hanya bila diminta. Ia memanggil RPC agregat dan
  // menyaring ratusan baris per hadiah; halaman kontrol operator yang menyegarkan
  // diri setiap 2 detik tidak boleh membayar biaya itu.
  const withPool = new URL(request.url).searchParams.get("pool") === "1";
  const pools: Record<number, { eligible: number; candidates: number; tickets: number }> = {};
  if (withPool) {
    for (const prize of prizes) {
      const result = await buildPool(prize);
      if ("error" in result) continue;
      pools[prize.id] = {
        eligible: result.eligible_count,
        candidates: result.candidates.length,
        tickets: result.total_tickets,
      };
    }
  }

  return Response.json({ prizes, winner_counts: counts, pools });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  if (parsed.data.source === "entries" && parsed.data.entry_group_id) {
    const { data: group } = await client.from("undian_entry_groups").select("id").eq("id", parsed.data.entry_group_id).maybeSingle();
    if (!group) return apiError("UNDIAN_ENTRY_GROUP_NOT_FOUND", 404);
  }

  const { data, error } = await client
    .from("undian_prizes")
    .insert({ ...parsed.data, updated_by: auth.user.id } as never)
    .select(PRIZE_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  const prize = normalizePrize(data as Record<string, unknown>);
  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "undian_prize_create",
    payload: { old: null, new: prize },
  } as never);
  return Response.json(prize, { status: 201 });
}

export type { UndianPrize };
