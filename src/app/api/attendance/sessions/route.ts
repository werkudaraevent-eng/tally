import { requireRequestEvent } from "@/lib/auth/request-event";
import { apiError } from "@/lib/api";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Daftar sesi kehadiran untuk layar pemindai.
 *
 * Terpisah dari endpoint CMS karena pembacanya berbeda: layar pemindai dipegang
 * petugas dengan akun paling sempit di sistem, dan ia hanya boleh melihat sesi
 * yang sedang DIBUKA — bukan seluruh sesi acara.
 *
 * Sesi yang ditutup TIDAK dikirim. Petugas yang melihatnya di pemilih akan
 * memilihnya, lalu setiap pemindaian ditolak satu per satu di depan antrean.
 *
 * Angka hadir ikut dikirim meski akunnya paling sempit. Ia bukan keterangan baru
 * bagi petugas — `record_attendance_scan` sudah mengembalikannya pada setiap
 * pemindaian — dan tanpa ia dikirim di sini, panel "berapa yang sudah masuk"
 * kosong sampai orang pertama dipindai, tepat di menit-menit ketika panitia
 * paling sering menanyakannya.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const client = getSupabaseServiceClient();
  const eventId = auth.scope.event.id;

  const [sesi, jalur, scans] = await Promise.all([
    client
      .from("attendance_sessions")
      .select("id,name,slug,sort_order")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    // Jalur ikut di response yang sama, bukan endpoint kedua. Layar pemindai
    // memuat keduanya sekaligus saat dibuka, dan permintaan kedua di jaringan
    // venue yang padat adalah kesempatan kedua untuk gagal sebelum satu tamu pun
    // dipindai.
    client
      .from("attendance_lanes")
      .select("id,name,slug,sort_order")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    // Dua kolom saja: tabel ini yang tumbuh paling cepat di hari-H, dan yang
    // dibutuhkan di sini hanya menghitung orang unik per sesi.
    client.from("attendance_scans").select("session_id,participant_id").eq("event_id", eventId),
  ]);

  if (sesi.error) return apiError("INTERNAL_ERROR", 500);

  // Peserta UNIK, bukan jumlah baris. Tabel scan menyimpan setiap pemindaian
  // termasuk yang berulang — itu yang membuat "jam berapa dia kembali" bisa
  // dijawab — tetapi "berapa orang yang hadir" harus menghitung orang.
  const unik = new Map<number, Set<string>>();
  for (const scan of (scans.data ?? []) as Array<{ session_id: number; participant_id: string }>) {
    if (!unik.has(scan.session_id)) unik.set(scan.session_id, new Set());
    unik.get(scan.session_id)!.add(scan.participant_id);
  }

  return Response.json({
    sessions: ((sesi.data ?? []) as Array<{ id: number }>).map((row) => ({
      ...row,
      hadir: unik.get(row.id)?.size ?? 0,
    })),
    lanes: jalur.data ?? [],
    event: { name: auth.scope.event.name, slug: auth.scope.event.slug },
    user: { username: auth.user.username },
  });
}
