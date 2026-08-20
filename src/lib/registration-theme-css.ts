import type { CSSProperties } from "react";
import { DEFAULT_REGISTRATION_SEED, buildRegistrationThemeRoles, type RegistrationFormTheme, type RegistrationThemeRoles } from "./registration-theme";

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
