import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireRequestEvent } from "@/lib/auth/request-event";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ reason: z.string().trim().min(1).max(500), user_id: z.string().uuid().nullable().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // Booth ikut diizinkan karena saat konfirmasi kasir dimatikan, order langsung
  // final dan booth tidak punya jalan koreksi lain untuk salah input. Batasannya
  // ditegakkan di RPC: booth hanya boleh void order miliknya sendiri yang
  // auto_settled. Order alur kasir tetap mengikuti BR-08.
  const auth = await requireRequestEvent(request, ["booth", "cashier", "admin"]);
  if (auth.response) return auth.response;
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return apiError("VALIDATION_ERROR", 422, body.success ? undefined : body.error.flatten());
  const { role, boothId, event } = auth.scope;
  if (role === "booth" && boothId === null) return apiError("FORBIDDEN", 403);

  // Order id datang dari klien, jadi kepemilikan event WAJIB diperiksa lebih
  // dulu. Tanpa ini operator event A dapat mem-void order event B hanya dengan
  // menebak id -- RPC-nya sendiri belum mengenal event.
  const client = getSupabaseServiceClient();
  const { data: owned } = await client.from("orders").select("id").eq("event_id", event.id).eq("id", params.data.id).maybeSingle();
  if (!owned) return apiError("ORDER_NOT_VOIDABLE", 404, { reason: "Order tidak ada di event ini." });

  const { data, error } = await client.rpc("void_order_transaction" as never, {
    p_order_id: params.data.id,
    p_reason: body.data.reason,
    p_user_id: auth.user.id,
    // Peran DI EVENT INI, bukan users.role: satu orang bisa admin di satu event
    // dan kasir di event lain. super_admin tetap mewarisi hak BR-08.
    p_is_admin: role === "admin" || role === "super_admin",
    p_booth_id: role === "booth" ? boothId : null,
  } as never);
  if (error) return apiError(mapDatabaseError(error), 409);
  return Response.json({ order: data });
}
