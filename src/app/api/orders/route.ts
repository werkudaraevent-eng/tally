import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth/guards";
import { canUseBooth } from "@/lib/auth/roles";

// Batas atas nominal item reguler.
//
// Tanpa batas ini, nominal 12 digit lolos validasi lalu ditolak Postgres dengan
// SQLSTATE 22003 ("value out of range for type integer") — pesan yang tidak
// dikenali `mapDatabaseError` sehingga staf booth membaca "Terjadi kesalahan
// server. Coba lagi." untuk kesalahan yang sepenuhnya ada di kolom isian.
//
// Angkanya Rp 2 miliar, bukan int4 max (2.147.483.647). Menyisakan ruang di bawah
// batas tipe supaya `regular_amount + harga item spesial` tidak dapat melampauinya
// pada penjumlahan di dalam RPC — nominal yang sah sendiri tetapi menjadi tidak sah
// setelah item ditambahkan adalah kegagalan yang paling sulit dijelaskan ke staf.
const MAX_ORDER_AMOUNT = 2_000_000_000;

const bodySchema = z.object({
  order_code: z.string().trim().min(1).max(20),
  participant_id: z.string().uuid(),
  booth_id: z.number().int().positive(),
  has_discount_item: z.boolean(),
  regular_amount: z.number().int().min(0).max(MAX_ORDER_AMOUNT),
  note: z.string().max(500).optional(),
  created_by: z.string().uuid().nullable().optional(),
  // Kode penawaran spesial yang diklaim. Dibiarkan opsional supaya pemanggil lama
  // (hanya has_discount_item) tetap bekerja: RPC menerjemahkannya ke penawaran
  // bawaan booth. Kuota, stok, syarat akumulasi, dan harga divalidasi di RPC.
  offer_codes: z.array(z.string().trim().regex(/^[a-z0-9_]{2,40}$/)).max(10).optional(),
});

export async function POST(request: Request) {
  const auth = await requireUser(["booth", "admin"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());
  if (!canUseBooth(auth.user, parsed.data.booth_id)) return apiError("FORBIDDEN", 403);
  const { data, error } = await getSupabaseServiceClient().rpc("create_order_transaction" as never, {
    p_code: parsed.data.order_code,
    p_participant_id: parsed.data.participant_id,
    p_booth_id: parsed.data.booth_id,
    p_has_discount_item: parsed.data.has_discount_item,
    p_regular_amount: parsed.data.regular_amount,
    p_note: parsed.data.note ?? null,
    p_created_by: auth.user.id,
    p_offer_codes: parsed.data.offer_codes ?? null,
  } as never);
  if (error) {
    const code = mapDatabaseError(error);
    return apiError(code, code === "DISCOUNT_ALREADY_TAKEN" || code === "ORDER_CODE_USED" ? 409 : 422);
  }
  await getSupabaseServiceClient().from("audit_logs").insert({ order_id: (data as { id?: string } | null)?.id ?? null, user_id: auth.user.id, action: "booth_order_created", payload: { booth_id: parsed.data.booth_id, participant_id: parsed.data.participant_id, has_discount_item: parsed.data.has_discount_item, offer_codes: parsed.data.offer_codes ?? null } } as never);
  return Response.json({ order: data }, { status: 201 });
}
