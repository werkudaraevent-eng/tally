import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  isTrulyEmpty,
  matchesConditions,
  normalizeExclusionRule,
  type ParticipantPoolRow,
  type UndianExclusionRule,
} from "@/lib/undian";

// Aturan pengecualian undian.
//
// Peserta yang MEMENUHI syarat sebuah aturan justru DIKECUALIKAN. Arahnya
// berlawanan dengan syarat hadiah, dan itu sebabnya endpoint serta tabelnya
// dipisah — dua arti berlawanan pada satu bentuk data adalah sumber kekeliruan
// yang tidak terlihat sampai kolamnya sudah salah.

const RULE_COLUMNS = "id,name,note,conditions,prize_id,is_active";

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
    // Pembanding yang butuh nilai tapi nilainya kosong ditolak di sini, bukan
    // dijatuhkan diam-diam. `contains ""` cocok dengan semua orang, dan pada
    // aturan pengecualian itu berarti seluruh ruangan gugur karena satu kolom
    // yang lupa diisi.
    if (!CMP_WITHOUT_VALUE.includes(value.cmp) && value.text === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Isi nilai pembandingnya." });
    }
  }),
]);

type ConditionInput = z.infer<typeof leafSchema> | { op: "and" | "or"; children: ConditionInput[] };

const nodeSchema: z.ZodType<ConditionInput> = z.lazy(() =>
  z.union([leafSchema, z.object({ op: z.enum(["and", "or"]), children: z.array(nodeSchema).max(20) })]),
);

// Minimal satu syarat. Aturan kosong akan mengecualikan SEMUA orang, karena pohon
// kosong selalu bernilai benar dan di sini benar berarti tersingkir. Database juga
// menolaknya lewat CHECK constraint; di sini ditolak lebih dulu supaya pesannya
// menyebut field yang salah, bukan pesan galat Postgres.
const groupSchema = z.object({
  op: z.enum(["and", "or"]),
  children: z.array(nodeSchema).min(1, "Tambahkan minimal satu syarat.").max(20),
});

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(300).nullable().optional(),
  conditions: groupSchema,
  prize_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().default(true),
});

export async function GET(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("undian_exclusion_rules").select(RULE_COLUMNS).order("id");
  if (error) return apiError("INTERNAL_ERROR", 500);

  const rules = ((data ?? []) as Record<string, unknown>[]).map(normalizeExclusionRule);

  // Jumlah peserta terkena per aturan, dihitung hanya bila diminta.
  //
  // Termasuk aturan yang mengenai NOL orang, dan itu justru bagian pentingnya:
  // aturan yang salah tulis ("perusahaan sama dengan PRIMA" padahal datanya
  // "PT PRIMA") tampak wajar di layar dan baru terbukti keliru dari angka nol.
  // Tanpa angka itu, panitia menganggap aturannya bekerja sampai nama yang
  // seharusnya tersingkir keluar sebagai pemenang.
  const withCounts = new URL(request.url).searchParams.get("counts") === "1";
  let counts: Record<number, number> = {};
  let participantTypes: string[] = [];
  let rsvpStatuses: string[] = [];
  let companies: string[] = [];
  let totalParticipants = 0;

  if (withCounts) {
    const { data: pool } = await client.rpc("undian_participant_pool" as never);
    const rows = (pool ?? []) as ParticipantPoolRow[];
    totalParticipants = rows.length;
    counts = countMatches(rows, rules);
    participantTypes = distinct(rows.map((row) => row.participant_type));
    rsvpStatuses = distinct(rows.map((row) => row.rsvp_status));
    companies = distinct(rows.map((row) => row.company));
  }

  return Response.json({ rules, counts, total_participants: totalParticipants, participant_types: participantTypes, rsvp_statuses: rsvpStatuses, companies });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  if (parsed.data.prize_id) {
    const { data: prize } = await client.from("undian_prizes").select("id").eq("id", parsed.data.prize_id).maybeSingle();
    if (!prize) return apiError("UNDIAN_PRIZE_NOT_FOUND", 404);
  }

  const { data, error } = await client
    .from("undian_exclusion_rules")
    .insert({
      name: parsed.data.name,
      note: parsed.data.note?.trim() || null,
      conditions: parsed.data.conditions,
      prize_id: parsed.data.prize_id ?? null,
      is_active: parsed.data.is_active,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    } as never)
    .select(RULE_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  const rule = normalizeExclusionRule(data as Record<string, unknown>);
  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "undian_rule_create",
    payload: { old: null, new: rule },
  } as never);
  return Response.json(rule, { status: 201 });
}

/** Berapa peserta yang terkena masing-masing aturan, dihitung independen per aturan. */
export function countMatches(rows: ParticipantPoolRow[], rules: UndianExclusionRule[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const rule of rules) {
    // Aturan tanpa syarat dilewati, bukan dilaporkan mengenai semua orang: angka
    // 249 di layar akan terbaca sebagai aturan yang bekerja sangat luas, padahal
    // artinya aturannya rusak.
    if (isTrulyEmpty(rule.conditions)) { counts[rule.id] = 0; continue; }
    counts[rule.id] = rows.filter((row) => matchesConditions(row, rule.conditions)).length;
  }
  return counts;
}

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))].sort();
}

export { RULE_COLUMNS, groupSchema };
