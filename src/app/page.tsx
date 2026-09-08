import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";

/**
 * Akar domain adalah GERBANG, bukan halaman.
 *
 * Sebelumnya di sini ada pemilih "workspace" berisi empat kartu — tiga di
 * antaranya soal transaksi booth, warisan dari masa platform ini hanya sistem
 * kasir. Kartunya menunjuk /booth, /cashier, /admin tanpa slug acara, padahal
 * seluruh layar kerja kini hidup di /e/<slug>/… dan login selalu mendarat di
 * pemilih acara. Jadi setiap kartu adalah dua kali lompat yang tidak pernah
 * sampai ke tujuan yang dijanjikannya.
 *
 * Tidak ada yang perlu MEMBACA sesuatu di alamat ini. Panitia butuh masuk;
 * tamu datang lewat /e/<slug> dari undangan dan QR. Yang tersisa cuma satu
 * pertanyaan — sudah login atau belum — dan jawabannya cukup dua pengalihan.
 *
 * Daftar acara publik SENGAJA tidak ditaruh di sini: platform melayani lebih
 * dari satu klien, dan tamu satu acara tidak boleh melihat acara klien lain.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/events" : "/login");
}
