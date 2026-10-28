import type { EventLandingConfig } from "@/lib/domain";
import { nomorTampil, nomorTelepon } from "@/lib/member/kontak-darurat";

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

/** Paling banyak tiga kontak panitia: `contact_*` lalu `contact_more`. */
export const KONTAK_PANITIA_MAX = 3;
/** Panjang peran atau jabatan, sama dengan catatan pendek kartu darurat. */
export const KONTAK_PERAN_MAX = 60;

export type BarisKontakPanitia = { nama: string | null; peran: string | null; nomor: string | null; email: string | null; tel: string | null; wa: string | null };

/**
 * Semua kontak panitia untuk bagian Kontak halaman acara, urut seperti di
 * Event settings. Kontak tanpa nomor maupun email tidak ikut.
 */
export function daftarKontakPanitia(landing: EventLandingConfig | null | undefined): BarisKontakPanitia[] {
  const semua = [
    { name: landing?.contact_name, role: landing?.contact_role, phone: landing?.contact_phone, email: landing?.contact_email },
    ...(landing?.contact_more ?? []),
  ].slice(0, KONTAK_PANITIA_MAX);
  return semua.flatMap((item) => {
    const nomor = item?.phone?.trim() || null;
    const email = item?.email?.trim() || null;
    if (!nomor && !email) return [];
    const sambung = nomorTelepon(nomor);
    return [{ nama: item?.name?.trim() || null, peran: item?.role?.trim() || null, nomor: nomorTampil(nomor, sambung?.tel), email, tel: sambung?.tel ?? null, wa: sambung?.wa ?? null }];
  });
}
