import { normalizeLandingSections, type EventLandingConfig, type EventRow, type LandingForumPage } from "@/lib/domain";
import { registrationThemeStyle } from "@/lib/registration-theme-css";
import { formatEventSchedule } from "@/lib/event-datetime";
import { landingEnAvailable, resolveLanding, type LandingLang } from "@/lib/landing-i18n";
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
 *
 * `lang`: bahasa halaman. Teks English ditumpuk di atas teks Indonesia di sini
 * (resolveLanding), sekali, sebelum sampai ke tata letak. Hanya Modern yang
 * punya versi English; pemanggil `/en` memastikannya lewat landingEnAvailable.
 */
export function renderLanding(asli: EventRow, halaman: LandingForumPage = "beranda", pratinjau = false, lang: LandingLang = "id") {
  // Forum belum punya versi English (rencana dwibahasa langkah 4); bahasanya
  // diatur sendiri lewat forum.language.
  if ((asli.landing_config as EventLandingConfig | null)?.layout === "forum") return <EventLandingForum event={asli} halaman={halaman} pratinjau={pratinjau} />;
  // Program acara dan Informasi praktis hanya ada di tata letak Forum.
  if (halaman !== "beranda") return null;
  const { event, config } = resolveLanding(asli, lang);
  const sections = normalizeLandingSections(config.sections, config.blocks);
  const theme = registrationThemeStyle(config.theme);
  if (config.layout === "modern") {
    const adaEnglish = landingEnAvailable(config);
    return (
      <EventLandingModern
        event={event}
        config={config}
        sections={sections}
        theme={theme}
        lang={lang}
        otherLang={adaEnglish ? (lang === "en" ? "id" : "en") : null}
      />
    );
  }
  return <EventLanding event={event} config={config} sections={sections} theme={theme} schedule={formatEventSchedule(event)} />;
}
