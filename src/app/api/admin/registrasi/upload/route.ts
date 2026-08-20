import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Tautan sementara untuk membuka berkas unggahan pendaftar.
 *
 * Bucket-nya privat, jadi tidak ada URL permanen yang bisa disimpan di mana pun.
 * Tautan dibuat saat admin benar-benar menekan berkasnya, berlaku lima menit,
 * lalu mati. Konsekuensinya disengaja: tautan yang tanpa sadar tertempel di grup
 * WhatsApp panitia berhenti bekerja dengan sendirinya.
 *
 * `event_id` pada barisnya DIPERIKSA terhadap event yang sedang dibuka. Tanpa
 * itu admin event A yang menebak id berkas event B akan menerima tautannya —
 * dan berkas itu bisa berupa kartu identitas orang yang tidak ada hubungannya
 * dengan acaranya.
 */
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError("VALIDATION_ERROR", 422, { id: "Id berkas wajib diisi." });

  const client = getSupabaseServiceClient();
  const { data } = await client
    .from("registration_uploads")
    .select("storage_path,original_name,event_id")
    .eq("id", id)
    .maybeSingle();

  const row = data as unknown as { storage_path: string; original_name: string; event_id: string } | null;
  if (!row || row.event_id !== auth.scope.event.id) {
    return apiError("VALIDATION_ERROR", 404, { message: "Berkas tidak ditemukan." });
  }

  const { data: signed, error } = await client.storage
    .from("registration-uploads")
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed) return apiError("INTERNAL_ERROR", 500);

  return Response.json({ url: signed.signedUrl, name: row.original_name });
}
