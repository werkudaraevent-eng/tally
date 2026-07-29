import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const SELECT = "id,code,name,price,stock,scope,booth_id,max_per_participant,conditions,counts_toward_leaderboard,is_active,sort_order,is_builtin";

// Pohon kondisi. Grup 'and'/'or' dapat bersarang, daun membandingkan satu
// variabel. Divalidasi di sini agar bentuk yang salah tidak pernah sampai ke
// evaluator di database, yang memperlakukan variabel tak dikenal sebagai GAGAL.
const leafSchema = z.discriminatedUnion("var", [
  z.object({
    var: z.literal("total_spend"),
    // all_booths = akumulasi di SEMUA booth. this_booth = hanya booth tempat order
    // dibuat. booth = booth tertentu yang dipilih admin.
    scope: z.enum(["all_booths", "this_booth", "booth"]).default("all_booths"),
    booth_id: z.number().int().positive().nullable().optional(),
    cmp: z.enum(["gte", "gt", "lte", "lt", "eq"]).default("gte"),
    value: z.number().int().min(0).max(1_000_000_000),
  }),
  z.object({
    var: z.literal("booth_count"),
    cmp: z.enum(["gte", "gt", "lte", "lt", "eq"]).default("gte"),
    value: z.number().int().min(0).max(999),
  }),
  z.object({
    var: z.literal("participant_type"),
    cmp: z.enum(["in", "not_in"]).default("in"),
    values: z.array(z.string().trim().min(1).max(50)).min(1).max(20),
  }),
]);

type ConditionNode = z.infer<typeof leafSchema> | { op: "and" | "or"; children: ConditionNode[] };

// Kedalaman dibatasi 4 supaya aturan tetap dapat dibaca manusia dan evaluator
// rekursif di database tidak pernah menerima pohon yang sangat dalam.
// Input diberi tipe `unknown`, bukan ConditionNode: field ber-`.default()` membuat
// tipe input berbeda dari output (scope opsional saat masuk, terisi saat keluar),
// sehingga ZodType<ConditionNode> tidak dapat mencocokkan keduanya.
const conditionSchema: z.ZodType<ConditionNode, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    leafSchema,
    z.object({ op: z.enum(["and", "or"]), children: z.array(conditionSchema).max(10) }),
  ]),
);

const rootConditionSchema = z.object({
  op: z.enum(["and", "or"]),
  children: z.array(conditionSchema).max(10),
});

const createSchema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,40}$/, "Kode hanya huruf kecil, angka, dan underscore."),
  name: z.string().trim().min(1).max(80),
  price: z.number().int().min(0).max(1_000_000_000),
  stock: z.number().int().min(0).nullable().optional(),
  scope: z.enum(["per_booth", "global"]),
  booth_id: z.number().int().positive().nullable().optional(),
  max_per_participant: z.number().int().min(0).max(999).default(1),
  conditions: rootConditionSchema.default({ op: "and", children: [] }),
  counts_toward_leaderboard: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(9999).default(100),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(80).optional(),
  price: z.number().int().min(0).max(1_000_000_000).optional(),
  stock: z.number().int().min(0).nullable().optional(),
  max_per_participant: z.number().int().min(0).max(999).optional(),
  conditions: rootConditionSchema.optional(),
  counts_toward_leaderboard: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

