import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const SELECT = "code,label,requires_reference,reference_label,reference_digits,is_active,sort_order,is_builtin";

const createSchema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,32}$/, "Kode hanya huruf kecil, angka, dan underscore."),
  label: z.string().trim().min(1).max(60),
  requires_reference: z.boolean().default(false),
  reference_label: z.string().trim().max(60).nullable().optional(),
  reference_digits: z.number().int().min(4).max(32).nullable().optional(),
  sort_order: z.number().int().min(0).max(999).default(100),
});

const updateSchema = z.object({
  code: z.string().trim().min(1),
  label: z.string().trim().min(1).max(60).optional(),
  is_active: z.boolean().optional(),
  requires_reference: z.boolean().optional(),
  reference_label: z.string().trim().max(60).nullable().optional(),
  reference_digits: z.number().int().min(4).max(32).nullable().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

// Kasir dan admin sama-sama perlu daftar metode. Kasir hanya menerima yang aktif;
// admin melihat semuanya termasuk yang dimatikan agar bisa dinyalakan kembali.
export async function GET() {
  const auth = await requireUser(["admin", "cashier"]);
  if (auth.response) return auth.response;
  let query = getSupabaseServiceClient().from("payment_methods").select(SELECT).order("sort_order", { ascending: true });
  if (auth.user.role === "cashier") query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ payment_methods: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (parsed.data.requires_reference && !parsed.data.reference_digits) {
    return apiError("VALIDATION_ERROR", 422, { message: "Metode yang butuh nomor referensi harus menentukan jumlah digit." });
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("payment_methods").insert({
    code: parsed.data.code,
    label: parsed.data.label,
    requires_reference: parsed.data.requires_reference,
    reference_label: parsed.data.reference_label ?? null,
    reference_digits: parsed.data.requires_reference ? parsed.data.reference_digits : null,
    sort_order: parsed.data.sort_order,
    is_builtin: false,
  } as never).select(SELECT).single();
  if (error) return apiError(error.code === "23505" ? "DUPLICATE_PAYMENT_METHOD" : mapDatabaseError(error), 422);

  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "payment_method_create", payload: { new: data } } as never);
  return Response.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { code, ...changes } = parsed.data;
  if (Object.keys(changes).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("payment_methods").select(SELECT).eq("code", code).maybeSingle() as { data: { requires_reference: boolean; reference_digits: number | null; is_active: boolean } | null };
  if (!current) return apiError("PAYMENT_METHOD_NOT_FOUND", 404);

  // Cek di API supaya admin mendapat pesan yang jelas. Trigger database tetap ada
  // sebagai jaring pengaman terakhir kalau perubahan datang dari jalur lain.
  if (changes.is_active === false && current.is_active) {
    const { count } = await client.from("payment_methods").select("code", { count: "exact", head: true }).eq("is_active", true);
    if ((count ?? 0) <= 1) return apiError("AT_LEAST_ONE_PAYMENT_METHOD_REQUIRED", 422);
  }

  const requiresReference = changes.requires_reference ?? current.requires_reference;
  const referenceDigits = changes.reference_digits ?? current.reference_digits;
  if (requiresReference && !referenceDigits) {
    return apiError("VALIDATION_ERROR", 422, { message: "Metode yang butuh nomor referensi harus menentukan jumlah digit." });
  }

  const { data, error } = await client.from("payment_methods").update({
    ...changes,
    reference_digits: requiresReference ? referenceDigits : null,
  } as never).eq("code", code).select(SELECT).single();
  if (error) return apiError(mapDatabaseError(error), 422);

  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "payment_method_update", payload: { old: current, new: data } } as never);
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("payment_methods").select(SELECT).eq("code", code).maybeSingle() as { data: { is_builtin: boolean } | null };
  if (!current) return apiError("PAYMENT_METHOD_NOT_FOUND", 404);
  // Builtin dirujuk data historis dan runbook; cukup dinonaktifkan, jangan dihapus.
  if (current.is_builtin) return apiError("PAYMENT_METHOD_BUILTIN", 422);

  // Metode yang sudah dipakai order tidak boleh hilang, laporan akan kehilangan
  // referensinya. FK on delete restrict juga menolak, ini hanya agar pesannya jelas.
  const { count } = await client.from("orders").select("id", { count: "exact", head: true }).eq("payment_method", code);
  if ((count ?? 0) > 0) return apiError("PAYMENT_METHOD_IN_USE", 422);

  const { error } = await client.from("payment_methods").delete().eq("code", code);
  if (error) return apiError(mapDatabaseError(error), 422);

  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "payment_method_delete", payload: { old: current } } as never);
  return Response.json({ deleted: code });
}
