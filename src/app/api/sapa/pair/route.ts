import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Memasang satu layar sapa ke satu jalur.
 *
 * ---- Kenapa yang mengklaim adalah PETUGAS, bukan admin ---------------------
 *
 * Perangkat lunak digital signage menaruh langkah ini di CMS: layar menampilkan
 * kode, admin mengetiknya di dasbor. Di sini pengklaimnya adalah petugas di meja
 * itu, lewat /scan.
 *
 * Alasannya siapa yang punya keterangannya. Admin di ruang kontrol tahu ada lima
 * TV; ia tidak tahu TV yang menampilkan kode 4821 itu menghadap meja yang mana.
 * Yang tahu adalah orang yang berdiri di sebelahnya — dan orang itu sudah
 * memegang ponsel yang membuka /scan dengan jalurnya sudah terpilih.
 *
 * ---- Kenapa layarnya harus masih hidup -------------------------------------
 *
 * Klaim ditolak bila layar tidak terdengar denyutnya dalam dua menit terakhir.
 * Ini yang membedakan "mengetik kode yang sedang terpampang di depan mata" dari
 * "menebak enam angka": kode dari layar yang sudah dimatikan tidak bisa lagi
 * dipakai, dan penebak tidak punya cara membuat layar korban berdenyut.
 */

const bodySchema = z.object({
  code: z.string().trim().regex(/^[0-9]{6}$/, "Kode pemasangan enam angka."),
  lane_id: z.number().int().positive(),
});

/** Dua menit, sepuluh kali lebih longgar daripada jeda denyut layar (2 detik). */
const HIDUP_MS = 2 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 422, parsed.error.flatten());

  const client = getSupabaseServiceClient();
  const eventId = auth.scope.event.id;

  const [layar, jalur] = await Promise.all([
    client
      .from("greeting_screens")
      .select("id,last_seen_at,pairing_expires_at")
      .eq("event_id", eventId)
      .eq("pairing_code", parsed.data.code)
      .maybeSingle(),
    client
      .from("attendance_lanes")
      .select("id,name,slug")
      .eq("id", parsed.data.lane_id)
      .eq("event_id", eventId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!jalur.data) {
    return apiError("VALIDATION_ERROR", 422, { message: "Jalur ini tidak ada atau sudah ditutup." });
  }

  const baris = layar.data as { id: number; last_seen_at: string; pairing_expires_at: string | null } | null;
  // Satu pesan untuk kode salah, kedaluwarsa, dan layar mati. Membedakannya
  // memberi tahu penebak mana dari enam angkanya yang sudah benar.
  const tolak = () =>
    apiError("VALIDATION_ERROR", 422, {
      message: "Kode tidak cocok, sudah dipakai, atau layarnya sedang tidak menyala. Lihat lagi angka di layar.",
    });

  if (!baris) return tolak();
  if (!baris.pairing_expires_at || new Date(baris.pairing_expires_at).getTime() < Date.now()) return tolak();
  if (Date.now() - new Date(baris.last_seen_at).getTime() > HIDUP_MS) return tolak();

  const { error } = await client
    .from("greeting_screens")
    .update({
      lane_id: parsed.data.lane_id,
      claimed_at: new Date().toISOString(),
      claimed_by: auth.user.id,
      // Kode dibuang setelah dipakai. Kode yang tetap hidup sesudahnya cukup
      // difoto sekali untuk diklaim ulang kapan saja.
      pairing_code: null,
      pairing_expires_at: null,
    } as never)
    .eq("id", baris.id)
    .eq("event_id", eventId)
    // Menyaring kodenya lagi di sini, bukan hanya id: dua petugas yang mengetik
    // kode yang sama pada detik yang sama akan sama-sama lolos pemeriksaan di
    // atas, dan yang kedua harus kalah alih-alih menimpa pemasangan yang pertama.
    .eq("pairing_code", parsed.data.code);

  if (error) return apiError("INTERNAL_ERROR", 500);

  return Response.json({ lane: jalur.data });
}
