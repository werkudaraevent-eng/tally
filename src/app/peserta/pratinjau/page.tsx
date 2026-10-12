import { notFound } from "next/navigation";
import { requireEventScope } from "@/lib/auth/event-scope";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import type { EventLandingConfig } from "@/lib/domain";
import { previewMemberSession } from "@/lib/member/account";
import { PratinjauBeranda } from "./pratinjau-beranda";
import { renderBerandaPratinjau } from "./render";

/**
 * Pratinjau Beranda halaman peserta untuk Participant area
 * (`/e/<slug>/peserta/pratinjau?peserta=<id>`).
 *
 * Hanya untuk admin acara itu; Viewer, Scanner, peserta, dan tamu mendapat 404
 * yang sama dengan alamat yang tidak ada. Dirender sebagai peserta yang dipilih
 * admin, tanpa sesi peserta dan tanpa menandai pengumuman terbaca. Draf yang
 * belum disimpan datang lewat postMessage dari Participant area, bukan dari URL.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Pratinjau halaman peserta", robots: { index: false, follow: false } };

export default async function PratinjauPesertaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const event = await getPublicPageEvent(searchParams);
  if (!event) notFound();
  const auth = await requireEventScope(event.slug, ["admin"]);
  if (auth.response) notFound();
  const { peserta } = await searchParams;
  const sesi = typeof peserta === "string" ? await previewMemberSession(event.id, peserta) : null;
  if (!sesi) notFound();
  const landing = (event.landing_config ?? {}) as EventLandingConfig;
  const isi = await renderBerandaPratinjau(event, landing.member ?? { enabled: false }, sesi);
  if (!isi) notFound();
  return <PratinjauBeranda slug={event.slug} pesertaId={sesi.participant!.id}>{isi}</PratinjauBeranda>;
}
