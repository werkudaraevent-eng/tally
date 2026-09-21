import { PageLoading } from "@/components/m3";

/**
 * Layar tunggu segmen ini.
 *
 * `loading.tsx` membungkus HANYA halamannya dalam Suspense, bukan layoutnya.
 * Konsekuensinya persis yang diinginkan: rel navigasi dan bilah atas tetap
 * tergambar selama perpindahan, jadi tidak ada yang melompat saat halaman baru
 * tiba — yang berganti hanya isi kolom kontennya.
 */
export default function Loading() {
  return <PageLoading />;
}
