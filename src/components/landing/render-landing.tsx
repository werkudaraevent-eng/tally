import { normalizeLandingSections, type EventLandingConfig, type EventRow, type LandingForumPage } from "@/lib/domain";
import { registrationThemeStyle } from "@/lib/registration-theme-css";
import { formatEventSchedule } from "@/lib/event-datetime";
import { EventLanding } from "@/components/landing/event-landing";
import { EventLandingModern } from "@/components/landing/event-landing-modern";
import { EventLandingForum } from "@/components/landing/forum/event-landing-forum";

/**
 * Halaman acara dari satu baris event. Dipakai halaman publik dan pratinjau
 * langsung di CMS, supaya keduanya tidak bisa berbeda tampilan.
 *
 * Tiga tata letak, satu sumber data. Forum punya tiga halaman (`halaman`);
 * dua tata letak lain hanya Beranda, dan halaman lain mengembalikan null. Editorial tetap bawaan: acara yang tidak
 * pernah memilih tidak berubah tampilannya karena pembaruan.
 */
export function renderLanding(event: EventRow, halaman: LandingForumPage = "beranda", pratinjau = false) {
  const config = (event.landing_config ?? {}) as EventLandingConfig;
  if (config.layout === "forum") return <EventLandingForum event={event} halaman={halaman} pratinjau={pratinjau} />;
  // Program acara dan Informasi praktis hanya ada di tata letak Forum.
  if (halaman !== "beranda") return null;
  const sections = normalizeLandingSections(config.sections, config.blocks);
  const theme = registrationThemeStyle(config.theme);
  if (config.layout === "modern") {
    return <EventLandingModern event={event} config={config} sections={sections} theme={theme} />;
  }
  return <EventLanding event={event} config={config} sections={sections} theme={theme} schedule={formatEventSchedule(event)} />;
}
