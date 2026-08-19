import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

const paramsSchema = z.string().uuid();
// Slug, bukan boolean `confirm: true`. Yang dicegah bukan "menekan tanpa
// membaca" melainkan "menekan pada BARIS YANG SALAH": daftar event memuat
// beberapa kartu berdampingan, dan tombol hapus di kartu tetangga terlihat
// persis sama. Slug yang harus diketik ulang hanya cocok untuk satu baris.
const deleteSchema = z.object({ confirm_slug: z.string().trim().min(1) });
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

/**
 * Hapus event permanen, beserta seluruh data anaknya.
 *
 * Satu-satunya operasi tak-terbalik di berkas ini, karena itu penjaganya
 * berlapis dan masing-masing menutup kegagalan yang berbeda:
 *
 *   - `super_admin` saja. Sejajar dengan reset data dan kelola user (BR-17):
 *     tiga kewenangan yang tidak dibutuhkan klien untuk menjalankan acara.
 *   - `confirm_slug` harus cocok. Menutup salah baris, bukan salah niat.
 *   - status dan nol order ditegakkan DI DALAM `delete_event`, bukan di sini.
 *     Diperiksa di route, hitungannya sudah basi pada saat penghapusan berjalan;
 *     di dalam fungsi, penjaga dan penghapusan berada di transaksi yang sama.
 *
 * Yang TIDAK dilakukan: mengarsipkan otomatis sebagai gantinya ketika penjaga
 * menolak. Aksi yang diam-diam berubah jadi aksi lain adalah cara tercepat
 * kehilangan kepercayaan pada tombol yang tidak dapat dibatalkan.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["super_admin"]);
  if (auth.response) return auth.response;
  const id = paramsSchema.safeParse((await context.params).id);
  const body = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) return apiError("VALIDATION_ERROR", 422);

  const client = getSupabaseServiceClient();
  const { data: current } = await client.from("events").select("slug,name,status").eq("id", id.data).maybeSingle();
  if (!current) return apiError("VALIDATION_ERROR", 404, { message: "Event tidak ditemukan. Muat ulang daftarnya." });

  const event = current as { slug: string; name: string; status: string };
  if (body.data.confirm_slug !== event.slug) {
    // Slug yang benar disebutkan kembali: yang gagal di sini hampir selalu salah
    // ketik, dan menyembunyikan nilai yang diharapkan tidak melindungi apa pun —
    // slug-nya sudah tampil di kartu event, di URL, dan di dialognya sendiri.
    return apiError("VALIDATION_ERROR", 422, {
      message: `Ketik slug event persis seperti tertulis: ${event.slug}`,
    });
  }

  const { data, error } = await client.rpc("delete_event" as never, {
    p_event_id: id.data,
    p_actor: auth.user.id,
  } as never);
  if (error) {
    // Balapan: event yang sudah dihapus admin lain di antara pembacaan di atas
    // dan panggilan ini. Dijawab 404 dengan saran yang sama seperti di PATCH.
    if ((error.message ?? "").includes("EVENT_NOT_FOUND")) {
      return apiError("VALIDATION_ERROR", 404, { message: "Event tidak ditemukan. Muat ulang daftarnya." });
    }
    const code = mapDatabaseError(error);
    return apiError(code, code === "INTERNAL_ERROR" ? 500 : 422);
  }

  return Response.json(data);
}
