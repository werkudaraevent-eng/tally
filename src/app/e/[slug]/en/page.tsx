import { notFound } from "next/navigation";
import { getEventBySlugPublic } from "@/lib/auth/event-scope";
import type { EventLandingConfig } from "@/lib/domain";
import { landingEnAvailable } from "@/lib/landing-i18n";
import { renderLanding } from "@/components/landing/render-landing";
import { landingMetadata } from "../landing-metadata";

/**
 * Halaman acara versi English: `/e/<slug>/en`.
 *
 * Isinya sama dengan versi Indonesia (src/app/e/[slug]/page.tsx); yang berbeda
 * hanya teksnya (lihat src/lib/landing-i18n.ts). 404 selama admin belum
 * menyalakan "Tampilkan versi English" di Halaman acara > Tema, supaya halaman
 * setengah diterjemahkan tidak terbuka atau terindeks lebih dulu.
 *
 * `/e/<slug>/en` sengaja dikecualikan dari rewrite ber-scope event di
 * src/proxy.ts; tanpa itu ia ditulis ulang ke `/en?eventSlug=`.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return landingMetadata(slug, "en");
}

export default async function EventLandingEnglishPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlugPublic(slug);
  if (!event || event.status === "archived") notFound();
  if (!landingEnAvailable(event.landing_config as EventLandingConfig)) notFound();
  return renderLanding(event, "en");
}
