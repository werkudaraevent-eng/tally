import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Angka "hadir dari terdaftar" untuk layar pemindai, seluruh meja sekaligus.
 *
 * Hanya hitungan (`head: true`), tidak satu baris pun dibaca. Dua alasan:
 * pembacanya akun Scanner, yang tidak boleh menerima nama atau kode siapa pun
 * lewat jalur ini; dan pembacaan tabel Supabase berhenti di 1.000 baris, jadi
 * menghitung orang unik dari baris scan di JavaScript salah begitu pindaian
 * sesi lewat seribu (yang dulu terjadi di /api/attendance/sessions).
 *
 * "Hadir" = peserta aktif yang punya minimal satu pindaian di sesi itu: orang,
 * bukan pindaian, dan pola yang sama dengan angka checked-in di Client view
 * (src/lib/live/data.ts). "Terdaftar" = peserta aktif acara, termasuk walk-in.
 */
export async function hitungKehadiran(eventId: string, sessionIds: number[]) {
  const client = getSupabaseServiceClient();
  const aktif = (pilih = "id") =>
    client.from("participants").select(pilih, { count: "exact", head: true }).eq("event_id", eventId).is("source_removed_at", null);

  const [terdaftar, ...perSesi] = await Promise.all([
    aktif(),
    ...sessionIds.map((id) => aktif("id,attendance_scans!inner(id)").eq("attendance_scans.session_id", id)),
  ]);
  const galat = [terdaftar, ...perSesi].find((hasil) => hasil.error)?.error;
  if (galat) throw new Error(galat.message);

  return {
    terdaftar: terdaftar.count ?? 0,
    hadir: Object.fromEntries(sessionIds.map((id, i) => [id, perSesi[i].count ?? 0])) as Record<number, number>,
  };
}
