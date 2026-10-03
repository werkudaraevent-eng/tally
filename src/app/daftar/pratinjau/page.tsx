import { notFound } from "next/navigation";
import { requireEventScope } from "@/lib/auth/event-scope";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import type { EventLandingConfig } from "@/lib/domain";
import { landingDefaultLang } from "@/lib/landing-i18n";
import { isiDaftar } from "../isi-daftar";
import { PratinjauFormulir } from "./pratinjau-formulir";

/**
 * Pratinjau formulir pendaftaran untuk CMS (`/e/<slug>/daftar/pratinjau`):
 * Atur formulir di Pendaftaran publik, dan Tema saat acara memilih "Hanya
 * formulir". Hanya untuk admin acara itu; selain admin, alamat ini 404 sama
 * seperti alamat yang tidak ada.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Pratinjau formulir", robots: { index: false, follow: false } };

export default async function PratinjauFormulirPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const event = await getPublicPageEvent(searchParams);
  if (!event) notFound();
  const auth = await requireEventScope(event.slug, ["admin"]);
  if (auth.response) notFound();
  const isi = await isiDaftar(event, landingDefaultLang(event.landing_config as EventLandingConfig), { pratinjau: true });
  return <PratinjauFormulir slug={event.slug}>{isi}</PratinjauFormulir>;
}
