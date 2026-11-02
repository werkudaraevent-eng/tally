import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { bacaKursor, bacaStatus, ringkasPindaian, saringSetelah, tulisKursor, UKURAN_HALAMAN } from "@/lib/daftar-hadir";

/** Peserta per baca. Daftar id-nya juga menjadi `.in()` pindaian: 100 orang tetap jauh di bawah batas 1.000 baris pindaian, juga bila ada pindaian ulang. */
const POTONGAN = 100;
/** Paling banyak 20 x 100 = 2.000 peserta diperiksa per permintaan; sisanya lewat "Show more". */
const MAKS_PUTARAN = 20;
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

  // Dua langkah sederhana, bukan anti-join PostgREST (embed !left + is.null):
  // peserta dibaca per potongan urut nama, lalu pindaian sesi ini untuk id
  // potongan itu, dan disaring di sini. Hanya fitur dasar PostgREST yang
  // dipakai, dan batas 1.000 baris tidak pernah tersentuh.
  type Baris = { id: string; name: string; company: string | null; title: string | null };
  const hasil: Array<Baris & { scan_count: number; first_scan_at: string | null }> = [];
  let posisi = kursor;
  let habis = false;
  for (let putaran = 0; putaran < MAKS_PUTARAN && hasil.length < UKURAN_HALAMAN && !habis; putaran++) {
    let kueri = client
      .from("participants")
      .select("id,name,company,title")
      .eq("event_id", eventId)
      .is("source_removed_at", null)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .limit(POTONGAN);
    if (posisi) kueri = kueri.or(saringSetelah(posisi));
    const { data, error } = await kueri;
    if (error) return apiError("INTERNAL_ERROR", 500);
    const potongan = (data ?? []) as Baris[];
    if (potongan.length < POTONGAN) habis = true;
    if (potongan.length === 0) break;

    const scans = await client
      .from("attendance_scans")
      .select("participant_id,scanned_at")
      .eq("event_id", eventId)
      .eq("session_id", sessionId)
      .in("participant_id", potongan.map((row) => row.id));
    if (scans.error) return apiError("INTERNAL_ERROR", 500);
    const perOrang = new Map<string, Array<{ scanned_at: string }>>();
    for (const scan of (scans.data ?? []) as Array<{ participant_id: string; scanned_at: string }>) {
      perOrang.set(scan.participant_id, [...(perOrang.get(scan.participant_id) ?? []), scan]);
    }

    for (const row of potongan) {
      posisi = { n: row.name, i: row.id };
      const ringkas = ringkasPindaian(perOrang.get(row.id));
      if ((status === "hadir") === (ringkas.scan_count > 0)) {
        hasil.push({ ...row, ...ringkas });
        if (hasil.length === UKURAN_HALAMAN) {
          // Berhenti tepat di orang ke-50; sisa potongan dibaca lagi di
          // halaman berikutnya mulai dari sesudah orang ini.
          if (row !== potongan.at(-1)) habis = false;
          break;
        }
      }
    }
  }

  return Response.json({
    rows: hasil,
    // Kursor = orang terakhir yang DIPERIKSA, bukan yang ditampilkan: tanpa itu
    // halaman berikutnya memeriksa ulang orang yang sudah dilewati.
    next: !habis && posisi ? tulisKursor(posisi) : null,
  });
}
