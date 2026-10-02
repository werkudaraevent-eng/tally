import { notFound, redirect } from "next/navigation";
import { getEventBySlugPublic } from "@/lib/auth/event-scope";
import type { EventLandingConfig } from "@/lib/domain";
import { landingDefaultLang } from "@/lib/landing-i18n";
import { renderLanding } from "@/components/landing/render-landing";
import { landingMetadata } from "../landing-metadata";

/**
 * Halaman acara versi Indonesia saat English dipilih sebagai bahasa utama:
 * `/e/<slug>/id`.
 *
 * Selama Indonesia bahasa utama (bawaan), versi Indonesia ada di `/e/<slug>`
 * dan alamat ini dialihkan ke sana. Dikecualikan dari rewrite ber-scope event
 * di src/proxy.ts, sama seperti `/en`.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return landingMetadata(slug, "id");
}

export default async function EventLandingIndonesiaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlugPublic(slug);
  if (!event || event.status === "archived") notFound();
  if (landingDefaultLang(event.landing_config as EventLandingConfig) !== "en") redirect(`/e/${event.slug}`);
  return renderLanding(event, "id");
}
