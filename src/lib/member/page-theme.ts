import type { CSSProperties } from "react";
import type { EventLandingConfig, EventRow } from "@/lib/domain";
import { modernThemeStyle, registrationThemeStyle } from "@/lib/registration-theme-css";
import { landingFontStyle, landingTokens } from "@/lib/landing-tokens";

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
  const tokens = landingTokens(config);
  return {
    ...registrationThemeStyle(config.theme),
    // Seed apa adanya, bukan tokens.brand: tanpa seed halaman ini memakai biru
    // bawaan formulir (#2649D0), sedangkan halaman Forum memakai navy bawaannya.
    // Menyamakannya mengubah tampilan, jadi diputuskan di PR tab Theme.
    ...(tokens.layout !== "editorial" ? modernThemeStyle(config.theme?.seed) : null),
    ...landingFontStyle(tokens),
  } as CSSProperties;
}
