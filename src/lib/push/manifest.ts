import type { EventLandingConfig, EventRow } from "@/lib/domain";
import { publicEventName } from "@/lib/domain";
import { landingDefaultLang, landingPath, type LandingLang } from "@/lib/landing-i18n";
import { landingTokens } from "@/lib/landing-tokens";
import { getEventBySlugPublic } from "@/lib/auth/event-scope";
import { eventSlugFromRequest } from "@/lib/auth/request-event";
import { namaPendek, warnaTeksDi } from "@/lib/push/ikon";

/**
 * Manifest per acara untuk portal peserta (Layar Utama / pasang aplikasi).
 * Dulu portal memakai manifest admin Tally (`/manifest.webmanifest`, mulai di
 * /login, tanpa ikon), jadi portal yang dipasang di Layar Utama bisa terbuka
 * di halaman masuk admin. Notifikasi HP di iPhone hanya jalan dari Layar Utama,
 * jadi ini syaratnya.
 */

export function alamatManifest(slug: string, utama: LandingLang, lang: LandingLang): string {
  return `${landingPath(slug, utama, utama)}/peserta-manifest${lang === utama ? "" : `?bahasa=${lang}`}`;
}

export function alamatIkon(slug: string, utama: LandingLang, ukuran: 180 | 192 | 512, maskable = false): string {
  return `${landingPath(slug, utama, utama)}/peserta-ikon?ukuran=${ukuran}${maskable ? "&maskable=1" : ""}`;
}

export function warnaIkon(event: Pick<EventRow, "landing_config">): { latar: string; teks: string } {
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const latar = landingTokens(landing).brand;
  return { latar, teks: warnaTeksDi(latar) };
}

/** Acara dari `?eventSlug=` saja: tanpa slug tidak ada tebakan. */
export async function acaraManifest(request: Request): Promise<EventRow | null> {
  const slug = eventSlugFromRequest(request);
  if (!slug) return null;
  const event = await getEventBySlugPublic(slug);
  if (!event || event.status === "archived") return null;
  return event;
}

export function isiManifest(event: EventRow, lang: LandingLang) {
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const utama = landingDefaultLang(landing);
  const nama = publicEventName(event);
  const portal = `${landingPath(event.slug, lang, utama)}/peserta`;
  const { latar } = warnaIkon(event);
  return {
    // id tetap per acara + bahasa: pasang ulang tidak membuat ikon kedua.
    id: portal,
    name: nama,
    short_name: namaPendek(nama),
    lang,
    start_url: portal,
    // Seluruh halaman acara (masuk, lengkapi data, halaman acara) tetap di
    // dalam aplikasi; di luar itu dibuka di peramban.
    scope: `/e/${encodeURIComponent(event.slug)}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: latar,
    icons: [
      { src: alamatIkon(event.slug, utama, 192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: alamatIkon(event.slug, utama, 512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: alamatIkon(event.slug, utama, 512, true), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
