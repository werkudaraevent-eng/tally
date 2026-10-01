import { notFound } from "next/navigation";
import { getPublicPageEvent } from "@/lib/auth/request-event";
import { publicEventName, type EventLandingConfig, type LandingForumPage } from "@/lib/domain";
import { renderLanding } from "@/components/landing/render-landing";
import { FORUM_LABELS } from "./labels";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Halaman dalam tata letak Forum (`/e/<slug>/program`, `/e/<slug>/info`).
 * Acara bertata letak lain tidak punya halaman ini: 404, bukan halaman kosong.
 */
export async function forumPage(halaman: Exclude<LandingForumPage, "beranda">, searchParams: SearchParams) {
  const event = await getPublicPageEvent(searchParams);
  if (!event || event.status === "archived") notFound();
  const isi = renderLanding(event, halaman);
  if (!isi) notFound();
  return isi;
}

export async function forumMetadata(halaman: Exclude<LandingForumPage, "beranda">, searchParams: SearchParams) {
  const event = await getPublicPageEvent(searchParams);
  if (!event) return { title: "Acara tidak ditemukan" };
  const config = (event.landing_config ?? {}) as EventLandingConfig;
  const label = FORUM_LABELS[config.forum?.language ?? "id"];
  const judul = halaman === "program" ? label.program : config.forum?.info_title?.trim() || label.info;
  return { title: `${judul} · ${publicEventName(event)}` };
}
