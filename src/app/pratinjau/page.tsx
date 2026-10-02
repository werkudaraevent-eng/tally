import { notFound } from "next/navigation";
import { requireEventScope } from "@/lib/auth/event-scope";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { renderLanding } from "@/components/landing/render-landing";
import { PratinjauLangsung } from "./pratinjau-langsung";

/**
 * Pratinjau langsung untuk CMS Halaman acara (`/e/<slug>/pratinjau`).
 *
 * Hanya untuk admin acara itu. Selain admin, alamat ini 404 sama seperti alamat
 * yang tidak ada, supaya tidak membocorkan bahwa halamannya ada.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Pratinjau halaman acara", robots: { index: false, follow: false } };

export default async function PratinjauPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const event = await getPublicPageEvent(searchParams);
  if (!event) notFound();
  const auth = await requireEventScope(event.slug, ["admin"]);
  if (auth.response) notFound();
  const params = await searchParams;
  const halaman = params.halaman === "program" || params.halaman === "info" ? params.halaman : "beranda";
  // Halaman dalam hanya ada di tata letak Forum; tata letak lain jatuh ke Beranda.
  const isi = renderLanding(event, "id", { halaman, pratinjau: true }) ?? renderLanding(event, "id", { pratinjau: true });
  return <PratinjauLangsung slug={event.slug} halaman={halaman}>{isi}</PratinjauLangsung>;
}
