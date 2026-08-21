import { redirect } from "next/navigation";

/**
 * Alamat lama "User & role". Isinya sekarang tab di dalam Pengaturan.
 * Lihat src/app/admin/offers/page.tsx untuk alasan rutenya dipertahankan.
 */
export default async function UserPindah({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.eventSlug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  redirect(slug ? `/e/${slug}/admin/settings` : "/admin/settings");
}
