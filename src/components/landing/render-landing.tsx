import { normalizeLandingSections, type EventLandingConfig, type EventRow, type LandingForumPage } from "@/lib/domain";
import { registrationThemeStyle } from "@/lib/registration-theme-css";
import { formatEventSchedule } from "@/lib/event-datetime";
import { landingDefaultLang, landingEnAvailable, resolveLanding, type LandingLang } from "@/lib/landing-i18n";
import { EventLanding } from "@/components/landing/event-landing";
import { EventLandingModern } from "@/components/landing/event-landing-modern";
import type { MasukMode, MasukSandi } from "@/app/masuk/masuk-client";
import { EventLandingForum } from "@/components/landing/forum/event-landing-forum";

/**
 * Halaman acara dari satu baris event. Dipakai halaman publik dan pratinjau
 * langsung di CMS, supaya keduanya tidak bisa berbeda tampilan.
 *
 * Tiga tata letak, satu sumber data. Editorial tetap bawaan: acara yang tidak
 * pernah memilih tidak berubah tampilannya karena pembaruan.
 *
 * Forum punya tiga halaman (`opsi.halaman`); tata letak lain hanya Beranda, dan
 * halaman lain mengembalikan null. Forum belum dwibahasa (rencana dwibahasa
 * langkah 4): `lang` diabaikan, bahasa labelnya dari forum.language.
 *
 * `lang`: bahasa halaman. Teks English ditumpuk di atas teks Indonesia di sini
 * (resolveLanding), sekali, sebelum sampai ke tata letak. Hanya Modern yang
 * punya versi English; pemanggil `/en` memastikannya lewat landingEnAvailable.
 * Tanpa `lang`: bahasa utama pilihan admin (landingDefaultLang).
 */
export function renderLanding(
  asli: EventRow,
  lang: LandingLang = landingDefaultLang(asli.landing_config as EventLandingConfig),
  opsi: { halaman?: LandingForumPage; pratinjau?: boolean; masukAwal?: MasukMode | null; sandi?: MasukSandi } = {},
) {
  const halaman = opsi.halaman ?? "beranda";
  if ((asli.landing_config as EventLandingConfig | null)?.layout === "forum") {
    return <EventLandingForum event={asli} halaman={halaman} pratinjau={opsi.pratinjau ?? false} />;
  }
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
        masukAwal={opsi.masukAwal ?? null}
        sandi={opsi.sandi ?? null}
        pratinjau={opsi.pratinjau ?? false}
      />
    );
  }
  return <EventLanding event={event} config={config} sections={sections} theme={theme} schedule={formatEventSchedule(event)} />;
}