// Booth dan kasir ikut membaca daftar ini untuk menampilkan penawaran yang berlaku.
// Operasi tulis tetap admin saja.
export async function GET() {
  const auth = await requireUser(["admin", "booth", "cashier"]);
  if (auth.response) return auth.response;
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("special_offers").select(SELECT).order("sort_order", { ascending: true });
  if (error) return apiError("INTERNAL_ERROR", 500);

  // Jumlah klaim per penawaran: admin perlu tahu mana yang sudah terpakai sebelum
  // mengubah atau menghapusnya.
  const { data: claims } = await client.from("order_special_items").select("offer_id") as { data: Array<{ offer_id: number }> | null };
  const claimCount = new Map<number, number>();
  for (const claim of claims ?? []) claimCount.set(claim.offer_id, (claimCount.get(claim.offer_id) ?? 0) + 1);

  return Response.json({
    offers: (data ?? []).map((offer) => ({ ...(offer as { id: number }), claim_count: claimCount.get((offer as { id: number }).id) ?? 0 })),
  });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  // Constraint database menjaga hal yang sama, tapi pesan di sini jauh lebih jelas
  // untuk admin daripada error constraint mentah.
  if (parsed.data.scope === "per_booth" && !parsed.data.booth_id) {
    return apiError("VALIDATION_ERROR", 422, { message: "Penawaran per booth harus memilih booth." });
  }
  if (parsed.data.scope === "global" && parsed.data.booth_id) {
    return apiError("VALIDATION_ERROR", 422, { message: "Penawaran global tidak boleh terikat booth." });
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("special_offers").insert({
    code: parsed.data.code,
    name: parsed.data.name,
    price: parsed.data.price,
    stock: parsed.data.stock ?? null,
    scope: parsed.data.scope,
    booth_id: parsed.data.scope === "per_booth" ? parsed.data.booth_id : null,
    max_per_participant: parsed.data.max_per_participant,
    conditions: parsed.data.conditions,
    counts_toward_leaderboard: parsed.data.counts_toward_leaderboard,
    sort_order: parsed.data.sort_order,
    is_builtin: false,
    created_by: auth.user.id,
  } as never).select(SELECT).single();
  if (error) return apiError(error.code === "23505" ? "DUPLICATE_OFFER_CODE" : mapDatabaseError(error), 422);

  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "special_offer_create", payload: { new: data } } as never);
  return Response.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { id, ...changes } = parsed.data;
  if (Object.keys(changes).length === 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("special_offers").select(SELECT).eq("id", id).maybeSingle() as { data: { is_builtin: boolean; price: number } | null };
  if (!current) return apiError("OFFER_NOT_FOUND", 404);

  const { data, error } = await client.from("special_offers").update(changes as never).eq("id", id).select(SELECT).single();
  if (error) return apiError(mapDatabaseError(error), 422);

  // Penawaran builtin mencerminkan config booth; jaga agar halaman Booth tidak
  // menampilkan angka yang berbeda dari halaman Penawaran.
  if (current.is_builtin) {
    const boothChanges: Record<string, unknown> = {};
    if (changes.name !== undefined) boothChanges.discount_item_name = changes.name;
    if (changes.price !== undefined) boothChanges.discount_item_price = changes.price;
    if (changes.stock !== undefined) boothChanges.discount_item_stock = changes.stock;
    if (changes.max_per_participant !== undefined) boothChanges.discount_limit_per_participant = changes.max_per_participant;
    if (changes.is_active !== undefined) boothChanges.discount_enabled = changes.is_active;
    if (Object.keys(boothChanges).length > 0) {
      await client.from("booths").update(boothChanges as never).eq("id", (data as { booth_id: number }).booth_id);
    }
  }

  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "special_offer_update", payload: { old: current, new: data } } as never);
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("special_offers").select(SELECT).eq("id", id).maybeSingle() as { data: { is_builtin: boolean; name: string } | null };
  if (!current) return apiError("OFFER_NOT_FOUND", 404);
  // Builtin terikat config booth; dinonaktifkan saja, jangan dihapus.
  if (current.is_builtin) return apiError("OFFER_BUILTIN", 422);

  // Penawaran yang sudah diklaim harus tetap ada, kalau tidak laporan kehilangan
  // referensi harga. FK on delete restrict juga menolak; ini agar pesannya jelas.
  const { count } = await client.from("order_special_items").select("id", { count: "exact", head: true }).eq("offer_id", id);
  if ((count ?? 0) > 0) return apiError("OFFER_IN_USE", 422);

  const { error } = await client.from("special_offers").delete().eq("id", id);
  if (error) return apiError(mapDatabaseError(error), 422);

  await client.from("audit_logs").insert({ user_id: auth.user.id, action: "special_offer_delete", payload: { old: current } } as never);
  return Response.json({ deleted: id });
}
