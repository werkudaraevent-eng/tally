import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Tukar kode gabung dengan slug acara. Publik, tanpa login.
 *
 * Balasannya HANYA slug — bukan nama acara, tanggal, atau apa pun yang lain.
 * Alamat ini dapat dicoba siapa saja dengan angka acak, dan slug memang sudah
 * publik (ia ada di setiap tautan acara). Menambahkan detail lain berarti
 * mengubah tebakan tujuh digit menjadi cara memetakan daftar acara klien.
 *
 * Acara ARSIP ditolak. Kodenya sengaja tidak dihapus saat diarsipkan supaya
 * acara yang dihidupkan lagi tidak kehilangan jalur ini, tetapi selama
 * diarsipkan ia tidak boleh menerima peserta baru.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("code") ?? "";
  // Spasi dan tanda hubung dibuang: kode dipajang berkelompok ("937 1226") dan
  // peserta akan mengetiknya persis seperti yang terlihat di layar.
  const code = raw.replace(/[^0-9]/g, "");
  if (code.length !== 7) return apiError("VALIDATION_ERROR", 422, { message: "Kode acara terdiri dari 7 angka." });

  const { data } = await getSupabaseServiceClient()
    .from("events").select("slug,status").eq("join_code", code).maybeSingle();

  const event = data as { slug: string; status: string } | null;
  if (!event || event.status === "archived") {
    return apiError("VALIDATION_ERROR", 404, { message: "Kode tidak ditemukan. Periksa lagi angka di layar." });
  }

  return Response.json({ slug: event.slug }, { headers: { "Cache-Control": "no-store" } });
}
