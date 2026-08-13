import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// Arsipkan hasil undian yang belum bersesi.
//
// -------------------------------------------------------------------------
// MASALAH YANG DISELESAIKAN
// -------------------------------------------------------------------------
// Pemenang yang diundi SEBELUM fitur sesi ada punya `session_id = null`. Aturan
// "sudah pernah menang" memperlakukan baris tanpa sesi sebagai masih berlaku —
// itu memang benar, karena tidak ada dasar untuk menganggapnya sudah diarsipkan.
//
// Akibatnya mereka terjebak: tidak ada sesi yang bisa ditutup, sehingga sepuluh
// orang itu tidak akan pernah kembali masuk kolam. Satu-satunya jalan keluar
// adalah menghapus barisnya lewat SQL, dan itu berarti membuang catatan siapa
// membawa pulang hadiah apa.
//
// Penyelesaiannya: bungkus hasil lama ke dalam sebuah sesi, lalu tutup sesi itu.
// Setelah ini tidak ada lagi keadaan khusus — hasil lama menjadi sesi tertutup
// biasa yang tetap tampil di riwayat dan tetap bisa diekspor, dan pemenangnya
// kembali bisa ikut undian berikutnya.
//
// Sekali pakai secara alami: setelah dijalankan tidak ada lagi baris tanpa sesi,
// jadi pemanggilan berikutnya menemukan nol baris dan ditolak.

export async function POST(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;
  const eventId = auth.scope.event.id;

  const client = getSupabaseServiceClient();

  // SETIAP query di handler ini WAJIB difilter event.
  //
  // Yang paling berbahaya adalah `update ... .is("session_id", null)` di bawah:
  // tanpa filter event ia menulis ulang pemenang tanpa sesi milik SELURUH event
  // ke dalam satu sesi milik satu event. Catatan serah terima hadiah event lain
  // ikut berpindah, tanpa satu pun galat, dan tidak ada jalan mengembalikannya
  // selain menebak baris mana yang tadinya milik siapa.
  const { count } = await client
    .from("undian_winners")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .is("session_id", null);
  if ((count ?? 0) === 0) {
    return apiError("VALIDATION_ERROR", 422, { form: ["Tidak ada hasil undian yang belum bersesi."] });
  }

  // Rentang waktunya dipakai sebagai nama, supaya sesi ini bisa dikenali di
  // riwayat tanpa perlu dibuka. "Hasil sebelum sesi" sendirian tidak memberi tahu
  // apa pun tentang kapan undian itu terjadi.
  const { data: bounds } = await client
    .from("undian_winners")
    .select("drawn_at")
    .eq("event_id", eventId)
    .is("session_id", null)
    .order("drawn_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const firstDraw = (bounds as { drawn_at?: string } | null)?.drawn_at ?? new Date().toISOString();
  const dateLabel = new Date(firstDraw).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric",
  });

  const now = new Date().toISOString();

  // Sesi dibuat LANGSUNG berstatus 'closed'.
  //
  // Membuatnya aktif lebih dulu akan bertabrakan dengan unique index sesi aktif
  // tunggal bila panitia sudah memulai sesi baru — dan lagi pula sesi ini memang
  // tidak pernah "berjalan": ia hanya wadah untuk hasil yang sudah lewat.
  const { data: session, error: sessionError } = await client
    .from("undian_sessions")
    .insert({
      event_id: eventId,
      name: `Hasil sebelum sesi (${dateLabel})`,
      note: "Dibuat otomatis untuk menampung hasil undian yang diundi sebelum fitur sesi ada.",
      status: "closed",
      started_at: firstDraw,
      closed_at: now,
      closed_by: auth.user.id,
      created_by: auth.user.id,
    } as never)
    .select("id,name,note,status,started_at,closed_at")
    .single();
  if (sessionError || !session) return apiError("INTERNAL_ERROR", 500);

  const sessionId = (session as { id: number }).id;
  const { error: linkError } = await client
    .from("undian_winners")
    .update({ session_id: sessionId } as never)
    .eq("event_id", eventId)
    .is("session_id", null);
  if (linkError) {
    // Sesi kosong adalah jebakan: ia muncul di riwayat tanpa isi dan tidak jelas
    // apa gunanya. Lebih baik dibatalkan seluruhnya.
    await client.from("undian_sessions").delete().eq("event_id", eventId).eq("id", sessionId);
    return apiError("INTERNAL_ERROR", 500);
  }

  await client.from("audit_logs").insert({
    event_id: eventId,
    user_id: auth.user.id,
    action: "undian_session_adopt",
    payload: { old: null, new: { session, adopted_winners: count } },
  } as never);

  return Response.json({ ...(session as object), adopted_winners: count ?? 0 });
}
