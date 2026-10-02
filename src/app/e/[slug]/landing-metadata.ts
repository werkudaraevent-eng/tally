import type { Metadata } from "next";
import { headers } from "next/headers";
import { getEventBySlugPublic } from "@/lib/auth/event-scope";
import { publicEventName, type EventLandingConfig } from "@/lib/domain";
import { formatEventSchedule } from "@/lib/event-datetime";
import { landingEnAvailable, landingPath, resolveLanding, type LandingLang } from "@/lib/landing-i18n";

/** Asal situs dari permintaan ini, untuk alamat hreflang yang harus absolut. */
async function asalSitus(): Promise<string | null> {
  const daftar = await headers();
  const host = daftar.get("x-forwarded-host") ?? daftar.get("host");
  if (!host) return null;
  const proto = daftar.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Metadata halaman acara dalam satu bahasa (/e/<slug> dan /e/<slug>/en).
 *
 * Ditulis lengkap, bukan hanya judul. Alamat ini disebar lewat WhatsApp dan
 * LinkedIn, dan tautan tanpa kartu pratinjau terbaca seperti tautan yang tidak
 * jelas asalnya — persis yang membuat orang tidak menekannya.
 *
 * Bila versi English menyala, kedua versi saling menunjuk lewat hreflang
 * (Google: Localized versions of your pages), dengan Indonesia sebagai
 * x-default karena alamat itulah yang dicetak di undangan dan QR.
 */
export async function landingMetadata(slug: string, lang: LandingLang): Promise<Metadata> {
  const asli = await getEventBySlugPublic(slug);
  if (!asli) return { title: lang === "en" ? "Event not found" : "Acara tidak ditemukan" };
  const { event, config } = resolveLanding(asli, lang);

  const jadwal = formatEventSchedule(event);
  const banner = (config as EventLandingConfig)?.banner_url ?? undefined;
  const asal = landingEnAvailable(config) ? await asalSitus() : null;

  return {
    title: `${publicEventName(event)}${event.tagline ? ` · ${event.tagline}` : ""}`,
    description: event.description ?? jadwal ?? undefined,
    openGraph: {
      title: publicEventName(event),
      description: event.tagline ?? event.description ?? undefined,
      images: banner ? [banner] : undefined,
      type: "website",
      locale: lang === "en" ? "en_GB" : "id_ID",
    },
    alternates: asal
      ? {
          canonical: `${asal}${landingPath(event.slug, lang)}`,
          languages: {
            id: `${asal}${landingPath(event.slug, "id")}`,
            en: `${asal}${landingPath(event.slug, "en")}`,
            "x-default": `${asal}${landingPath(event.slug, "id")}`,
          },
        }
      : undefined,
  };
}
