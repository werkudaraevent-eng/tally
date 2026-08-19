import { getPublicRequestEvent } from "@/lib/auth/request-event";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Keadaan voting yang sedang tayang. Dibaca layar panggung DAN setiap HP peserta.
 *
 * ================== INI ENDPOINT YANG MENENTUKAN SKALA ==================
 *
 * Layar panggung cuma satu klien. HP peserta bisa ratusan, dan semuanya
 * memanggil alamat ini berulang selama voting berjalan. Tiga ratus HP tiap tiga
 * detik adalah seratus permintaan per detik — cukup untuk membuat acara berhenti
 * di menit paling ramai.
 *
 * Jawabannya BUKAN websocket. Balasan ini SAMA untuk semua orang, jadi ia boleh
 * di-cache di CDN: `s-maxage=2` membuat Vercel menggabungkan seluruh permintaan
 * dalam jendela dua detik menjadi satu kunjungan ke origin, dan
 * `stale-while-revalidate` menjaga jawabannya tetap terkirim seketika sementara
 * salinan barunya diambil di belakang layar. Ratusan HP menjadi sekitar satu
 * permintaan per detik.
 *
 * Konsekuensi yang HARUS dipatuhi: balasan ini tidak boleh memuat apa pun yang
 * berbeda antar-pemilih. Tidak ada "Anda sudah memilih" di sini — begitu
 * jawabannya bergantung pada cookie, cache-nya batal dan seluruh perhitungan di
 * atas runtuh. Penjaga suara ganda tetap ada di indeks unik database, dan HP
 * mengingat pilihannya sendiri di localStorage hanya untuk tampilan.
 *
 * Seluruh perangkuman dikerjakan `vote_public_state` di SQL. Keempat tipe
 * pertanyaan butuh rangkuman yang berbeda — hitungan per opsi, rata-rata plus
 * sebaran, pengelompokan kata — dan endpoint yang dipoll ratusan HP adalah
 * tempat paling buruk untuk menaruh percabangan seperti itu.
 */
export async function GET(request: Request) {
  const event = await getPublicRequestEvent(request);
  if (!event) return Response.json({ poll: null }, { headers: { "Cache-Control": "no-store" } });

  const { data, error } = await getSupabaseServiceClient()
    .rpc("vote_public_state" as never, { p_event_id: event.id } as never);

  // Kegagalan dijawab "belum ada voting", bukan 500: layar panggung yang
  // menampilkan galat merah di depan penonton lebih buruk daripada layar yang
  // menunggu, dan polling berikutnya dua detik lagi.
  if (error) return Response.json({ poll: null }, { headers: { "Cache-Control": "no-store" } });

  return Response.json(data, {
    headers: {
      // Dua detik terasa langsung bagi mata, dan itu batas yang memungkinkan
      // penggabungan permintaan. Lebih pendek meniadakan manfaatnya; lebih
      // panjang membuat bar terlihat tersendat saat suara mengalir deras.
      "Cache-Control": "public, s-maxage=2, stale-while-revalidate=8",
    },
  });
}
