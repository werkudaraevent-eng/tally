import type { EventLandingConfig } from "@/lib/domain";

/**
 * Kontak panitia untuk halaman peserta (daftar ditutup, undangan, dashboard).
 * Satu sumber: Event settings > Kontak panitia (`landing_config.contact_*`).
 * Email kosong jatuh ke alamat Balasan ke email acara. Null bila tidak ada
 * email maupun telepon.
 */
export function kontakPanitia(landing: EventLandingConfig | null | undefined, balasanKe?: string | null) {
  const nama = landing?.contact_name?.trim() || null;
  const email = landing?.contact_email?.trim() || balasanKe?.trim() || null;
  const telepon = landing?.contact_phone?.trim() || null;
  return email || telepon ? { nama, email, telepon } : null;
}

/** Nomor untuk tautan tel:, tanpa spasi dan tanda baca. */
export const telHref = (telepon: string) => `tel:${telepon.replace(/[^\d+]/g, "")}`;
