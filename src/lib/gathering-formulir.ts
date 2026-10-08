import type { CSSProperties } from "react";
import { publicEventName, type EventLandingConfig, type EventRow } from "@/lib/domain";
import { formatEventDate, formatEventDateRingkas } from "@/lib/event-datetime";
import { LANDING_UI, type LandingLang } from "@/lib/landing-i18n";
import { landingTokens } from "@/lib/landing-tokens";
import { gatheringColors, latarGathering } from "@/lib/registration-theme-css";

/**
 * Formulir pendaftaran acara gaya gathering: warna, fakta, dan kaki yang sama
 * dengan halaman acara gathering (event-landing-modern.tsx), supaya pendaftar
 * yang menekan Daftar tetap berada di "aplikasi" yang sama. Acara lain tidak
 * memanggil berkas ini.
 */
export type FormGathering = {
  /** Variabel CSS gaya gathering (latar hero, warna tombol, teks redup). */
  gaya: CSSProperties;
  /** Tanggal ringkas (warna aksen), tempat, lama menginap: baris fakta hero. */
  fakta: string[];
  /** "© 2026 KSO Sucofindo · 24 Fly Beyond Limits", sama dengan kaki halaman acara. */
  hakCipta: string;
  /** Catatan kaki dari CMS: tagline emas di kanan kaki. */
  tagline: string | null;
};

export function formulirGathering(event: EventRow, lang: LandingLang): FormGathering | null {
  const config = (event.landing_config ?? {}) as EventLandingConfig;
  if (config.layout !== "modern" || config.gathering !== true) return null;
  const t = LANDING_UI[lang];
  const tokens = landingTokens(config, "modern");
  const warna = gatheringColors(tokens.accent ?? undefined, tokens.brand, false, config.button_color);
  const latar = latarGathering(tokens.brand);

  const nama = publicEventName(event);
  const subNama = event.name.trim() && event.name.trim() !== nama ? event.name.trim() : null;
  const tahun = (event.event_date ?? new Date().toISOString()).slice(0, 4);
  const lamaHari = jumlahHari(event.event_date, event.end_date);
  const venue = event.venue_name?.trim() || null;

  return {
    gaya: {
      "--latar-gathering": latar.latar,
      "--hero-redup": latar.redup ?? undefined,
      "--hero-lencana": warna.heroLencana,
      "--hero-angka": warna.heroAngka,
      "--reg-on-surface-variant": warna.teksRedup,
      "--reg-surface": "#ffffff",
      "--alis": warna.aksiTeks,
      "--aksen-teks": warna.aksenTeks,
      "--aksi-putih": warna.ctaPutih,
      "--on-aksi-putih": warna.onCtaPutih,
      // Inter polos seperti halaman acara gathering.
      fontFeatureSettings: "normal",
      fontVariantNumeric: "normal",
      backgroundColor: "#ffffff",
    } as CSSProperties,
    fakta: [formatEventDateRingkas(event, lang) ?? formatEventDate(event, lang), venue, lamaHari ? t.stayLength(lamaHari) : null].filter(
      (teks): teks is string => Boolean(teks),
    ),
    hakCipta: [
      `© ${tahun}`,
      [subNama, nama]
        .filter((teks): teks is string => Boolean(teks))
        .map((teks) => tanpaTahunUjung(teks, tahun))
        .filter((teks, index, semua) => teks && semua.indexOf(teks) === index)
        .join(" · "),
    ]
      .filter(Boolean)
      .join(" "),
    tagline: config.footer_note?.trim() || null,
  };
}

/** Jumlah hari dari tanggal mulai sampai selesai (inklusif). Null bila satu hari atau tanggal tidak lengkap. */
export function jumlahHari(mulai: string | null, selesai: string | null): number | null {
  if (!mulai || !selesai) return null;
  const hari = Math.round((Date.parse(`${selesai}T00:00:00Z`) - Date.parse(`${mulai}T00:00:00Z`)) / 86_400_000) + 1;
  return Number.isFinite(hari) && hari > 1 && hari <= 31 ? hari : null;
}

// Kata sambung yang butuh tahunnya: "Road to 2026" tetap utuh (QA #110 L3).
const SAMBUNG_TAHUN = /\b(to|towards?|for|of|menuju|jelang|ke|untuk)$/i;

/** Buang tahun acara di ujung nama ("KSO Sucofindo 2026" → "KSO Sucofindo"); nama yang hanya tahun menjadi kosong. */
export function tanpaTahunUjung(teks: string, tahun: string): string {
  if (teks.trim() === tahun) return "";
  const cocok = teks.match(new RegExp(`^(.*\\S)\\s+${tahun}$`));
  if (!cocok || SAMBUNG_TAHUN.test(cocok[1])) return teks;
  return cocok[1];
}
