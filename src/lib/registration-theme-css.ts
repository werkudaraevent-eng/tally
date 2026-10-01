import type { CSSProperties } from "react";
import { mixHex, parseHex } from "./color";
import { DEFAULT_REGISTRATION_SEED, buildRegistrationThemeRoles, type RegistrationFormTheme, type RegistrationThemeRoles } from "./registration-theme";

/**
 * Tema mana yang dipakai halaman pendaftaran sebuah acara.
 *
 * Satu tempat, dipakai halaman publik DAN pratinjau di CMS. Aturan yang hidup di
 * dua tempat akan berbeda pendapat, dan yang terlihat admin adalah pratinjau
 * berwarna A sementara pendaftarnya melihat warna B.
 */
export function resolveFormTheme(
  formTheme: RegistrationFormTheme | undefined,
  landingTheme: RegistrationFormTheme | undefined,
): RegistrationFormTheme | undefined {
  const pakaiSendiri = Boolean(formTheme?.seed) && formTheme?.inherit !== true;
  return pakaiSendiri ? formTheme : (landingTheme ?? formTheme);
}

/**
 * Mengubah peran warna form menjadi variabel CSS untuk dipasang di elemen
 * pembungkus halaman pendaftaran.
 *
 * Variabelnya berawalan `--reg-`, bukan `--md-sys-color-`. Halaman ini memakai
 * tema milik penyelenggara acara, bukan tema aplikasi, dan menimpa variabel
 * sistem akan ikut mengubah komponen bersama apa pun yang kebetulan dirender di
 * dalamnya — termasuk toast, yang muncul di seluruh aplikasi.
 */
export function registrationThemeStyle(theme: RegistrationFormTheme | undefined): CSSProperties {
  // Peran dihitung ulang di sini HANYA bila konfigurasi lama belum memilikinya.
  // Event yang disimpan sebelum fitur tema ada tidak punya `roles`, dan halaman
  // publiknya tetap harus tampil — bukan gagal render.
  const roles: RegistrationThemeRoles =
    theme?.roles ?? buildRegistrationThemeRoles(theme?.seed ?? DEFAULT_REGISTRATION_SEED, false);

  return {
    "--reg-surface": roles.surface,
    "--reg-field": roles.surface_container,
    "--reg-panel": roles.surface_container_high,
    "--reg-on-surface": roles.on_surface,
    "--reg-on-surface-variant": roles.on_surface_variant,
    "--reg-outline": roles.outline,
    "--reg-outline-variant": roles.outline_variant,
    "--reg-primary": roles.primary,
    "--reg-on-primary": roles.on_primary,
    // Pasangan tonal untuk penanda non-tombol (pil tanggal, angka penting).
    // Fallback ke primary/on-primary karena konfigurasi yang disimpan sebelum
    // kedua peran ini ikut dihitung tetap ada di database — variabel kosong akan
    // membuat teksnya hilang di atas latar yang juga kosong.
    "--reg-primary-container": roles.primary_container ?? roles.primary,
    "--reg-on-primary-container": roles.on_primary_container ?? roles.on_primary,
    "--reg-error": roles.error,
    "--reg-error-soft": roles.error_soft,
    "--reg-on-error-soft": roles.on_error_soft,
    backgroundColor: roles.surface,
    color: roles.on_surface,
  } as CSSProperties;
}

/** Rasio kontras WCAG antara dua warna hex. */
function kontras(a: string, b: string) {
  const lum = (hex: string) => {
    const { r, g, b: bl } = parseHex(hex);
    const kanal = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(bl);
  };
  const [terang, gelap] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (terang + 0.05) / (gelap + 0.05);
}

const TINTA_GELAP = "#181d27";

/** Putih atau tinta gelap, mana yang kontrasnya lebih tinggi di atas `hex`. */
function tintaDiAtas(hex: string) {
  return kontras(hex, "#ffffff") >= kontras(hex, TINTA_GELAP) ? "#ffffff" : TINTA_GELAP;
}

/**
 * Warna untuk tata letak Modern (halaman acara v2 dan formulirnya).
 *
 * Permukaan, teks, dan garis memakai abu-abu netral. Peran permukaan M3
 * diturunkan dari warna merek dan pada biru condong ke ungu muda; Hanung menolak
 * nuansa itu.
 *
 * Warna merek dipakai PERSIS seperti yang dipilih admin, bukan peran `primary`
 * M3. `primary` M3 adalah nada 40 dari palet merek: putih jadi abu-abu gelap,
 * biru terang jadi biru tua yang terbaca ungu. Admin yang memilih putih lalu
 * melihat hero abu-abu tidak punya cara mengerti kenapa.
 *
 * Dua pasangan:
 * - `--reg-brand` / `--reg-on-brand`: bidang lebar (hero tanpa KV, kartu
 *   Sekilas, banner ajakan, kepala formulir). Selalu warna merek apa adanya,
 *   termasuk putih; teksnya putih atau gelap menurut kontras.
 * - `--reg-primary` / `--reg-on-primary`: tombol, tautan, dan ikon di atas
 *   permukaan putih. Warna merek bila cukup kontras dengan putih (3:1); merek
 *   yang terlalu terang (putih, kuning muda) jatuh ke tinta gelap supaya tombol
 *   tidak hilang di atas latar putih.
 */
export function modernThemeStyle(seed: string | undefined): CSSProperties {
  const merek = /^#[0-9a-f]{6}$/i.test(seed ?? "") ? seed! : DEFAULT_REGISTRATION_SEED;
  const aksen = kontras(merek, "#ffffff") >= 3 ? merek : TINTA_GELAP;
  return {
    "--reg-surface": "#ffffff",
    "--reg-field": "#ffffff",
    "--reg-panel": "#f5f5f5",
    "--reg-on-surface": TINTA_GELAP,
    "--reg-on-surface-variant": "#414651",
    "--reg-outline": "#a4a7ae",
    "--reg-outline-variant": "#e9eaeb",
    "--reg-brand": merek,
    "--reg-on-brand": tintaDiAtas(merek),
    "--reg-primary": aksen,
    "--reg-on-primary": tintaDiAtas(aksen),
    "--reg-primary-container": mixHex(aksen, "#ffffff", 0.9),
    "--reg-on-primary-container": TINTA_GELAP,
    backgroundColor: "#ffffff",
    color: TINTA_GELAP,
  } as CSSProperties;
}
