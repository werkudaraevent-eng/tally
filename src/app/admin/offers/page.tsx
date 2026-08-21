import { redirect } from "next/navigation";

/**
 * Alamat lama "Item spesial".
 *
 * Isinya sekarang tab di dalam Booth & item. Rutenya dipertahankan sebagai
 * pengalihan, bukan dihapus: alamat ini pernah ditautkan dari halaman Booth dan
 * kemungkinan sudah masuk bookmark panitia, dan 404 di layar kerja terbaca
 * sebagai aplikasi rusak — bukan sebagai menu yang dipindahkan.
 */
export default async function ItemSpesialPindah({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.eventSlug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  redirect(slug ? `/e/${slug}/admin/booths` : "/admin/booths");
}
