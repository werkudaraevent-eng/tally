import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Kode booth tidak dipatok pola B1/B2/B3. Panitia memakai singkatan sendiri
// seperti PH, dan memaksa pola bernomor membuat kode di aplikasi berbeda dengan
// kode yang tertempel di booth.
//
// Tanda hubung sengaja dilarang: kode order dibentuk sebagai
// `<kode booth>-<nomor 3 digit>` lalu dibaca kembali dengan memotong di tanda
// hubung (lihat /api/booth/context). Kode booth yang memuat tanda hubung membuat
// pembacaan nomor stiker menjadi ambigu.
//
// Aturan yang sama juga dijaga di database lewat constraint `booths_code_format`
// dan pada `create_order_transaction`, karena booth bisa berubah lewat jalur lain
// dan format yang salah baru terasa akibatnya saat staf gagal membuat order.
const boothCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{0,7}$/, "Kode booth 1-8 karakter, dimulai huruf, tanpa spasi atau tanda hubung.");

const boothSchema = z.object({ id: z.number().int().positive().nullable().optional(), code: boothCode, name: z.string().trim().min(1).max(100), discount_item_name: z.string().trim().min(1).max(200), discount_item_stock: z.number().int().min(0).nullable(), is_active: z.boolean(), discount_enabled: z.boolean(), discount_limit_per_participant: z.number().int().min(0).max(20) });

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const { data, error } = await getSupabaseServiceClient().from("booths").select("id,code,name,discount_item_name,discount_item_price,discount_item_stock,is_active,discount_enabled,discount_limit_per_participant").order("id");
  if (error) return apiError("INTERNAL_ERROR", 500);
  return Response.json({ booths: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.response) return auth.response;
  const parsed = boothSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  const { data, error } = await getSupabaseServiceClient().rpc("admin_upsert_booth" as never, { p_id: parsed.data.id ?? null, p_code: parsed.data.code, p_name: parsed.data.name, p_discount_item_name: parsed.data.discount_item_name, p_discount_item_stock: parsed.data.discount_item_stock, p_is_active: parsed.data.is_active, p_discount_enabled: parsed.data.discount_enabled, p_discount_limit_per_participant: parsed.data.discount_limit_per_participant } as never);
  if (error) return apiError(mapDatabaseError(error), 409);
  await getSupabaseServiceClient().from("audit_logs").insert({ user_id: auth.user.id, action: parsed.data.id ? "booth_update" : "booth_create", payload: { booth: data } } as never);
  return Response.json({ booth: data });
}
