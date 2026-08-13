// Daftar booth aktif untuk layar publik.
//
// Modul TERPISAH dari `display-config.ts` karena mengimpor service client
// Supabase, dan `display-config.ts` wajib bebas impor server-only: ia ikut
// terbawa ke bundel browser lewat komponen layar.
//
// Kenapa ada sama sekali: jumlah booth dulu ditulis mati sebagai 6 di empat
// tempat pada `display-client.tsx`. Panitia menambah booth sampai sembilan dan
// papan proyektor tetap menggambar enam titik, sehingga peserta yang sudah
// keliling sembilan booth terlihat baru enam. Tidak ada yang mengubah apa pun;
// angkanya memang tidak pernah ikut data.

import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Kode booth yang aktif, urut nomor.
 *
 * Definisi "aktif" disamakan dengan `get_participant_by_qr`, yang memakai
 * `count(*) from booths where is_active` sebagai penyebut progress di layar
 * booth. Kalau kedua layar memakai definisi berbeda, staf booth dan penonton
 * membaca dua penyebut untuk peserta yang sama.
 *
 * Booth tanpa transaksi TETAP dihitung. Ia tetap satu perhentian yang harus
 * didatangi peserta, dan order di sana tetap menaikkan `booth_count` pada
 * `get_leaderboard` — mengecualikannya di sini akan membuat pembilang bisa
 * melebihi penyebut.
 *
 * Mengembalikan array kosong bila gagal: layar menyembunyikan panel progress,
 * yang jauh lebih baik daripada memajang penyebut yang ditebak.
 *
 * `eventId` WAJIB. Dulu opsional, dan tanpa itu kueri menghitung booth SEMUA
 * event sekaligus: penyebut progress ikut membengkak setiap kali event baru
 * dibuat, di layar yang sedang ditonton. Pemanggil yang lupa mengisinya kini
 * gagal saat kompilasi, bukan saat acara berlangsung.
 */
export async function loadActiveBoothCodes(eventId: string): Promise<string[]> {
  try {
    const { data, error } = await getSupabaseServiceClient()
      .from("booths")
      .select("code")
      .eq("is_active", true)
      .eq("event_id", eventId)
      .order("id", { ascending: true });
    if (error || !data) return [];
    return (data as Array<{ code: string }>).map((row) => row.code);
  } catch {
    return [];
  }
}
