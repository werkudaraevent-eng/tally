import { apiError } from "@/lib/api";
import { requireRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Pencarian peserta untuk layar pemindai.
 *
 * ---- Kenapa layar pemindai butuh pencarian sama sekali ---------------------
 *
 * QR adalah jalur cepat, bukan satu-satunya jalur. Baterai ponsel tamu habis,
 * badge tertinggal di mobil, lensa kamera petugas tergores, dan undangan yang
 * diteruskan lewat WhatsApp sering dibuka sebagai tangkapan layar yang buram.
 * Semua itu terjadi di tengah antrean, dan tanpa jalur kedua satu-satunya
 * penyelesaiannya adalah mengeluarkan orang dari barisan.
 *
 * ---- Kenapa mencari nama SEKALIGUS instansi --------------------------------
 *
 * Tamu acara korporat lebih sering diingat panitia sebagai "orang Astra" atau
 * "yang dari BCA" daripada dengan namanya. Menyediakan dua kolom pencarian
 * terpisah memaksa petugas memilih lebih dulu sebelum mengetik; satu kolom yang
 * menyapu nama, instansi, dan kode peserta sekaligus tidak menuntut pilihan itu.
 *
 * ---- Kenapa setiap kata dicari terpisah ------------------------------------
 *
 * "bud sant" harus menemukan "Budi Santoso", dan "sari bca" harus menemukan
 * Sari yang bekerja di BCA. Karena itu kuerinya dipecah per kata dan setiap kata
 * WAJIB cocok di salah satu kolom — bukan satu `ilike` atas seluruh kalimat,
 * yang hanya cocok bila petugas mengetik nama lengkap dengan urutan dan ejaan
 * yang persis sama dengan data.
 *
 * Beberapa panggilan `.or()` pada satu builder digabung PostgREST dengan AND,
 * sedangkan isi di dalam satu `.or()` digabung dengan OR. Itulah bentuk
 * "semua kata harus ada, masing-masing boleh di kolom mana saja".
 */

/** Berapa banyak yang dikirim balik. Lebih dari ini bukan daftar, melainkan tugas menggulir. */
const BATAS = 25;

/**
 * Kata yang dipakai untuk menyaring, dibersihkan dari karakter yang punya arti
 * di tata bahasa penyaring PostgREST.
 *
 * Koma memisahkan cabang di dalam `or=(...)`, tanda kurung membuka dan menutup
 * kelompoknya, dan `*` adalah wildcard `ilike`. Dibiarkan lewat, satu koma yang
 * diketik petugas berubah menjadi cabang penyaring tambahan — bukan lubang
 * keamanan (nilainya tidak pernah menjadi SQL), tetapi hasil pencarian yang
 * salah tanpa satu pun pesan galat.
 */
function pecahKata(mentah: string): string[] {
  return mentah
    .replace(/[,()*%\\"']/g, " ")
    .split(/\s+/)
    .map((kata) => kata.trim())
    .filter((kata) => kata.length > 0)
    .slice(0, 4)
    .map((kata) => kata.slice(0, 40));
}

type Baris = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  qr_code: string;
};

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["scanner", "admin"]);
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const mentah = (params.get("q") ?? "").trim();
  const sessionId = Number(params.get("session_id"));

  // Dua huruf, bukan satu: satu huruf cocok dengan hampir seluruh daftar peserta,
  // dan daftar sepanjang itu lebih lambat dibaca petugas daripada tidak ada
  // daftar sama sekali.
  if (mentah.length < 2) return Response.json({ results: [], truncated: false });

  const kata = pecahKata(mentah);
  if (kata.length === 0) return Response.json({ results: [], truncated: false });

  const client = getSupabaseServiceClient();

  let kueri = client
    .from("participants")
    // Kolom yang ditarik sesempit mungkin — ini kueri yang dijalankan pada
    // setiap ketukan papan ketik di hari-H.
    .select("id,name,company,title,qr_code")
    .eq("event_id", auth.scope.event.id)
    // Peserta yang dibatalkan panitia pusat tidak boleh muncul: mencatatnya
    // hadir membuat daftar hadir berbeda dari daftar peserta, dan aturan yang
    // sama sudah berlaku di `record_attendance_scan`.
    .is("source_removed_at", null)
    .order("name", { ascending: true })
    // Satu lebih banyak daripada yang dikirim, supaya "masih ada lagi" bisa
    // dijawab tanpa kueri penghitung kedua.
    .limit(BATAS + 1);

  for (const potongan of kata) {
    const pola = `%${potongan}%`;
    kueri = kueri.or(`name.ilike.${pola},company.ilike.${pola},qr_code.ilike.${pola}`);
  }

  const { data, error } = await kueri;
  if (error) return apiError("INTERNAL_ERROR", 500);

  const semua = (data ?? []) as Baris[];
  const dipotong = semua.length > BATAS;
  const baris = semua.slice(0, BATAS);

  // Status kehadiran per baris. Tanpa ini petugas tidak bisa membedakan tamu yang
  // baru datang dari tamu yang sudah lewat pintu lima menit lalu, dan satu-satunya
  // cara mengetahuinya adalah menekan "Catat hadir" untuk mencari tahu.
  const kehadiran = new Map<string, { jumlah: number; pertama: string }>();
  if (Number.isInteger(sessionId) && sessionId > 0 && baris.length > 0) {
    const { data: scans } = await client
      .from("attendance_scans")
      .select("participant_id,scanned_at")
      .eq("event_id", auth.scope.event.id)
      .eq("session_id", sessionId)
      .in("participant_id", baris.map((row) => row.id));

    for (const scan of (scans ?? []) as Array<{ participant_id: string; scanned_at: string }>) {
      const sebelumnya = kehadiran.get(scan.participant_id);
      kehadiran.set(scan.participant_id, {
        jumlah: (sebelumnya?.jumlah ?? 0) + 1,
        pertama: sebelumnya && sebelumnya.pertama < scan.scanned_at ? sebelumnya.pertama : scan.scanned_at,
      });
    }
  }

  // Urutan hasil ditentukan di sini, bukan oleh database.
  //
  // `order by name` saja menaruh "Ahmad Budiman" di atas "Budi Santoso" ketika
  // yang diketik adalah "budi" — jawaban yang paling mungkin benar terkubur di
  // tengah daftar. Yang cocok persis pada kode peserta naik paling atas, disusul
  // nama yang DIAWALI kuerinya, baru sisanya.
  const kueriKecil = mentah.toLowerCase();
  const peringkat = (row: Baris) => {
    if (row.qr_code.toLowerCase() === kueriKecil) return 0;
    if (row.name.toLowerCase().startsWith(kueriKecil)) return 1;
    if (row.name.toLowerCase().includes(kueriKecil)) return 2;
    return 3;
  };

  const hasil = baris
    .map((row) => ({
      ...row,
      scan_count: kehadiran.get(row.id)?.jumlah ?? 0,
      first_scan_at: kehadiran.get(row.id)?.pertama ?? null,
    }))
    .sort((a, b) => peringkat(a) - peringkat(b) || a.name.localeCompare(b.name, "id"));

  return Response.json({ results: hasil, truncated: dipotong });
}
