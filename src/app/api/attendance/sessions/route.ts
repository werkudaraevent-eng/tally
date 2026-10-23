import { requireRequestEvent } from "@/lib/auth/request-event";
import { apiError } from "@/lib/api";
import type { RegistrationFormConfig } from "@/lib/domain";
import { setelanMeja } from "@/lib/badge/stasiun-server";
import { loadLabelSettings } from "@/lib/label/load";
import { walkinFields } from "@/lib/participant-input";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { hitungKehadiran } from "@/lib/attendance-progress";
import { aturanWalkIn } from "@/lib/walkin-form";
import { loadDaftarCheckpoint, loadSetelanCheckpoint, scanMandiriPerSesi } from "@/lib/checkpoint/server";

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

  const [sesi, jalur, barang] = await Promise.all([
    client
      .from("attendance_sessions")
      // select *: `records_luggage` baru ada setelah migrasi 202610230003, dan
      // menyebutnya sebelum itu membuat layar pemindai kehilangan semua sesinya.
      .select("*")
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
    // Berapa barang yang diperiksa di tiap sesi. Layar pemindai hanya memuat
    // daftar centang barang untuk sesi yang memang punya barang, jadi sesi
    // Gala dinner tidak menunggu satu permintaan kosong di setiap pemindaian.
    client.from("attendance_session_items").select("session_id").eq("event_id", eventId),
  ]);

  if (sesi.error) return apiError("INTERNAL_ERROR", 500);

  // Orang unik per sesi dan jumlah terdaftar, sebagai hitungan. Dulu dihitung
  // dari baris attendance_scans di sini, yang terpotong di 1.000 baris.
  const daftarSesi = (sesi.data ?? []) as Array<{ id: number; name: string; slug: string; sort_order: number; records_luggage?: boolean }>;
  const angka = await hitungKehadiran(eventId, daftarSesi.map((row) => row.id)).catch(() => null);

  // Setelan walk-in ikut di jawaban yang sama, bukan endpoint kedua, dengan
  // alasan yang sama dengan jalur di atas. Formnya = form registrasi utama:
  // seluruh pertanyaan dan tanda wajibnya (lib/walkin-form.ts). Pertanyaan
  // berkas tidak ikut karena tidak bisa diunggah dari meja, dan pertanyaan
  // yang tidak ditanyakan di formulir pun tidak (lib/kolom-staf.ts).
  const config = auth.scope.event.registration_form_config as RegistrationFormConfig | null;

  // Setelan label ikut di sini juga, dan bukan di endpoint ketiga. Layar
  // pemindai membutuhkannya pada saat yang persis sama dengan daftar sesi —
  // saat halaman dibuka — dan setiap permintaan tambahan di jaringan venue yang
  // padat adalah satu kesempatan lagi untuk gagal sebelum tamu pertama datang.
  const [label, meja, setelanCp, daftarCp] = await Promise.all([
    loadLabelSettings(auth.scope.event.id),
    setelanMeja(auth.scope.event.id),
    loadSetelanCheckpoint(auth.scope.event.id),
    loadDaftarCheckpoint(auth.scope.event.id),
  ]);
  // Sesi yang checkpoint-nya boleh dipindai sendiri oleh peserta (scan
  // mandiri): layar pemindai menawarkan Show QR di sana. Acara lain tidak
  // mendapat kunci ini sama sekali.
  const mandiri = setelanCp?.enabled && daftarCp ? scanMandiriPerSesi(daftarCp) : new Map<number, "self" | "both">();

  const jumlahBarang = new Map<number, number>();
  for (const baris of (barang.data ?? []) as Array<{ session_id: number }>) {
    jumlahBarang.set(baris.session_id, (jumlahBarang.get(baris.session_id) ?? 0) + 1);
  }

  return Response.json({
    sessions: daftarSesi.map(({ records_luggage, ...row }) => ({
      ...pilihKolom(row),
      // Check-in > Sessions > Record luggage: lembar hasil meminta jumlah bagasi
      // dan foto. Sesi lain tidak mendapat kunci ini, jadi layarnya tidak berubah.
      ...(records_luggage === true ? { bagasi: true } : {}),
      hadir: angka?.hadir[row.id] ?? null,
      jumlah_barang: jumlahBarang.get(row.id) ?? 0,
      ...(mandiri.has(row.id) ? { self_scan: mandiri.get(row.id) } : {}),
    })),
    lanes: jalur.data ?? [],
    event: { name: auth.scope.event.name, slug: auth.scope.event.slug },
    user: { username: auth.user.username },
    allow_walk_in: auth.scope.event.attendance_allow_walk_in,
    walkin_fields: walkinFields(config),
    walkin_wajib: aturanWalkIn(config),
    terdaftar: angka?.terdaftar ?? null,
    label,
    // Badge kertas lewat stasiun cetak. Label stiker menang bila keduanya
    // tersimpan menyala: itulah urutan "Yang dicetak di meja registrasi".
    badge_meja: !label.enabled && meja.badge ? { siap: meja.siap, menit: meja.menit } : null,
  });
}

/** Kolom sesi yang memang dikirim ke petugas, bukan seisi baris dari `select *`. */
function pilihKolom(row: { id: number; name: string; slug: string; sort_order: number }) {
  return { id: row.id, name: row.name, slug: row.slug, sort_order: row.sort_order };
}
