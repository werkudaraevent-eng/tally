import { notFound, redirect } from "next/navigation";
import { getEventBySlugPublic } from "@/lib/auth/event-scope";
import type { EventLandingConfig } from "@/lib/domain";
import { landingDefaultLang, landingEnAvailable } from "@/lib/landing-i18n";
import { renderLanding } from "@/components/landing/render-landing";
import { landingMetadata } from "../landing-metadata";

/**
 * Halaman acara versi English: `/e/<slug>/en`.
 *
 * Isinya sama dengan versi Indonesia (src/app/e/[slug]/page.tsx); yang berbeda
 * hanya teksnya (lihat src/lib/landing-i18n.ts). Selama admin belum menyalakan
 * "Tampilkan versi English" di Halaman acara > Tema, alamat ini dialihkan
 * sementara (307) ke halaman acara: tautan /en yang terlanjur dibagikan tetap
 * sampai ke acaranya, bukan ke 404 kosong. Tanpa isi English yang dirender,
 * tidak ada halaman setengah jadi yang bisa terindeks.
 *
 * Bila English bahasa utama, versi English ada di `/e/<slug>` dan alamat ini
 * dialihkan ke sana: satu versi, satu alamat.
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
  const config = event.landing_config as EventLandingConfig;
  if (!landingEnAvailable(config) || landingDefaultLang(config) === "en") redirect(`/e/${event.slug}`);
  return renderLanding(event, "en");
}
