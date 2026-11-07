import { landingDefaultLang } from "@/lib/landing-i18n";
import type { EventLandingConfig } from "@/lib/domain";
import { acaraManifest, isiManifest } from "@/lib/push/manifest";

/**
 * Manifest portal peserta per acara, di `/e/<slug>/peserta-manifest`
 * (proxy menulis ulang ke sini dengan `?eventSlug=`). Lihat lib/push/manifest.ts.
 */
export async function GET(request: Request) {
  const event = await acaraManifest(request);
  if (!event) return new Response("Not found", { status: 404 });
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const diminta = new URL(request.url).searchParams.get("bahasa");
  const lang = diminta === "en" || diminta === "id" ? diminta : landingDefaultLang(landing);
  return Response.json(isiManifest(event, lang), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
