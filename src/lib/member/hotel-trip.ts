/**
 * Hotel yang dimaksud "Hotel" di satu perjalanan bus, menurut jam berangkatnya.
 *
 * Peserta yang pindah hotel (5-6 Nov hotel A, 6-8 Nov hotel B) menaiki
 * perjalanan 7 Nov dari hotel B, bukan dari stay pertamanya. Aturannya:
 * stay yang sedang ditempati saat berangkat; bila tidak ada (pagi sesudah
 * check-out, atau jeda antar hotel), stay terakhir yang sudah check-in;
 * bila berangkat sebelum semua check-in, stay paling awal. Stay tanpa
 * tanggal atau perjalanan tanpa jam memakai stay pertama, seperti sebelumnya.
 */
type StayBertanggal = { check_in_at: string | null; check_out_at: string | null };

export function staySaatBerangkat<T extends StayBertanggal>(stays: T[], berangkat: string | null): T | null {
  if (stays.length === 0) return null;
  const waktu = berangkat ? Date.parse(berangkat) : NaN;
  if (Number.isNaN(waktu)) return stays[0] ?? null;
  const masuk = (stay: T) => (stay.check_in_at ? Date.parse(stay.check_in_at) : NaN);
  const keluar = (stay: T) => (stay.check_out_at ? Date.parse(stay.check_out_at) : NaN);
  const bertanggal = stays.filter((stay) => !Number.isNaN(masuk(stay))).sort((a, b) => masuk(a) - masuk(b));
  if (bertanggal.length === 0) return stays[0] ?? null;
  const ditempati = bertanggal.find((stay) => masuk(stay) <= waktu && (Number.isNaN(keluar(stay)) || waktu < keluar(stay)));
  if (ditempati) return ditempati;
  const sudahMasuk = bertanggal.filter((stay) => masuk(stay) <= waktu);
  return sudahMasuk[sudahMasuk.length - 1] ?? bertanggal[0] ?? null;
}
