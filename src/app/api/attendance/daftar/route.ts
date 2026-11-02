import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { bacaKursor, bacaStatus, ringkasPindaian, saringSetelah, tulisKursor, UKURAN_HALAMAN } from "@/lib/daftar-hadir";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Daftar "Not yet" / "Checked in" untuk satu check-in point, seluruh meja,
 * urut nama, di tab Find name layar pemindai. Untuk semua petugas scan dan
 * admin acara (keputusan Hanung 2 Nov 2026: tanpa peran "lead" terpisah).
 * Peran kustom tidak: route ini tidak tercantum di lib/auth/izin-modul.ts.
 *
 * Kolomnya sama dengan hasil Find name, yang sudah bisa dibaca setiap petugas:
 * nama, instansi, jabatan, dan status hadir. Tanpa email, telepon atau kode QR:
 * petugas butuh tahu SIAPA yang belum datang, bukan cara menghubungi atau
 * kunci masuk mereka.
 *
 * "Not yet" = peserta aktif tanpa satu pun pindaian di sesi itu; "Checked in" =
 * yang punya minimal satu. Definisinya sama dengan angka di kartu hitungan
 * (lib/attendance-progress.ts), jadi jumlah baris kedua daftar sama dengan dua
 * angka di layar.
 */
export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const sessionId = Number(params.get("session_id"));
  if (!Number.isInteger(sessionId) || sessionId <= 0) return apiError("VALIDATION_ERROR", 422, { message: "Choose a check-in point." });
  const status = bacaStatus(params.get("status"));
  const kursor = bacaKursor(params.get("after"));

  const client = getSupabaseServiceClient();
  const eventId = auth.scope.event.id;

  // Sesi harus milik acara ini. Tanpa pemeriksaan ini id sesi acara lain
  // menghasilkan daftar "Not yet" berisi seluruh peserta acara ini, yang
  // terlihat benar padahal tidak.
  const sesi = await client.from("attendance_sessions").select("id").eq("event_id", eventId).eq("id", sessionId).maybeSingle();
  if (sesi.error) return apiError("INTERNAL_ERROR", 500);
  if (!sesi.data) return apiError("VALIDATION_ERROR", 404, { message: "This check-in point no longer exists. Reload the page." });

  let kueri = client
    .from("participants")
    .select(status === "hadir" ? "id,name,company,title,attendance_scans!inner(scanned_at)" : "id,name,company,title,attendance_scans!left(id)")
    .eq("event_id", eventId)
    .is("source_removed_at", null)
    .eq("attendance_scans.session_id", sessionId)
    .eq("attendance_scans.event_id", eventId)
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    // Satu lebih banyak, supaya "masih ada lagi" dijawab tanpa kueri kedua.
    .limit(UKURAN_HALAMAN + 1);
  // Anti-join: baris peserta yang embed pindaiannya di sesi ini kosong.
  if (status === "belum") kueri = kueri.is("attendance_scans", null);
  if (kursor) kueri = kueri.or(saringSetelah(kursor));

  const { data, error } = await kueri;
  if (error) return apiError("INTERNAL_ERROR", 500);

  type Baris = { id: string; name: string; company: string | null; title: string | null; attendance_scans?: Array<{ scanned_at: string }> | null };
  const semua = (data ?? []) as unknown as Baris[];
  const halaman = semua.slice(0, UKURAN_HALAMAN);
  const terakhir = halaman.at(-1);

  return Response.json({
    rows: halaman.map((row) => ({
      id: row.id,
      name: row.name,
      company: row.company,
      title: row.title,
      ...(status === "hadir" ? ringkasPindaian(row.attendance_scans) : { scan_count: 0, first_scan_at: null }),
    })),
    next: semua.length > UKURAN_HALAMAN && terakhir ? tulisKursor({ n: terakhir.name, i: terakhir.id }) : null,
  });
}
