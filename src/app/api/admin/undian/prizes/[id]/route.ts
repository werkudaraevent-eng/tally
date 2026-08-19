import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizePrize } from "@/lib/undian";
import { PRIZE_COLUMNS } from "../route";

// Ubah dan hapus satu hadiah.

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
    if (!CMP_WITHOUT_VALUE.includes(value.cmp) && value.text === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Isi nilai pembandingnya." });
    }
  }),
]);

type ConditionInput = z.infer<typeof leafSchema> | { op: "and" | "or"; children: ConditionInput[] };

const nodeSchema: z.ZodType<ConditionInput> = z.lazy(() =>
  z.union([leafSchema, z.object({ op: z.enum(["and", "or"]), children: z.array(nodeSchema).max(20) })]),
);

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  image_url: z.string().trim().url().max(600).nullable().optional(),
  sponsor_name: z.string().trim().max(120).nullable().optional(),
  winners_per_draw: z.number().int().min(1).max(50).optional(),
  winner_quota: z.number().int().min(1).max(500).optional(),
  backup_per_draw: z.number().int().min(0).max(20).optional(),
  animation: z.enum(["wheel", "slot", "cards", "digits", "dart", "instant"]).optional(),
  spin_mode: z.enum(["timed", "manual"]).optional(),
  spin_seconds: z.number().min(1).max(60).optional(),
  source: z.enum(["participants", "entries"]).optional(),
  entry_group_id: z.number().int().positive().nullable().optional(),
  conditions: z.object({ op: z.enum(["and", "or"]), children: z.array(nodeSchema).max(20) }).optional(),
  exclude_scope: z.enum(["none", "this_prize", "all_prizes"]).optional(),
  weight_mode: z.enum(["equal", "formula"]).optional(),
  weight_var: z.enum(["total_spend", "booth_count", "scan_count"]).optional(),
  weight_divisor: z.number().min(1).max(1_000_000_000).optional(),
  weight_base: z.number().int().min(0).max(100).optional(),
  weight_max: z.number().int().min(1).max(1000).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("undian_prizes").select(PRIZE_COLUMNS).eq("event_id", eventId).eq("id", id).maybeSingle();
  if (!current) return apiError("UNDIAN_PRIZE_NOT_FOUND", 404);

  const before = normalizePrize(current as Record<string, unknown>);
  // Nilai gabungan diperiksa terhadap hasil AKHIR, bukan hanya terhadap field
  // yang dikirim. Mengubah weight_base saja tetap harus lolos uji terhadap
  // weight_max yang sudah tersimpan, kalau tidak CHECK constraint database yang
  // menolak dan pesannya tidak dapat dibaca operator.
  const merged = { ...before, ...parsed.data };
  if (merged.source === "entries" && !merged.entry_group_id) {
    return apiError("VALIDATION_ERROR", 422, { fieldErrors: { entry_group_id: ["Pilih daftar entri yang akan diundi."] } });
  }
  if (merged.weight_base > merged.weight_max) {
    return apiError("VALIDATION_ERROR", 422, { fieldErrors: { weight_max: ["Tiket maksimum tidak boleh lebih kecil dari tiket dasar."] } });
  }
  if (merged.winners_per_draw + merged.backup_per_draw > 60) {
    return apiError("VALIDATION_ERROR", 422, { fieldErrors: { backup_per_draw: ["Pemenang + cadangan per undi maksimal 60."] } });
  }

  const { data, error } = await client
    .from("undian_prizes")
    .update({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: auth.user.id } as never)
    .eq("event_id", eventId)
    .eq("id", id)
    .select(PRIZE_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  const after = normalizePrize(data as Record<string, unknown>);
  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "undian_prize_update",
    payload: { old: before, new: after },
  } as never);
  return Response.json(after);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  // Filter event WAJIB: DELETE ini cascade ke undian_winners, jadi satu id yang
  // salah bisa memusnahkan catatan pemenang event lain.
  const { data: current } = await client.from("undian_prizes").select(PRIZE_COLUMNS).eq("event_id", eventId).eq("id", id).maybeSingle();
  if (!current) return apiError("UNDIAN_PRIZE_NOT_FOUND", 404);

  // Hadiah yang sudah punya pemenang tidak boleh dihapus, sama seperti penawaran
  // yang sudah diklaim. Menghapusnya akan menghapus catatan pemenang lewat
  // ON DELETE CASCADE, dan itu adalah bukti serah terima barang.
  const { count } = await client
    .from("undian_winners")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("prize_id", id)
    .neq("status", "rejected");
  if ((count ?? 0) > 0) return apiError("UNDIAN_PRIZE_IN_USE", 409);

  const { error } = await client.from("undian_prizes").delete().eq("event_id", eventId).eq("id", id);
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "undian_prize_delete",
    payload: { old: normalizePrize(current as Record<string, unknown>), new: null },
  } as never);
  return Response.json({ ok: true });
}
