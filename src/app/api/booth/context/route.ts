import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["booth", "admin"]);
  if (auth.response) return auth.response;

  const client = getSupabaseServiceClient();

  // Operator booth: booth-nya sudah melekat pada akun. Admin/super_admin: TIDAK
  // ditebak.
  //
  // Sebelum ini admin tanpa booth diberi "booth aktif pertama urut id" sebagai
  // default kerja. Akibatnya layar booth terbuka atas nama B1 tanpa satu pun
  // tindakan memilih, dan admin yang mengira sedang menolong booth lain mencatat
  // order ke B1 — nominal uang orang masuk ke booth yang salah, dan tidak ada
  // jejak yang membedakannya dari order sah.
  //
  // Sekarang admin menerima daftar booth dan harus menyebut `?boothId=`. Tanpa
  // itu jawabannya `booth: null` (bukan galat): layar menampilkan pemilih, bukan
  // pesan kesalahan.
  const isAdmin = auth.scope.role !== "booth";
  const requestedBoothId = Number(new URL(request.url).searchParams.get("boothId"));
  const boothId = auth.scope.boothId ?? (isAdmin && Number.isSafeInteger(requestedBoothId) && requestedBoothId > 0 ? requestedBoothId : null);

  // Hanya booth aktif yang boleh dipilih; booth nonaktif tetap dapat dibuka lewat
  // boothId langsung supaya riwayatnya masih bisa dilihat.
  const { data: boothOptions } = isAdmin
    ? await client.from("booths").select("id,code,name").eq("event_id", auth.scope.event.id).eq("is_active", true).order("id", { ascending: true }) as { data: Array<{ id: number; code: string; name: string }> | null }
    : { data: null };
  const booths = boothOptions ?? [];

  if (!boothId) {
    if (!isAdmin) return apiError("BOOTH_NOT_FOUND", 404);
    return Response.json({ booth: null, booths, operator: { username: auth.user.username, role: auth.scope.role }, next_sticker: null });
  }

  // `transactions_enabled` dikirim ke layar operator supaya kolom nominal dan teks
  // aksinya menyesuaikan sifat booth. Penegakannya tetap di
  // `create_order_transaction`, bukan di sini: layar hanya menyembunyikan kolom,
  // sedangkan yang menolak nominal adalah database.
  const { data: booth, error } = await client.from("booths").select("id,code,name,discount_item_name,discount_item_stock,is_active,transactions_enabled").eq("event_id", auth.scope.event.id).eq("id", boothId).single() as { data: { id: number; code: string; name: string; discount_item_name: string; discount_item_stock: number | null; is_active: boolean; transactions_enabled: boolean } | null; error: unknown };
  if (error || !booth) return apiError("BOOTH_NOT_FOUND", 404);

  // Suggest the next sticker number by continuing from the highest used code at this booth.
  const { data: codes } = await client.from("orders").select("code").eq("event_id", auth.scope.event.id).eq("booth_id", boothId) as { data: Array<{ code: string }> | null };
  const prefix = `${booth.code}-`;
  const highest = (codes ?? []).reduce((max, row) => {
    if (!row.code.startsWith(prefix)) return max;
    const value = Number.parseInt(row.code.slice(prefix.length), 10);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
  const nextSticker = String(highest + 1).padStart(3, "0");

  return Response.json({
    booth,
    booths,
    operator: { username: auth.user.username, role: auth.scope.role },
    next_sticker: nextSticker,
  });
}
