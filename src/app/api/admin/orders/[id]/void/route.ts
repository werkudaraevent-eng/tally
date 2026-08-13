import { z } from "zod";
import { apiError, mapDatabaseError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Void satu order dari halaman /admin/orders. HANYA super_admin.
 *
 * KENAPA ROUTE BARU, BUKAN MEMPERSEMPIT /api/orders/[id]/void
 *
 * Endpoint itu dipakai booth (src/app/booth/page.tsx) dan kasir
 * (src/app/cashier/page.tsx) untuk mengoreksi salah input di meja masing-masing.
 * Menambahkan syarat super_admin di sana akan MEMATIKAN kedua alur itu di tengah
 * acara — booth kehilangan satu-satunya jalan koreksinya, dan gejalanya baru
 * terasa saat ada yang salah ketik nominal di depan antrean.
 *
 * Jadi kewenangannya dipisah per PINTU MASUK, bukan diubah di pintu yang sudah
 * dipakai orang lain:
 *   /api/orders/[id]/void        -> booth, kasir, admin (koreksi di tempat)
 *   /api/admin/orders/[id]/void  -> super_admin saja (koreksi menyeluruh)
 *
 * Keduanya memanggil RPC yang SAMA (`void_order_transaction`), sehingga aturan
 * BR-08, pengembalian stok diskon, dan penulisan audit tidak pernah punya dua
 * versi yang bisa berbeda.
 *
 * Yang dibedakan hanya jangkauannya: dari sini order booth mana pun bisa
 * di-void, termasuk yang sudah `handed_over`, karena super_admin memang tidak
 * terikat pada satu booth.
 */

const paramsSchema = z.object({ id: z.string().uuid() });

// Alasan wajib dan minimal 3 huruf. RPC hanya menolak string kosong; "x" lolos
// di sana tapi tidak menjelaskan apa pun kepada orang yang membaca laporan
// sebulan kemudian. Karena baris void inilah satu-satunya keterangan kenapa
// sebuah nomor stiker tidak terhitung, isinya harus benar-benar berupa alasan.
const bodySchema = z.object({
  reason: z.string().trim().min(3, "Alasan void minimal 3 huruf.").max(500),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // requireUser(["super_admin"]) — eksplisit, BUKAN ["admin"].
  // Guard melebarkan "admin" agar mencakup super_admin, tetapi tidak sebaliknya.
  // Permintaan klien: hanya pemilik sistem yang boleh membatalkan transaksi dari
  // layar ini.
  const auth = await requireRequestEvent(request, ["super_admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return apiError("VALIDATION_ERROR", 422);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION_ERROR", 422, body.error.flatten());

  const client = getSupabaseServiceClient();

  // Status SEBELUM void dibaca lebih dulu agar bisa masuk ke pesan balasan.
  // "Order sudah void" dan "order tidak ditemukan" dua-duanya keluar sebagai
  // ORDER_NOT_VOIDABLE dari RPC, padahal tindak lanjutnya berbeda: yang pertama
  // berarti sudah selesai, yang kedua berarti salah baris.
  //
  // Tidak ada kode ORDER_NOT_FOUND di `ApiErrorCode` (src/lib/domain.ts), dan
  // menambah satu hanya demi ini akan menuntut pendaftaran di tiga tempat
  // (union, peta pesan, cabang mapDatabaseError) untuk perbedaan yang sudah
  // cukup dijelaskan lewat `details`.
  // Filter event ikut di pencarian ini. Tanpa itu super_admin dapat mem-void
  // order milik event LAIN hanya dengan menebak id: uangnya keluar dari
  // leaderboard dan stok event tersebut, dan RPC-nya sendiri belum mengenal event.
  const { data: before } = await client.from("orders").select("id,code,status").eq("event_id", eventId).eq("id", params.data.id).maybeSingle();
  const previous = before as { id: string; code: string; status: string } | null;
  if (!previous) {
    return apiError("ORDER_NOT_VOIDABLE", 404, { reason: ["Order tidak ditemukan. Muat ulang daftarnya."] });
  }
  if (previous.status === "void") {
    return apiError("ORDER_NOT_VOIDABLE", 409, { reason: ["Order ini sudah void sebelumnya."] });
  }

  const { data, error } = await client.rpc("void_order_transaction" as never, {
    p_event_id: eventId,
    p_order_id: params.data.id,
    p_reason: body.data.reason,
    p_user_id: auth.user.id,
    // super_admin memegang hak BR-08: order yang sudah diserahkan pun boleh
    // dibatalkan, karena refund atas barang yang sudah keluar tetap harus bisa
    // dicatat.
    p_is_admin: true,
    // null: super_admin tidak terikat satu booth, jadi tidak ada penyempitan
    // "hanya booth sendiri" seperti pada pemanggilan dari layar booth.
    p_booth_id: null,
  } as never);
  if (error) return apiError(mapDatabaseError(error), 409);

  // RPC sudah menulis audit_logs action 'void'. Baris kedua ini mencatat bahwa
  // pembatalannya dilakukan dari LAYAR ADMIN, bukan dari booth atau kasir —
  // pertanyaan "siapa yang membatalkan ini dan dari mana" tidak terjawab oleh
  // baris 'void' saja, yang bentuknya sama untuk ketiga pintu masuk.
  await client.from("audit_logs").insert({
    event_id: eventId,
    order_id: params.data.id,
    user_id: auth.user.id,
    action: "admin_order_void",
    payload: {
      old: { code: previous.code, status: previous.status },
      new: { code: previous.code, status: "void", reason: body.data.reason },
    },
  } as never);

  return Response.json({ order: data });
}
