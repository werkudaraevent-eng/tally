import { requireRequestEvent } from "@/lib/auth/request-event";
import { isEmailConfigured } from "@/lib/email/client";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { EventLandingConfig } from "@/lib/domain";

/**
 * Ringkasan satu acara untuk Dashboard.
 *
 * Menjawab pertanyaan yang ditanyakan panitia saat membuka aplikasi: berapa yang
 * sudah mendaftar, apa yang belum disiapkan, dan apakah ada yang menunggu
 * dikerjakan. Bukan pertanyaan "berapa omzet booth" — itu punya modul sendiri.
 *
 * SEMUA hitungan memakai `head: true` dengan `count: "exact"`: yang dibutuhkan
 * hanya angkanya, dan menarik barisnya berarti memindahkan seluruh tabel peserta
 * ke server aplikasi hanya untuk dihitung panjangnya. Satu-satunya yang menarik
 * baris adalah order, karena nominalnya harus dijumlahkan.
 *
 * Dijalankan paralel. Berurutan, sebelas kueri kecil ke Supabase menjadi sebelas
 * perjalanan bolak-balik — terasa sebagai satu detik penuh layar kosong setiap
 * kali Dashboard dibuka.
 */

export async function GET(request: Request) {
  const auth = await requireRequestEvent(request, ["admin"]);
  if (auth.response) return auth.response;

  const event = auth.scope.event;
  const client = getSupabaseServiceClient();

  const hitung = (tabel: string, kolom = "event_id") =>
    client.from(tabel).select("id", { head: true, count: "exact" }).eq(kolom, event.id);

  const [
    peserta,
    menunggu,
    disetujui,
    ditolak,
    booth,
    boothAktif,
    penawaran,
    hadiah,
    pertanyaan,
    seksiRundown,
    denah,
    orders,
  ] = await Promise.all([
    hitung("participants"),
    hitung("event_registrations").eq("status", "pending"),
    hitung("event_registrations").eq("status", "approved"),
    hitung("event_registrations").eq("status", "rejected"),
    hitung("booths"),
    hitung("booths").eq("is_active", true),
    hitung("special_offers"),
    hitung("undian_prizes"),
    hitung("vote_polls"),
    client.from("rundown_sections").select("id", { count: "exact" }).eq("event_id", event.id),
    // `seat_map_sessions`, BUKAN `seat_maps`: kolom event_id ada di sesinya
    // (lihat 202608070002_event_scoped_data.sql), dan denah sendiri tergantung
    // pada sesi. Menghitung tabel yang salah membalas nol untuk setiap acara —
    // kesiapan yang selalu merah, tanpa satu pun galat yang bisa dilihat.
    hitung("seat_map_sessions"),
    client.from("orders").select("status,total_amount").eq("event_id", event.id),
  ]);

  // Sesi rundown dihitung dari seksinya, isinya dari itemnya. Seksi tanpa item
  // adalah rundown yang terlihat "sudah diisi" di angka tetapi kosong di layar
  // publik — persis jenis kesiapan palsu yang membuat panitia tenang di hari-H.
  const idSeksi = ((seksiRundown.data ?? []) as Array<{ id: number }>).map((baris) => baris.id);
  const { count: jumlahAgenda } = idSeksi.length
    ? await client.from("rundown_items").select("id", { head: true, count: "exact" }).in("section_id", idSeksi)
    : { count: 0 };

  const daftarOrder = (orders.data ?? []) as Array<{ status: string; total_amount: number }>;
  const lunas = daftarOrder.filter((order) => order.status === "paid" || order.status === "handed_over");

  const landing = (event.landing_config ?? {}) as EventLandingConfig;

  return Response.json({
    event: {
      name: event.name,
      slug: event.slug,
      status: event.status,
      event_date: event.event_date,
      end_date: event.end_date,
      start_time: event.start_time,
      end_time: event.end_time,
      time_zone: event.time_zone,
      venue_name: event.venue_name,
      registration_enabled: event.registration_enabled,
      participant_source: event.participant_source,
    },
    peserta: {
      total: peserta.count ?? 0,
      menunggu: menunggu.count ?? 0,
      disetujui: disetujui.count ?? 0,
      ditolak: ditolak.count ?? 0,
    },
    transaksi: {
      // Nol order BUKAN kegagalan: acara yang belum berjalan memang belum punya
      // transaksi. Yang tidak boleh terjadi adalah menampilkan angka yang tidak
      // dapat dipercaya, jadi omzet dihitung dari status yang sudah pasti.
      total: daftarOrder.length,
      lunas: lunas.length,
      omzet: lunas.reduce((jumlah, order) => jumlah + order.total_amount, 0),
      menunggu: daftarOrder.filter((order) => order.status === "pending").length,
    },
    kesiapan: {
      deskripsi: Boolean(event.description?.trim()),
      banner: Boolean(landing.banner_url),
      venue: Boolean(event.venue_name?.trim()),
      jadwal: Boolean(event.event_date),
      agenda: jumlahAgenda ?? 0,
      denah: denah.count ?? 0,
      booth: booth.count ?? 0,
      booth_aktif: boothAktif.count ?? 0,
      penawaran: penawaran.count ?? 0,
      hadiah_undian: hadiah.count ?? 0,
      pertanyaan_vote: pertanyaan.count ?? 0,
      email_aktif: isEmailConfigured(),
    },
  });
}
