import type { CSSProperties } from "react";
import type { EventLandingConfig, EventRow } from "@/lib/domain";
import { LANDING_HEADING_FONTS } from "@/lib/domain";
import { registrationThemeStyle } from "@/lib/registration-theme-css";

/**
 * Warna dan huruf judul halaman acara, untuk halaman Masuk dan Area peserta.
 * Keduanya bagian dari halaman acara bagi tamu, jadi memakai tema yang sama.
 */
export function memberPageStyle(event: Pick<EventRow, "landing_config">): CSSProperties {
  const config = (event.landing_config ?? {}) as EventLandingConfig;
  const font = LANDING_HEADING_FONTS[config.heading_font ?? "serif"] ?? LANDING_HEADING_FONTS.serif;
  return { ...registrationThemeStyle(config.theme), "--landing-heading": font.cssVar } as CSSProperties;
}
