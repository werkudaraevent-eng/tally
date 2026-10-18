import { kalimatTujuan, type TujuanPeserta } from "@/lib/checkpoint/tujuan";

/**
 * Baris tujuan poin di kartu checkpoint peserta (E-08, Check-in > Checkpoints >
 * Points goal): "20 poin lagi untuk masuk undian malam puncak.". Bagian tebal
 * memakai warna sorot kartunya; sisanya warna redup kartu.
 *
 * Halaman English tanpa teks tujuan English menulis kalimatnya utuh dalam
 * bahasa Indonesia. Atribut lang selalu dipasang: portal Horizon belum
 * menyatakan bahasa halamannya sendiri, jadi pembaca layar perlu tahu dari sini.
 */
export function BarisTujuanPoin({
  tujuan,
  className,
  tebalKelas,
  sisaKelas,
}: {
  tujuan: TujuanPeserta;
  className: string;
  tebalKelas: string;
  sisaKelas: string;
}) {
  const { tebal, sisa } = kalimatTujuan(tujuan);
  return (
    <p lang={tujuan.lang} className={`[overflow-wrap:anywhere] ${className}`}>
      <span className={tebalKelas}>{tebal}</span> <span className={sisaKelas}>{sisa}</span>
    </p>
  );
}
