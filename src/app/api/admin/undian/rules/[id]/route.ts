import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { normalizeExclusionRule } from "@/lib/undian";
import { RULE_COLUMNS, groupSchema } from "../route";

// Ubah dan hapus satu aturan pengecualian.

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(300).nullable().optional(),
  conditions: groupSchema.optional(),
  prize_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (Object.keys(parsed.data).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("undian_exclusion_rules").select(RULE_COLUMNS).eq("id", id).maybeSingle();
  if (!current) return apiError("UNDIAN_RULE_NOT_FOUND", 404);

  if (parsed.data.prize_id) {
    const { data: prize } = await client.from("undian_prizes").select("id").eq("id", parsed.data.prize_id).maybeSingle();
    if (!prize) return apiError("UNDIAN_PRIZE_NOT_FOUND", 404);
  }

  const { data, error } = await client
    .from("undian_exclusion_rules")
    .update({
      ...parsed.data,
      ...(parsed.data.note !== undefined ? { note: parsed.data.note?.trim() || null } : {}),
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    } as never)
    .eq("id", id)
    .select(RULE_COLUMNS)
    .single();
  if (error) return apiError("INTERNAL_ERROR", 500);

  const after = normalizeExclusionRule(data as Record<string, unknown>);
  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "undian_rule_update",
    payload: { old: normalizeExclusionRule(current as Record<string, unknown>), new: after },
  } as never);
  return Response.json(after);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("undian_exclusion_rules").select(RULE_COLUMNS).eq("id", id).maybeSingle();
  if (!current) return apiError("UNDIAN_RULE_NOT_FOUND", 404);

  // Aturan boleh dihapus tanpa syarat, tidak seperti hadiah.
  //
  // Ia tidak menyimpan hasil apa pun: menghapusnya hanya berarti orang-orang yang
  // tadinya tersaring kembali masuk kolam pada undian berikutnya. Pemenang yang
  // sudah keluar tidak berubah, karena kolam dibekukan pada saat undi.
  const { error } = await client.from("undian_exclusion_rules").delete().eq("id", id);
  if (error) return apiError("INTERNAL_ERROR", 500);

  await client.from("audit_logs").insert({
    user_id: auth.user.id,
    action: "undian_rule_delete",
    payload: { old: normalizeExclusionRule(current as Record<string, unknown>), new: null },
  } as never);
  return Response.json({ ok: true });
}
