import type { CSSProperties } from "react";
import { gayaPortal } from "@/components/member/dashboard-gathering";
import { HalamanPanitia, type NadaPanitia } from "@/components/member/halaman-panitia";
import { LATAR_PORTAL_HORIZON } from "@/components/member/portal-horizon";
import { gatheringHorizon, type EventLandingConfig, type EventRow } from "@/lib/domain";
import { LANDING_LANG_LABELS, landingDefaultLang, landingPath, type LandingLang } from "@/lib/landing-i18n";
import { memberPageStyle } from "@/lib/member/page-theme";

/**
 * Halaman Kehadiran panitia (`/e/<slug>/peserta?tab=panitia`), berdiri
 * sendiri dengan bilah kembali seperti halaman turunan M3: tidak menambah tab
 * di bilah bawah semua peserta. Warnanya mengikuti portal acara: Horizon dan
 * Trip navy-emas di latar krem, tema lain warna merek di panel tema.
 * Pemanggilnya (app/peserta/page.tsx) sudah memeriksa aksesnya.
 */
export function PanitiaPortal({ event, lang, titik }: { event: EventRow; lang: LandingLang; titik: string | null }) {
  const config = (event.landing_config ?? {}) as EventLandingConfig;
  const gathering = config.layout === "modern" && config.gathering === true;
  const horizon = gathering && gatheringHorizon(config);
  const beranda = `${landingPath(event.slug, lang, landingDefaultLang(config))}/peserta`;
  const dasar = `${beranda}?tab=panitia`;

  const nada: NadaPanitia = horizon
    ? {
        kartu: "rounded-[16px] bg-white ring-1 ring-[rgb(16_30_56/0.12)]",
        redup: "text-[#526078]",
        garis: "border-[#E6E8EC]",
        chip: "bg-[#EEF1F6] text-[#101E38]",
        chipAktif: "bg-[var(--hz-navy)] text-white",
        jalur: "bg-[#E6E9EE]",
        isi: "bg-[var(--hz-emas)]",
        segAktif: "bg-[var(--hz-navy)] text-white",
        kolom: "border-[#C9D1DE] bg-white",
        bilah: "bg-white",
      }
    : {
        kartu: gathering ? "rounded-[20px] bg-white shadow-[0_1px_2px_rgb(16_24_40/0.06)]" : "rounded-lg bg-[var(--reg-panel)]",
        redup: "text-[var(--reg-on-surface-variant)]",
        garis: "border-[var(--reg-outline-variant)]",
        chip: "bg-[color-mix(in_srgb,var(--reg-on-surface)_8%,transparent)]",
        chipAktif: "bg-[var(--reg-brand)] text-white",
        jalur: "bg-[color-mix(in_srgb,var(--reg-on-surface)_10%,transparent)]",
        isi: "bg-[var(--reg-brand)]",
        segAktif: "bg-[var(--reg-brand)] text-white",
        kolom: "border-[var(--reg-outline)] bg-[var(--reg-surface)]",
        bilah: "bg-[var(--reg-surface)]",
      };
  const gaya: CSSProperties = gathering
    ? { ...gayaPortal(config, horizon), ...(horizon ? { backgroundColor: LATAR_PORTAL_HORIZON, color: "#101E38" } : {}) }
    : { ...memberPageStyle(event), backgroundColor: "var(--reg-surface)", color: "var(--reg-on-surface)" };

  return (
    <main lang={LANDING_LANG_LABELS[lang].htmlLang} className="min-h-dvh" style={gaya}>
      <HalamanPanitia slug={event.slug} lang={lang} dasar={dasar} beranda={beranda} titik={titik} nada={nada} />
    </main>
  );
}
