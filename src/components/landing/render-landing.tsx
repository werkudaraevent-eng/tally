import { normalizeLandingSections, type EventRow } from "@/lib/domain";
import { registrationThemeStyle } from "@/lib/registration-theme-css";
import { formatEventSchedule } from "@/lib/event-datetime";
import { landingEnAvailable, resolveLanding, type LandingLang } from "@/lib/landing-i18n";
import { EventLanding } from "@/components/landing/event-landing";
import { EventLandingModern } from "@/components/landing/event-landing-modern";

/**
 * Halaman acara dari satu baris event. Dipakai halaman publik dan pratinjau
 * langsung di CMS, supaya keduanya tidak bisa berbeda tampilan.
 *
 * Dua tata letak, satu sumber data. Editorial tetap bawaan: acara yang tidak
 * pernah memilih tidak berubah tampilannya karena pembaruan.
 *
 * `lang`: bahasa halaman. Teks English ditumpuk di atas teks Indonesia di sini
 * (resolveLanding), sekali, sebelum sampai ke tata letak. Hanya Modern yang
 * punya versi English; pemanggil `/en` memastikannya lewat landingEnAvailable.
 */
export function renderLanding(asli: EventRow, lang: LandingLang = "id") {
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
