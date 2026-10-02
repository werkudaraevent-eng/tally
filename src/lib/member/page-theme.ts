import type { CSSProperties } from "react";
import type { EventLandingConfig, EventRow } from "@/lib/domain";
import { LANDING_HEADING_FONTS } from "@/lib/domain";
import { modernThemeStyle, registrationThemeStyle } from "@/lib/registration-theme-css";

/**
 * Warna dan huruf judul halaman acara, untuk halaman Masuk dan Area peserta.
 * Keduanya bagian dari halaman acara bagi tamu, jadi memakai tema yang sama.
 *
 * Tata letak Modern dan Forum memakai warna netral halaman acaranya (putih,
 * abu tinta, warna merek apa adanya), ditumpuk di atas palet M3 supaya token
 * yang tidak dimiliki palet netral (--reg-error*) tetap ada. Sama dengan
 * formulir pendaftaran (daftar/page.tsx). Huruf judul bawaannya juga mengikuti
 * tata letak: Source Sans 3 untuk Modern, Ubuntu untuk Forum, serif untuk Editorial.
 */
export function memberPageStyle(event: Pick<EventRow, "landing_config">): CSSProperties {
  const config = (event.landing_config ?? {}) as EventLandingConfig;
  const netral = config.layout === "modern" || config.layout === "forum";
  const bawaan = config.layout === "forum" ? "ubuntu" : config.layout === "modern" ? "source" : "serif";
  const font = LANDING_HEADING_FONTS[config.heading_font ?? bawaan] ?? LANDING_HEADING_FONTS[bawaan];
  return {
    ...registrationThemeStyle(config.theme),
    ...(netral ? modernThemeStyle(config.theme?.seed) : null),
    "--landing-heading": font.cssVar,
  } as CSSProperties;
}
