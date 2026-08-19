import { apiError } from "@/lib/api";
import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Pencarian nama peserta untuk mode "pilih nama dari daftar".
 *
 * ENDPOINT PUBLIK YANG MENGEKSPOS NAMA ORANG. Tiga pembatas dipasang sengaja,
 * dan ketiganya perlu:
 *
 *   1. WAJIB minimal tiga huruf. Tanpa itu, satu permintaan berisi spasi
 *      memulangkan seluruh daftar peserta acara kepada siapa pun yang tahu
 *      alamatnya — daftar tamu klien, terbuka di internet.
 *   2. Maksimal sepuluh hasil. Menyalin seluruh daftar tetap mungkin dengan
 *      menebak huruf satu per satu, tetapi butuh ratusan permintaan alih-alih
 *      satu, dan itu terlihat di log.
 *   3. Hanya aktif bila pertanyaan yang SEDANG TAYANG memakai mode ini. Di luar
 *      itu endpoint menolak, sehingga daftar tamu tidak terbuka sepanjang acara
 *      hanya karena satu pertanyaan pernah memakainya.
 *
 * Kode QR TIDAK ikut dikirim. Yang keluar hanya id, nama, dan perusahaan —
 * cukup untuk memilih diri sendiri, tidak cukup untuk memakai badge orang lain
 * di mode `participant_code`.
 */
export async function GET(request: Request) {
  const event = await getPublicRequestEvent(request);
  if (!event) return apiError("VALIDATION_ERROR", 404, { message: "Acara tidak ditemukan." });

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 3) return Response.json({ participants: [] }, { headers: { "Cache-Control": "no-store" } });

  const client = getSupabaseServiceClient();

  const { data: state } = await client
    .from("vote_state").select("active_poll_id").eq("event_id", event.id).maybeSingle();
  const activeId = (state as { active_poll_id: number | null } | null)?.active_poll_id ?? null;
  if (!activeId) return apiError("VOTE_POLL_NOT_FOUND", 404);

  const { data: poll } = await client
    .from("vote_polls").select("voter_mode,status").eq("id", activeId).eq("event_id", event.id).maybeSingle();
  const row = poll as { voter_mode: string; status: string } | null;
  if (!row || row.voter_mode !== "participant_pick" || row.status !== "open") {
    return apiError("VOTE_POLL_NOT_FOUND", 404);
  }

  // `%` dan `_` di masukan pengguna adalah wildcard bagi ILIKE. Tanpa dilepas,
  // pencarian "%" memulangkan sepuluh nama pertama tanpa mengetik apa pun —
  // meniadakan pembatas nomor satu di atas.
  const safe = query.replace(/[%_\\]/g, (match) => `\\${match}`);

  const { data } = await client
    .from("participants")
    .select("id,name,company")
    .eq("event_id", event.id)
    .is("source_removed_at", null)
    .ilike("name", `%${safe}%`)
    .order("name", { ascending: true })
    .limit(10);

  return Response.json({ participants: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
