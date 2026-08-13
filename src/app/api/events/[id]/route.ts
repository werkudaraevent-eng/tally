import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const paramsSchema = z.string().uuid();
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("deactivate") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("archive") }),
]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("events").select("*").eq("id", id.data).maybeSingle();
  // INTERNAL_ERROR di sini berbunyi "Terjadi kesalahan server. Coba lagi." --
  // saran yang tidak akan pernah berhasil untuk event yang memang tidak ada.
  // Tidak ada kode NOT_FOUND generik di ApiErrorCode, jadi perbedaannya dibawa
  // lewat `details` daripada mendaftarkan kode baru di tiga tempat.
  if (!current) return apiError("VALIDATION_ERROR", 404, { message: "Event tidak ditemukan. Muat ulang daftarnya." });

  if (body.data.action === "activate") {
    const [{ count: booths }, { count: settings }] = await Promise.all([
      client.from("booths").select("id", { head: true, count: "exact" }).eq("event_id", id.data).eq("is_active", true),
      client.from("event_settings").select("id", { head: true, count: "exact" }).eq("event_id", id.data),
    ]);
    // Dua syarat DIPISAH pesannya. Digabung, panitia yang sudah punya booth
    // tetap membaca "perlu booth" dan menambah booth kedua yang tidak
    // menyelesaikan apa pun -- lalu menyerah tanpa tahu apa yang kurang.
    const kurang: string[] = [];
    if ((booths ?? 0) === 0) kurang.push("Belum ada booth aktif. Tambahkan minimal satu di Kelola booth.");
    if ((settings ?? 0) !== 1) kurang.push("Baris pengaturan event belum ada. Buka Pengaturan sekali untuk membuatnya.");
    if (kurang.length > 0) return apiError("VALIDATION_ERROR", 422, { message: kurang.join(" ") });
  }

  // Menyelesaikan atau mengarsipkan event yang masih punya order pending
  // meninggalkan uang yang belum jelas statusnya: order itu tidak akan pernah
  // dilunasi kasir (layarnya sudah ditutup) dan tidak akan pernah di-void.
  if (body.data.action === "complete" || body.data.action === "archive") {
    const { count: pending } = await client
      .from("orders")
      .select("id", { head: true, count: "exact" })
      .eq("event_id", id.data)
      .eq("status", "pending");
    if ((pending ?? 0) > 0) {
      return apiError("VALIDATION_ERROR", 422, {
        message: `Masih ada ${pending} order pending. Selesaikan atau batalkan dulu di Kasir sebelum menutup event.`,
      });
    }
  }

  const now = new Date().toISOString();
  const update = body.data.action === "archive"
    ? { status: "archived", archived_at: now, archived_by: auth.user.id, updated_at: now }
    : { status: body.data.action === "deactivate" ? "draft" : body.data.action === "complete" ? "completed" : "active", archived_at: null, archived_by: null, updated_at: now };
  const { data, error } = await client.from("events").update(update as never).eq("id", id.data).select().single();
  if (error) return apiError("INTERNAL_ERROR", 500);
  await client.from("audit_logs").insert({ event_id: id.data, user_id: auth.user.id, action: `event_${body.data.action}`, payload: { old: current, new: data } } as never);
  return Response.json({ event: data });
}
