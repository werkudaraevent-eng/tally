import { notFound } from "next/navigation";
import { getEventBySlugPublic } from "@/lib/auth/event-scope";
import { renderLanding } from "@/components/landing/render-landing";
import { landingMetadata } from "./landing-metadata";

/**
 * Landing page publik satu acara.
 *
 * Alamat ini — `/e/<slug>` — adalah alamat yang dicetak di undangan dan QR.
 * Sebelumnya ia berisi pemilih layar panitia, yang berarti tamu yang memotong
 * bagian belakang alamat mana pun (`/daftar`, `/rundown`) mendarat di layar
 * login. Sekarang setiap pemotongan berakhir di halaman ini, dan tidak ada
 * satu pun jalan dari sini ke layar internal.
 *
 * Bahasa Indonesia, bahasa utama. Versi English di `/e/<slug>/en`
 * (en/page.tsx).
 *
 * `force-dynamic` dengan alasan yang sama seperti /display dan /daftar: tanpa
 * itu Next.js merender halaman saat build dan isinya membeku pada acara yang
 * kebetulan aktif saat itu.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return landingMetadata(slug, "id");
}

export default async function EventLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlugPublic(slug);

  // Acara yang diarsipkan tidak punya halaman publik. Ia tidak "tidak
  // ditemukan" bagi panitia, tetapi bagi tamu yang membuka tautan lama, 404
  // lebih jujur daripada halaman acara yang sudah tidak berlaku.
  if (!event || event.status === "archived") notFound();

  return renderLanding(event);
}
