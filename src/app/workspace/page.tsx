import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/login";
import { requireEventScope } from "@/lib/auth/event-scope";
import { alasanTidakBisaBuka, roleHome } from "@/lib/role-home";

/**
 * `/e/<slug>/workspace` kini hanya pengalihan.
 *
 * Halaman pemilih "Admin atau Booth" yang dulu ada di sini dihapus: ia satu
 * klik tambahan setiap kali masuk, jawabannya sudah ditentukan peran akun, dan
 * kasir serta petugas pemindai tidak punya kartu sama sekali di dalamnya.
 * Rutenya dipertahankan supaya bookmark dan tautan lama tetap mendarat di
 * tempat yang benar, bukan di 404.
 *
 * Slug datang dari query, bukan dari params: `/e/<slug>/workspace` di-rewrite
 * proxy menjadi `/workspace?eventSlug=<slug>`, pola yang sama dengan seluruh
 * layar ber-scope event lainnya.
 */
export default async function EventWorkspace({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const raw = params.eventSlug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug) notFound();
  const resolved = await requireEventScope(slug);
  if (resolved.response) {
    if (resolved.response.status === 404) notFound();
    if (resolved.response.status === 403) redirect("/events");
    throw new Error("Event gagal dimuat.");
  }
  const { event, role } = resolved.scope;

  // Peran lapangan pada acara yang tidak aktif dikembalikan ke daftar acara,
  // tempat alasannya tertulis di barisnya — bukan ke layar yang setiap aksinya
  // ditolak server.
  if (alasanTidakBisaBuka(role, event.status)) redirect("/events");
  redirect(roleHome(role, event.slug));
}
